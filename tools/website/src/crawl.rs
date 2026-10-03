use crate::{
    facts::{artifact_facts, read_json, route_for_file, write_json},
    routes::{IndependentSites, ORIGIN, effective, normalize_route, quarantined},
};
use anyhow::{Context, Result, ensure};
use percent_encoding::percent_decode_str;
use regex::Regex;
use scraper::{Html, Selector};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
use url::Url;

#[derive(Default, Debug)]
struct Markup {
    references: Vec<(String, String)>,
    anchors: BTreeSet<String>,
    inline_css: Vec<String>,
    base: Option<String>,
}
fn parse_markup(source: &str) -> Markup {
    let parsed = Html::parse_document(source);
    let mut result = Markup::default();
    let refresh = Regex::new(r"(?i)(?:^|;)\s*url\s*=\s*(.+)").unwrap();
    for element in parsed.select(&Selector::parse("*").unwrap()) {
        let e = element.value();
        if let Some(id) = e.attr("id") {
            result.anchors.insert(id.into());
        }
        if e.name() == "a"
            && let Some(name) = e.attr("name")
        {
            result.anchors.insert(name.into());
        }
        for (name, value) in e.attrs() {
            if [
                "href",
                "src",
                "poster",
                "action",
                "formaction",
                "data",
                "xlink:href",
            ]
            .contains(&name)
            {
                result.references.push((name.into(), value.into()));
            } else if name == "srcset" {
                for reference in srcset_references(value) {
                    result.references.push((name.into(), reference));
                }
            } else if name == "style" {
                result.inline_css.push(value.into());
            }
        }
        if e.name() == "base" && result.base.is_none() {
            result.base = e.attr("href").map(str::to_owned);
        }
        if e.name() == "meta"
            && e.attr("http-equiv")
                .is_some_and(|v| v.eq_ignore_ascii_case("refresh"))
            && let Some(content) = e.attr("content")
            && let Some(capture) = refresh.captures(content)
        {
            result.references.push((
                "meta-refresh".into(),
                capture[1].trim().trim_matches(['\'', '"']).into(),
            ));
        }
        if e.name() == "style" {
            result.inline_css.push(element.text().collect());
        }
    }
    result
}
pub fn srcset_references(source: &str) -> Vec<String> {
    if source
        .trim_start()
        .to_ascii_lowercase()
        .starts_with("data:")
    {
        return vec![];
    }
    source
        .split(',')
        .filter_map(|s| s.split_whitespace().next().map(str::to_owned))
        .collect()
}
pub fn css_references(source: &str) -> Vec<String> {
    let uncommented = Regex::new(r"(?s)/\*.*?\*/")
        .unwrap()
        .replace_all(source, "");
    let mut references = vec![];
    let urls =
        Regex::new(r#"(?i)\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)]*?))\s*\)"#).unwrap();
    for c in urls.captures_iter(&uncommented) {
        if let Some(m) = c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3)) {
            references.push(m.as_str().trim().into());
        }
    }
    let imports = Regex::new(r#"(?i)@import\s+(?:url\(\s*)?["']([^"']+)["']"#).unwrap();
    for c in imports.captures_iter(&uncommented) {
        references.push(c[1].into());
    }
    references
}
fn decode(value: &str) -> String {
    percent_decode_str(value)
        .decode_utf8()
        .map(|s| s.into_owned())
        .unwrap_or_else(|_| value.into())
}
fn key(value: &str) -> String {
    let decoded = decode(value);
    let trimmed = decoded.trim_matches('/');
    if trimmed.is_empty() {
        "/".into()
    } else {
        format!("/{trimmed}")
    }
}
fn diagnostic(code: &str, context: &str, target: &str) -> Value {
    json!({"code":code,"context":context,"target":target})
}
struct Checker<'a> {
    sites: &'a IndependentSites,
    files: BTreeSet<String>,
    routes: BTreeSet<String>,
    redirects: BTreeMap<String, Value>,
    documents: BTreeMap<String, Markup>,
    public: &'a BTreeSet<String>,
    diagnostics: Vec<Value>,
    references: usize,
    external: usize,
}
impl Checker<'_> {
    fn external(&mut self, url: &Url, context: &str) {
        self.external += 1;
        let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
        if url.host_str() == Some("github.com")
            && parts.first() == Some(&"beyond10x")
            && parts.get(1).is_some_and(|r| !self.public.contains(*r))
        {
            self.diagnostics.push(diagnostic(
                "private-or-uncatalogued-repository",
                context,
                url.as_str(),
            ));
        }
    }
    fn reference(&mut self, raw: &str, base: &Url, context: &str, attribute: Option<&str>) {
        let value = raw.trim();
        if value.is_empty()
            || ["mailto:", "tel:", "data:", "javascript:", "blob:"]
                .iter()
                .any(|s| value.to_ascii_lowercase().starts_with(s))
        {
            return;
        }
        self.references += 1;
        let Ok(url) = base.join(value) else {
            self.diagnostics
                .push(diagnostic("invalid-url", context, value));
            return;
        };
        if url.origin().ascii_serialization() != ORIGIN {
            self.external(&url, context);
            return;
        }
        let mut current = key(url.path());
        let mut seen = BTreeSet::new();
        while let Some(redirect) = self.redirects.get(&current) {
            if !seen.insert(current.clone()) {
                self.diagnostics
                    .push(diagnostic("redirect-cycle", context, url.path()));
                return;
            }
            if redirect["type"] == "alias" {
                let source = redirect["source"].as_str().unwrap_or("");
                if !self.files.contains(source) {
                    self.diagnostics
                        .push(diagnostic("missing-alias-source", context, source));
                }
                if url.fragment().is_some() {
                    self.diagnostics.push(diagnostic(
                        "fragment-on-non-document",
                        context,
                        url.as_str(),
                    ));
                }
                return;
            }
            let target = redirect["to"].as_str().unwrap_or("");
            let Ok(next) = Url::parse(ORIGIN).unwrap().join(target) else {
                self.diagnostics
                    .push(diagnostic("invalid-redirect-target", context, target));
                return;
            };
            if next.origin().ascii_serialization() != ORIGIN {
                self.external(&next, context);
                return;
            }
            current = key(next.path());
        }
        if let Some(page) = self.sites.page(&current) {
            self.external += 1;
            if let Some(hash) = url.fragment().filter(|f| !f.is_empty())
                && !page.anchors.contains(&decode(hash))
            {
                self.diagnostics
                    .push(diagnostic("missing-fragment", context, url.as_str()));
            }
            return;
        }
        if self.sites.owns_prefix(&current) {
            self.diagnostics.push(diagnostic(
                "unverified-independent-target",
                context,
                url.path(),
            ));
            return;
        }
        let relative = current.trim_start_matches('/');
        let route = normalize_route(&current);
        let actual_route = if self.routes.contains(&route) {
            Some(route)
        } else if self.routes.contains(&current) {
            Some(current.clone())
        } else {
            None
        };
        let file = [
            relative.to_owned(),
            format!("{relative}/index.html"),
            relative.trim_end_matches('/').to_owned(),
        ]
        .into_iter()
        .find(|f| self.files.contains(f));
        if actual_route.is_none() && file.is_none() {
            self.diagnostics
                .push(diagnostic("missing-internal-target", context, url.path()));
            return;
        }
        if attribute==Some("href")&&url.path().ends_with('/')&&self.files.contains(url.path().trim_matches('/'))
    &&Regex::new(r"(?i)\.(?:json|xml|pdf|csv|txt|ya?ml|zip|wasm|xlsx?|docx?|mdx?|js|css|map|svg|png|jpe?g|gif|ico)/$").unwrap().is_match(url.path()){
    self.diagnostics.push(diagnostic("asset-extension-trailing-slash",context,url.path()));
  }
        if let Some(hash) = url.fragment().filter(|f| !f.is_empty()) {
            let destination = actual_route.or_else(|| {
                file.as_ref()
                    .filter(|f| f.ends_with(".html") || f.ends_with(".svg"))
                    .map(|f| route_for_file(f))
            });
            if let Some(document) = destination.as_ref().and_then(|r| self.documents.get(r)) {
                if !document.anchors.contains(&decode(hash)) {
                    self.diagnostics.push(diagnostic(
                        "missing-fragment",
                        context,
                        &format!("{}#{hash}", url.path()),
                    ));
                }
            } else {
                self.diagnostics.push(diagnostic(
                    "fragment-on-non-document",
                    context,
                    &format!("{}#{hash}", url.path()),
                ));
            }
        }
    }
}
pub fn crawl_artifact(
    build: &Path,
    redirects: &Value,
    sites: &IndependentSites,
    references: &[(String, String)],
    public_repositories: &BTreeSet<String>,
) -> Result<Value> {
    sites.validate()?;
    let facts = artifact_facts(build)?;
    let files: BTreeSet<String> = facts["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["path"].as_str().unwrap().into())
        .collect();
    let routes: BTreeSet<String> = facts["routes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().into())
        .collect();
    let mut documents = BTreeMap::new();
    let mut html = 0;
    let mut svg = 0;
    let mut css = 0;
    for file in &files {
        if file.ends_with(".html") || file.ends_with(".svg") {
            documents.insert(
                route_for_file(file),
                parse_markup(&fs::read_to_string(build.join(file))?),
            );
            if file.ends_with(".html") {
                html += 1;
            } else {
                svg += 1;
            }
        }
    }
    let map: BTreeMap<String, Value> = redirects["redirects"]
        .as_array()
        .context("invalid redirect map")?
        .iter()
        .map(|r| (key(r["from"].as_str().unwrap_or("")), r.clone()))
        .collect();
    ensure!(
        map.len() == redirects["redirects"].as_array().unwrap().len(),
        "duplicate normalized redirect source"
    );
    let mut checker = Checker {
        sites,
        files: files.clone(),
        routes: routes.clone(),
        redirects: map,
        documents,
        public: public_repositories,
        diagnostics: vec![],
        references: 0,
        external: 0,
    };
    let mut pending = Vec::new();
    for (route, document) in &checker.documents {
        let page = Url::parse(ORIGIN)?.join(route)?;
        let base = match &document.base {
            Some(b) => page.join(b)?,
            None => page,
        };
        for (attribute, value) in &document.references {
            pending.push((
                value.clone(),
                base.clone(),
                format!("{route} {attribute}"),
                Some(attribute.clone()),
            ));
        }
        for css in &document.inline_css {
            for value in css_references(css) {
                pending.push((value, base.clone(), format!("{route} inline CSS"), None));
            }
        }
    }
    for file in &files {
        if file.ends_with(".css") {
            css += 1;
            let base = Url::parse(ORIGIN)?.join(&format!("/{file}"))?;
            for value in css_references(&fs::read_to_string(build.join(file))?) {
                pending.push((value, base.clone(), format!("{file} CSS"), None));
            }
        }
    }
    for (context, value) in references {
        pending.push((value.clone(), Url::parse(ORIGIN)?, context.clone(), None));
    }
    for redirect in redirects["redirects"].as_array().unwrap() {
        if redirect["type"] == "html" {
            pending.push((
                redirect["to"].as_str().context("missing target")?.into(),
                Url::parse(ORIGIN)?,
                format!("redirect {}", redirect["from"].as_str().unwrap_or("")),
                None,
            ));
        } else if !checker
            .files
            .contains(redirect["source"].as_str().unwrap_or(""))
        {
            checker.diagnostics.push(diagnostic(
                "missing-alias-source",
                &format!("alias {}", redirect["from"].as_str().unwrap_or("")),
                redirect["source"].as_str().unwrap_or(""),
            ));
        }
    }
    for (raw, base, context, attribute) in pending {
        checker.reference(&raw, &base, &context, attribute.as_deref());
    }
    checker.diagnostics.sort_by(|a, b| {
        a["code"]
            .as_str()
            .cmp(&b["code"].as_str())
            .then_with(|| a["context"].as_str().cmp(&b["context"].as_str()))
            .then_with(|| a["target"].as_str().cmp(&b["target"].as_str()))
    });
    Ok(
        json!({"schema":"b10x-website-quality/v1","status":if checker.diagnostics.is_empty(){"passed"}else{"failed"},"routeCount":routes.len(),"fileCount":files.len(),"htmlDocuments":html,"svgDocuments":svg,"cssDocuments":css,"redirectsChecked":checker.redirects.len(),"referencesChecked":checker.references,"externalReferences":checker.external,"diagnostics":checker.diagnostics}),
    )
}
fn references(surface: &Value, context: &str, out: &mut Vec<(String, String)>) {
    for (label, value) in [
        ("canonicalUrl", &surface["canonicalUrl"]),
        ("adoption.url", &surface["adoption"]["url"]),
    ] {
        if let Some(url) = value.as_str() {
            out.push((format!("{context} {label}"), url.into()));
        }
    }
    if let Some(sections) = surface["sections"].as_array() {
        for section in sections {
            if let Some(url) = section["url"].as_str() {
                out.push((
                    format!(
                        "{context} section {}",
                        section["label"].as_str().unwrap_or("")
                    ),
                    url.into(),
                ));
            }
        }
    }
}
pub fn run(root: &Path, build: &Path) -> Result<()> {
    let registry = read_json(&root.join(".generated/data/ecosystem.json"))?;
    let manifests = read_json(&root.join(".generated/data/manifests.json"))?;
    let mut refs = vec![];
    let mut public = quarantined(root)?;
    for surface in registry["surfaces"]
        .as_array()
        .context("missing registry surfaces")?
    {
        let repo = surface["repository"]["id"]
            .as_str()
            .context("surface repository missing")?;
        public.insert(repo.into());
        references(surface, repo, &mut refs);
    }
    for manifest in manifests.as_array().context("invalid manifests")? {
        for surface in manifest["surfaces"]
            .as_array()
            .context("missing manifest surfaces")?
        {
            references(
                surface,
                &format!(
                    "{}/{}",
                    manifest["repository"]["id"].as_str().unwrap_or(""),
                    surface["id"].as_str().unwrap_or("")
                ),
                &mut refs,
            );
        }
    }
    let report = crawl_artifact(
        build,
        &read_json(&build.join(".well-known/b10x-redirects.json"))?,
        &IndependentSites::load(root)?,
        &refs,
        &public,
    )?;
    write_json(&build.join("._b10x/quality.json"), &report)?;
    ensure!(
        report["status"] == "passed",
        "artifact crawl failed: {}",
        report["diagnostics"]
    );
    println!(
        "crawled {} routes, {} HTML documents, {} SVG documents, {} stylesheets, and {} references",
        report["routeCount"],
        report["htmlDocuments"],
        report["svgDocuments"],
        report["cssDocuments"],
        report["referencesChecked"]
    );
    Ok(())
}
pub fn navigation(root: &Path, build: &Path) -> Result<()> {
    const PRIMARY: [&str; 13] = [
        "/",
        "/start/",
        "/learn/",
        "/build/",
        "/products/",
        "/operate/",
        "/contribute/",
        "/docs/",
        "/search/",
        "/ecosystem/",
        "/updates/",
        "/releases/",
        "/architecture/",
    ];
    let facts = artifact_facts(build)?;
    let routes = facts["routes"].as_array().unwrap();
    for required in PRIMARY {
        ensure!(
            routes.iter().any(|v| v == required),
            "primary route missing: {required}"
        );
    }
    let registry = read_json(&root.join(".generated/data/ecosystem.json"))?;
    let mut public = quarantined(root)?;
    for surface in registry["surfaces"]
        .as_array()
        .context("registry missing")?
    {
        if let Some(repo) = surface["repository"]["id"].as_str() {
            public.insert(repo.into());
        }
    }
    let report = crawl_artifact(
        build,
        &effective(root, build)?,
        &IndependentSites::load(root)?,
        &[],
        &public,
    )?;
    ensure!(
        report["status"] == "passed",
        "rendered navigation or linked resources failed: {}",
        report["diagnostics"]
    );
    println!(
        "verified {} references across {} HTML pages; {} primary destinations resolve",
        report["referencesChecked"],
        report["htmlDocuments"],
        PRIMARY.len()
    );
    Ok(())
}
