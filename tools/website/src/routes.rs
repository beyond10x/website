use crate::facts::{artifact_facts, portable_path, read_json, sha256, write_json};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
use url::Url;

pub const ORIGIN: &str = "https://beyond10x.github.io";
const ROOT_ROUTES: [(&str, &str); 8] = [
    ("/engineering-protocols/", "/ecosystem/aep/"),
    ("/journeys/", "/start/"),
    ("/journeys/build-agents/", "/build/agent-systems/"),
    ("/journeys/operate-services/", "/operate/"),
    ("/journeys/plan-work/", "/start/spec-driven-development/"),
    ("/journeys/specify/", "/start/spec-driven-development/"),
    ("/journeys/understand/", "/learn/safe-agentic-coding/"),
    ("/website/", "/"),
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IndependentPage {
    pub path: String,
    pub anchors: BTreeSet<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IndependentSite {
    pub repository: String,
    pub origin: String,
    pub base_path: String,
    pub source_commit: String,
    pub provenance_path: String,
    pub provenance_sha256: String,
    pub routes_path: String,
    pub routes_sha256: String,
    #[serde(default, skip_serializing)]
    pub pages: Vec<IndependentPage>,
    pub surface: Value,
}
#[derive(Debug, Clone, Default)]
pub struct IndependentSites {
    pub sites: Vec<IndependentSite>,
}
impl IndependentSites {
    pub fn load(root: &Path) -> Result<Self> {
        let value = read_json(&root.join("data/independent-sites.json"))?;
        ensure!(
            value["schema"] == "b10x-independent-sites/v1",
            "invalid independent-sites schema"
        );
        let sites: Vec<IndependentSite> = serde_json::from_value(value["sites"].clone())?;
        let mut result = Self { sites };
        let roster: Value = serde_yaml::from_slice(&fs::read(root.join("sources.yaml"))?)?;
        let lock = read_json(&root.join("sources.lock.json"))?;
        for site in &mut result.sites {
            ensure!(
                roster["excludedRepositories"]
                    .as_array()
                    .context("missing explicit source exclusions")?
                    .iter()
                    .any(|entry| entry["repository"] == site.repository && entry["public"] == true),
                "independent site must be explicitly excluded and public: {}",
                site.repository
            );
            ensure!(
                !lock["sources"]
                    .as_array()
                    .context("invalid source lock")?
                    .iter()
                    .any(|s| s["repository"] == site.repository),
                "independent site {} remains a collected source",
                site.repository
            );
            portable_path(&site.provenance_path)?;
            ensure!(
                site.provenance_path.starts_with("data/independent/"),
                "independent provenance must be retained under data/independent"
            );
            let bytes = fs::read(root.join(&site.provenance_path))?;
            ensure!(
                sha256(&bytes) == site.provenance_sha256,
                "independent provenance digest mismatch for {}",
                site.repository
            );
            let proof: Value = serde_json::from_slice(&bytes)?;
            ensure!(
                proof["schema"] == "b10x-project-site/v1",
                "invalid independent project-site provenance"
            );
            ensure!(
                proof["repository"] == site.repository
                    && proof["commit"] == site.source_commit
                    && proof["baseUrl"] == site.base_path,
                "independent provenance identity mismatch"
            );
            portable_path(&site.routes_path)?;
            ensure!(
                site.routes_path.starts_with("data/independent/"),
                "independent inventory must be retained under data/independent"
            );
            let route_bytes = fs::read(root.join(&site.routes_path))?;
            ensure!(
                sha256(&route_bytes) == site.routes_sha256,
                "independent route inventory digest mismatch"
            );
            let inventory: Value = serde_json::from_slice(&route_bytes)?;
            ensure!(
                inventory["schema"] == "b10x-project-routes/v1"
                    && inventory["repository"] == site.repository
                    && inventory["commit"] == site.source_commit
                    && inventory["baseUrl"] == site.base_path,
                "independent route inventory identity mismatch"
            );
            site.pages = serde_json::from_value(inventory["routes"].clone())?;
        }
        result.validate()?;
        Ok(result)
    }
    pub fn validate(&self) -> Result<()> {
        let mut repositories = BTreeSet::new();
        let mut paths = BTreeSet::new();
        for site in &self.sites {
            ensure!(
                site.repository
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
                    && !site.repository.is_empty(),
                "invalid independent repository"
            );
            ensure!(
                repositories.insert(&site.repository),
                "duplicate independent repository"
            );
            ensure!(
                site.origin == ORIGIN && site.base_path == format!("/{}/", site.repository),
                "independent site origin/base must match its project"
            );
            ensure!(
                site.source_commit.len() == 40
                    && site
                        .source_commit
                        .bytes()
                        .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                    && site.source_commit.chars().any(|c| c != '0'),
                "invalid independent source commit"
            );
            ensure!(
                site.surface["repository"]["id"] == site.repository
                    && site.surface["canonicalUrl"] == format!("{}{}", ORIGIN, site.base_path),
                "independent discovery identity mismatch"
            );
            ensure!(
                !site.pages.is_empty(),
                "independent site has no verified routes"
            );
            for page in &site.pages {
                web_path(&page.path)?;
                ensure!(
                    page.path.starts_with(&site.base_path) && page.path.ends_with('/'),
                    "independent route outside project or noncanonical"
                );
                ensure!(paths.insert(&page.path), "duplicate independent route");
                ensure!(
                    page.anchors
                        .iter()
                        .all(|a| !a.is_empty() && !a.chars().any(char::is_control)),
                    "invalid independent anchor"
                );
            }
            ensure!(
                site.pages.iter().any(|p| p.path == site.base_path),
                "independent landing route missing"
            );
        }
        Ok(())
    }
    pub fn page(&self, path: &str) -> Option<&IndependentPage> {
        let canonical = normalize_route(path);
        self.sites
            .iter()
            .flat_map(|s| &s.pages)
            .find(|p| p.path == canonical)
    }
    pub fn owns_prefix(&self, path: &str) -> bool {
        self.sites
            .iter()
            .any(|s| path == s.base_path.trim_end_matches('/') || path.starts_with(&s.base_path))
    }
    pub fn compatibility(&self) -> BTreeMap<String, String> {
        let mut result = BTreeMap::new();
        for site in &self.sites {
            for page in &site.pages {
                let prefix = format!("/{}/docs/", site.repository);
                if let Some(suffix) = page.path.strip_prefix(&prefix) {
                    result.insert(
                        format!("/docs/{}/{suffix}", site.repository),
                        page.path.clone(),
                    );
                }
            }
            result.insert(
                format!("/ecosystem/{}/", site.repository),
                site.base_path.clone(),
            );
        }
        result
    }
}
pub fn web_path(value: &str) -> Result<()> {
    ensure!(
        value.starts_with('/') && !value.contains("//"),
        "not a safe rooted path: {value}"
    );
    if value != "/" {
        portable_path(value.trim_start_matches('/').trim_end_matches('/'))?;
    }
    Ok(())
}
pub fn normalize_route(value: &str) -> String {
    if value.trim_matches('/').is_empty() {
        "/".into()
    } else {
        format!("/{}/", value.trim_matches('/'))
    }
}
pub fn quarantined_target(path: &str, q: &BTreeSet<String>) -> Option<String> {
    let pattern=regex::Regex::new(r"^(?:https://beyond10x\.github\.io)?/(?:docs|ecosystem|api|components|data|source-assets|updates/field-notes)/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[/?#]|$)").unwrap();
    let capture = pattern.captures(path)?;
    let repo = capture.get(1)?.as_str();
    q.contains(repo)
        .then(|| format!("https://github.com/beyond10x/{repo}"))
}
pub fn quarantined(root: &Path) -> Result<BTreeSet<String>> {
    let p = root.join(".generated/data/quarantine.json");
    if !p.exists() {
        return Ok(BTreeSet::new());
    }
    Ok(serde_json::from_value(
        read_json(&p)?["repositories"].clone(),
    )?)
}
pub fn effective_redirect_map(
    declared: &Value,
    facts: &Value,
    q: &BTreeSet<String>,
    sites: &IndependentSites,
) -> Result<Value> {
    ensure!(
        declared["schema"] == "b10x-redirects/v1" && declared["origin"] == ORIGIN,
        "legacy redirect contract is invalid"
    );
    let routes: BTreeSet<_> = facts["routes"]
        .as_array()
        .context("missing routes")?
        .iter()
        .filter_map(Value::as_str)
        .collect();
    let files: BTreeSet<_> = facts["files"]
        .as_array()
        .context("missing files")?
        .iter()
        .filter_map(|v| v.as_str().or_else(|| v["path"].as_str()))
        .collect();
    let expected = sites.compatibility();
    let mut seen = BTreeSet::new();
    let mut outputs = Vec::new();
    for redirect in declared["redirects"]
        .as_array()
        .context("missing redirects")?
    {
        let from = redirect["from"].as_str().context("missing redirect from")?;
        web_path(from)?;
        ensure!(seen.insert(from), "duplicate legacy redirect {from}");
        ensure!(
            !sites.owns_prefix(from),
            "independent project route still has inverse redirect: {from}"
        );
        match redirect["type"].as_str() {
            Some("alias") => {
                let source = redirect["source"]
                    .as_str()
                    .context("missing alias source")?;
                portable_path(source)?;
                if quarantined_target(&format!("/{source}"), q).is_some() {
                    continue;
                }
                ensure!(
                    files.contains(source),
                    "legacy alias source /{source} is absent from root artifact"
                );
                outputs.push(redirect.clone());
            }
            Some("html") => {
                let to = redirect["to"].as_str().context("missing redirect target")?;
                web_path(to)?;
                let target = if let Some(target) = expected.get(&normalize_route(from)) {
                    ensure!(
                        to == target,
                        "independent compatibility redirect {from} must target {target}"
                    );
                    target.clone()
                } else if sites.page(to).is_some() {
                    to.into()
                } else if sites.owns_prefix(to) {
                    bail!("unverified independent target {to}")
                } else if let Some(target) = quarantined_target(to, q) {
                    target
                } else {
                    let mut candidate = normalize_route(to);
                    while candidate != "/" && !routes.contains(candidate.as_str()) {
                        let trimmed = candidate.trim_end_matches('/');
                        candidate =
                            normalize_route(trimmed.rsplit_once('/').map(|x| x.0).unwrap_or("/"));
                    }
                    if !routes.contains(candidate.as_str()) {
                        let repo = from.trim_start_matches('/').split('/').next().unwrap_or("");
                        candidate = [
                            format!("/docs/{repo}/"),
                            format!("/ecosystem/{repo}/"),
                            "/".into(),
                        ]
                        .into_iter()
                        .find(|p| routes.contains(p.as_str()))
                        .context("no truthful built redirect fallback")?;
                    }
                    candidate
                };
                let mut output = redirect.clone();
                output["to"] = json!(target);
                outputs.push(output);
            }
            _ => bail!("unsupported legacy redirect type"),
        }
    }
    for (from, to) in &expected {
        ensure!(
            outputs.iter().any(|r| r["from"] == *from && r["to"] == *to),
            "missing independent compatibility redirect {from}"
        );
    }
    let mut value = declared.clone();
    value["redirects"] = json!(outputs);
    Ok(value)
}
pub fn effective(root: &Path, build: &Path) -> Result<Value> {
    effective_redirect_map(
        &read_json(&root.join("legacy-routes.json"))?,
        &artifact_facts(build)?,
        &quarantined(root)?,
        &IndependentSites::load(root)?,
    )
}
pub fn write_effective(root: &Path, build: &Path) -> Result<()> {
    let map = effective(root, build)?;
    write_json(&build.join(".well-known/b10x-redirects.json"), &map)?;
    println!(
        "wrote {} effective compatibility routes",
        map["redirects"].as_array().unwrap().len()
    );
    Ok(())
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
pub fn render_redirect(from: &str, to: &str) -> Result<String> {
    web_path(from)?;
    let target = Url::parse(ORIGIN)?.join(to)?;
    // This template preserves the existing Docs System redirect contract, including query/fragment forwarding.
    let script_target = serde_json::to_string(to)?.replace('<', "\\u003c");
    Ok(format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Documentation moved</title>
  <link rel="canonical" href="{}">
  <meta http-equiv="refresh" content="0;url={}">
</head>
<body>
  <main><p>This documentation moved to <a href="{}">{}</a>.</p></main>
  <script>
    const destination = new URL({}, window.location.origin);
    if (!destination.search) destination.search = window.location.search;
    if (!destination.hash) destination.hash = window.location.hash;
    window.location.replace(destination.href);
  </script>
</body>
</html>
"#,
        escape(target.as_str()),
        escape(to),
        escape(to),
        escape(target.as_str()),
        script_target
    ))
}
pub fn write_root(root: &Path, build: &Path) -> Result<()> {
    let declared = read_json(&root.join("legacy-routes.json"))?;
    let sites = IndependentSites::load(root)?;
    let q = quarantined(root)?;
    let mut expected: BTreeMap<String, String> = ROOT_ROUTES
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
    expected.extend(sites.compatibility());
    for (from, to) in &expected {
        let matches: Vec<_> = declared["redirects"]
            .as_array()
            .context("missing redirects")?
            .iter()
            .filter(|r| r["from"] == *from)
            .collect();
        ensure!(
            matches.len() == 1 && matches[0] == &json!({"from":from,"to":to,"type":"html"}),
            "root-owned redirect {from} must exactly target {to}"
        );
    }
    for (from, to) in &expected {
        let target = quarantined_target(to, &q).unwrap_or_else(|| to.clone());
        let html = render_redirect(from, &target)?;
        let file = build.join(from.trim_matches('/')).join("index.html");
        if file.exists() {
            ensure!(
                fs::read_to_string(&file)? == html,
                "root-owned redirect {from} collides with generated site output"
            );
        }
        fs::create_dir_all(file.parent().unwrap())?;
        fs::write(file, html)?;
    }
    println!(
        "materialized {} root-owned compatibility routes",
        expected.len()
    );
    Ok(())
}

pub fn capture(root: &Path) -> Result<()> {
    let sites = IndependentSites::load(root)?;
    let _lease = crate::orchestration::Lease::acquire(root, "legacy route capture", false)?;
    let status = std::process::Command::new("node")
        .arg("scripts/capture-legacy-routes.mjs")
        .current_dir(root)
        .status()?;
    ensure!(status.success(), "legacy route capture exited {status}");
    let path = root.join("legacy-routes.json");
    let mut document = read_json(&path)?;
    let rows = document["redirects"]
        .as_array_mut()
        .context("missing captured redirects")?;
    let compatibility = sites.compatibility();
    rows.retain(|row| {
        row["from"].as_str().is_some_and(|from| {
            !sites.owns_prefix(from) && !compatibility.contains_key(&normalize_route(from))
        })
    });
    rows.extend(
        compatibility
            .into_iter()
            .map(|(from, to)| json!({"from":from,"to":to,"type":"html"})),
    );
    rows.sort_by(|a, b| a["from"].as_str().cmp(&b["from"].as_str()));
    write_json(&path, &document)?;
    println!("captured legacy routes with independent project compatibility preserved");
    Ok(())
}
