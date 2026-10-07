//! Independent artifact verification; original immutable input validators remain authoritative.
use crate::{
    facts::{artifact_facts, canonical_json, read_json, sha256},
    routes::{IndependentSites, effective_redirect_map},
};
use anyhow::{Context, Result, ensure};
use clap::Args;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Args, Debug, Default)]
pub struct VerifyArgs {
    #[arg(long, conflicts_with = "artifact")]
    pub publication: Option<PathBuf>,
    #[arg(long)]
    pub artifact: Option<PathBuf>,
    #[arg(long, conflicts_with = "data")]
    pub website_data: Option<PathBuf>,
    #[arg(long)]
    pub data: Option<PathBuf>,
    #[arg(long)]
    pub website_sha: Option<String>,
}
fn revision(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && value != "0".repeat(40)
}
fn quarantined_route(route: &str, repository: &str) -> bool {
    [
        "docs",
        "ecosystem",
        "api",
        "components",
        "data",
        "source-assets",
        "updates/field-notes",
    ]
    .iter()
    .any(|namespace| {
        let prefix = format!("/{namespace}/{repository}");
        route == prefix
            || route
                .strip_prefix(&prefix)
                .is_some_and(|suffix| suffix.starts_with(['/', '?', '#']))
    })
}
fn bytes(path: &Path) -> Result<Vec<u8>> {
    fs::read(path).with_context(|| format!("reading {}", path.display()))
}
fn node_json(root: &Path, args: &[&str]) -> Result<Value> {
    let output = Command::new("node").args(args).current_dir(root).output()?;
    ensure!(
        output.status.success(),
        "trusted input validator failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}
fn copy_regular_tree(source: &Path, destination: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(source)?;
    ensure!(
        !metadata.is_symlink(),
        "verification data or runtime contains symlink: {}",
        source.display()
    );
    if metadata.is_dir() {
        fs::create_dir_all(destination)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_regular_tree(&entry.path(), &destination.join(entry.file_name()))?;
        }
    } else {
        ensure!(metadata.is_file(), "verification input is not regular");
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, destination)?;
    }
    Ok(())
}
/// Run only the verifier runtime's own scripts. Candidate Website controls are copied as data;
/// neither their scripts nor package metadata are executed. This preserves bundle/schema checks.
fn validate_inputs(
    runtime: &Path,
    data: &Path,
    source_set: Option<&Path>,
    flat: bool,
    explicit_source_set_layout: bool,
) -> Result<()> {
    let scratch = runtime.join(".cache");
    fs::create_dir_all(&scratch)?;
    let temp = tempfile::Builder::new()
        .prefix("verify-inputs-")
        .tempdir_in(scratch)?;
    copy_regular_tree(&runtime.join("scripts"), &temp.path().join("scripts"))?;
    copy_regular_tree(
        &runtime.join("package.json"),
        &temp.path().join("package.json"),
    )?;
    copy_regular_tree(
        &data.join("sources.yaml"),
        &temp.path().join("sources.yaml"),
    )?;
    if source_set.is_none() {
        copy_regular_tree(
            &data.join("sources.lock.json"),
            &temp.path().join("sources.lock.json"),
        )?;
        copy_regular_tree(
            &data.join("data/bootstrap"),
            &temp.path().join("data/bootstrap"),
        )?;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        runtime.join("node_modules").canonicalize()?,
        temp.path().join("node_modules"),
    )?;
    #[cfg(not(unix))]
    copy_regular_tree(
        &runtime.join("node_modules"),
        &temp.path().join("node_modules"),
    )?;
    for script in ["verify-source-lock.mjs", "verify-bootstrap.mjs"] {
        let mut command = Command::new("node");
        command
            .arg(temp.path().join("scripts").join(script))
            .current_dir(temp.path());
        if let Some(set) = source_set {
            command.env("B10X_DOCS_SOURCE_SET", set);
            if explicit_source_set_layout {
                command
                    .env_remove("B10X_BOOTSTRAP_FIXTURE")
                    .env_remove("B10X_SOURCE_WORKSPACE");
            }
        } else if flat {
            command
                .env_remove("B10X_DOCS_SOURCE_SET")
                .env_remove("B10X_SOURCE_WORKSPACE");
        }
        let status = command.status()?;
        ensure!(status.success(), "trusted {script} failed with {status}");
    }
    Ok(())
}
fn deployment(provenance: &Value) -> Value {
    let version = match provenance["schema"].as_str() {
        Some("b10x-website-provenance/v3") => 3,
        Some("b10x-website-provenance/v2") => 2,
        _ => 1,
    };
    let mut result = serde_json::Map::new();
    result.insert(
        "schema".into(),
        json!(format!("b10x-docs-deployment/v{version}")),
    );
    result.insert("websiteCommit".into(), provenance["websiteCommit"].clone());
    if version >= 2 {
        for key in ["atlasControlCommit", "sourceSetSha256"] {
            result.insert(key.into(), provenance[key].clone());
        }
    }
    for key in [
        "sourcesLockSha256",
        "legacyRoutesSha256",
        "routesSha256",
        "artifactSha256",
    ] {
        result.insert(key.into(), provenance[key].clone());
    }
    result.insert(
        "sourceCount".into(),
        json!(
            provenance["sourceCommits"]
                .as_object()
                .map_or(0, |v| v.len())
        ),
    );
    result.insert(
        "routeCount".into(),
        json!(provenance["routes"].as_array().map_or(0, |v| v.len())),
    );
    result.insert(
        "fileCount".into(),
        json!(provenance["files"].as_array().map_or(0, |v| v.len())),
    );
    result.insert(
        "bootstrap".into(),
        json!(version == 1 && provenance["bootstrap"] == true),
    );
    if version == 3 {
        result.insert(
            "quarantinedSources".into(),
            json!(
                provenance["quarantinedSources"]
                    .as_array()
                    .map(|rows| rows
                        .iter()
                        .map(|r| r["repository"].clone())
                        .collect::<Vec<_>>())
                    .unwrap_or_default()
            ),
        );
    }
    Value::Object(result)
}
fn verify_facts(provenance: &Value, facts: &Value) -> Result<()> {
    for key in ["artifactSha256", "routesSha256", "files", "routes"] {
        ensure!(
            provenance[key] == facts[key],
            "provenance {key} does not match the built artifact"
        );
    }
    let routes = facts["routes"].as_array().context("missing routes")?;
    ensure!(
        routes.first() == Some(&json!("/"))
            && routes
                .iter()
                .filter_map(Value::as_str)
                .collect::<BTreeSet<_>>()
                .len()
                == routes.len(),
        "route inventory is not unique and rooted"
    );
    ensure!(
        provenance["sourceCommits"].get("bench").is_none(),
        "private Bench source entered artifact"
    );
    for route in routes.iter().filter_map(Value::as_str) {
        ensure!(
            ![
                "/bench/",
                "/api/bench/",
                "/components/bench/",
                "/docs/bench/",
                "/ecosystem/bench/"
            ]
            .iter()
            .any(|p| route.starts_with(p)),
            "private Bench route entered artifact: {route}"
        );
    }
    Ok(())
}
pub fn run(runtime: &Path, args: &VerifyArgs) -> Result<()> {
    if let Some(sha) = &args.website_sha {
        ensure!(revision(sha), "website-sha must be a nonzero full commit");
    }
    let runtime = runtime.canonicalize()?;
    let data = args
        .website_data
        .as_ref()
        .or(args.data.as_ref())
        .unwrap_or(&runtime)
        .canonicalize()?;
    let mut source_set = std::env::var_os("B10X_DOCS_SOURCE_SET")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    let mut flat = false;
    let build = if let Some(publication) = &args.publication {
        let publication = publication.canonicalize()?;
        let layout = node_json(
            &runtime,
            &[
                "scripts/publication-layout.mjs",
                "resolve",
                "--publication",
                publication.to_str().context("nonutf8 publication")?,
            ],
        )?;
        match layout["schema"].as_str() {
            Some("b10x-publication-layout/v2") => {
                source_set = Some(publication.join("inputs/source-set.json"));
                publication.join("site")
            }
            Some("b10x-publication-layout/v1") => {
                source_set = None;
                flat = true;
                publication
            }
            _ => anyhow::bail!("unknown publication layout"),
        }
    } else {
        args.artifact
            .clone()
            .unwrap_or_else(|| runtime.join("build"))
            .canonicalize()?
    };
    if let Some(set) = &source_set {
        ensure!(set.is_absolute(), "source set must be absolute");
    }
    validate_inputs(
        &runtime,
        &data,
        source_set.as_deref(),
        flat,
        args.publication.is_some() && !flat,
    )?;
    let required = [
        "index.html",
        "vision/index.html",
        "start/index.html",
        "learn/index.html",
        "build/index.html",
        "products/index.html",
        "start/spec-driven-development/index.html",
        "learn/safe-agentic-coding/index.html",
        "learn/from-principle-to-action/index.html",
        "build/agent-systems/index.html",
        "products/evaluate/index.html",
        "operate/index.html",
        "contribute/index.html",
        "updates/index.html",
        "journeys/index.html",
        "ecosystem/index.html",
        "changes/index.html",
        "website/index.html",
        "PROVENANCE.json",
        ".well-known/b10x-docs.json",
        ".well-known/b10x-redirects.json",
        "._b10x/deployment.json",
        "._b10x/quality.json",
        ".well-known/b10x-compatibility-artifacts.json",
        "artifacts/ess/lab/billing_web_realized.wasm",
        "pagefind/pagefind.js",
    ];
    for file in required {
        ensure!(
            build.join(file).is_file(),
            "required build file missing: {file}"
        );
    }
    let provenance_bytes = bytes(&build.join("PROVENANCE.json"))?;
    ensure!(
        provenance_bytes == bytes(&build.join(".well-known/b10x-docs.json"))?,
        "root provenance copies differ"
    );
    let provenance: Value = serde_json::from_slice(&provenance_bytes)?;
    ensure!(
        provenance_bytes == canonical_json(&provenance)?.as_bytes(),
        "provenance is not canonical JSON"
    );
    ensure!(
        provenance["websiteCommit"].as_str().is_some_and(revision),
        "invalid Website commit"
    );
    if let Some(sha) = &args.website_sha {
        ensure!(
            provenance["websiteCommit"] == sha.as_str(),
            "unexpected Website commit"
        );
    }
    let set = source_set
        .as_ref()
        .map(|path| read_json(path))
        .transpose()?;
    let quarantine = set
        .as_ref()
        .is_some_and(|s| s["schema"] == "b10x-docs-source-set/v2");
    let bootstrap = source_set.is_none()
        && std::env::var("B10X_BOOTSTRAP_FIXTURE").ok().as_deref() == Some("1")
        && read_json(&data.join("sources.lock.json"))?["sources"]
            .as_array()
            .is_some_and(Vec::is_empty);
    let schema = if quarantine {
        "b10x-website-provenance/v3"
    } else if set.is_some() {
        "b10x-website-provenance/v2"
    } else {
        "b10x-website-provenance/v1"
    };
    ensure!(
        provenance["schema"] == schema && (provenance["bootstrap"] == true) == bootstrap,
        "invalid provenance mode"
    );
    let mut keys = BTreeSet::from([
        "schema",
        "websiteCommit",
        "sourcesLockSha256",
        "legacyRoutesSha256",
        "routesSha256",
        "artifactSha256",
        "sourceCommits",
        "routes",
        "files",
    ]);
    if set.is_some() {
        keys.extend(["atlasControlCommit", "sourceSetSha256", "sourceBundles"]);
    }
    if quarantine {
        keys.insert("quarantinedSources");
    }
    if bootstrap {
        keys.insert("bootstrap");
    }
    ensure!(
        provenance
            .as_object()
            .context("provenance object")?
            .keys()
            .map(String::as_str)
            .collect::<BTreeSet<_>>()
            == keys,
        "unexpected or missing provenance fields"
    );
    let mut bundles = serde_json::Map::new();
    let lock = if let Some(set) = &set {
        ensure!(
            provenance["websiteCommit"] == set["websiteRuntimeCommit"]
                && provenance["atlasControlCommit"] == set["atlasControlCommit"],
            "source-set revisions differ"
        );
        ensure!(
            provenance["sourceSetSha256"] == sha256(&bytes(source_set.as_ref().unwrap())?),
            "source-set digest differs"
        );
        let parent = source_set
            .as_ref()
            .unwrap()
            .parent()
            .context("source-set parent")?;
        let mut sources = Vec::new();
        for entry in set["sources"].as_array().context("source-set sources")? {
            let repository = entry["repository"].as_str().context("repository")?;
            let bundle = read_json(&parent.join("sources").join(repository).join("bundle.json"))?;
            let collection = read_json(
                &parent
                    .join("sources")
                    .join(repository)
                    .join("collection.json"),
            )?;
            sources.push(json!({"repository":repository,"url":bundle["repository"]["url"],"commit":bundle["commit"],"manifestPath":"b10x.docs.yaml","manifestSha256":bundle["manifestSha256"],"contentSha256":collection["contentSha256"]}));
            let mut value = serde_json::Map::new();
            for key in [
                "bundleSha256",
                "commit",
                "producerRunId",
                "producerRunAttempt",
                "artifactId",
                "artifactDigest",
            ] {
                value.insert(
                    key.into(),
                    if key == "commit" {
                        bundle["commit"].clone()
                    } else {
                        entry[key].clone()
                    },
                );
            }
            for key in ["manifestSha256", "collectionSha256", "contentSha256"] {
                value.insert(key.into(), bundle[key].clone());
            }
            bundles.insert(repository.into(), Value::Object(value));
        }
        ensure!(
            provenance["sourceBundles"] == Value::Object(bundles),
            "source bundles disagree"
        );
        if quarantine {
            ensure!(
                provenance["quarantinedSources"] == set["quarantined"],
                "quarantined sources disagree"
            );
        }
        json!({"schema":"b10x-sources/v1","sources":sources})
    } else {
        read_json(&data.join("sources.lock.json"))?
    };
    let lock_bytes = if set.is_some() {
        canonical_json(&lock)?.into_bytes()
    } else {
        bytes(&data.join("sources.lock.json"))?
    };
    ensure!(
        provenance["sourcesLockSha256"] == sha256(&lock_bytes),
        "source-lock digest differs"
    );
    let commits: serde_json::Map<String, Value> = lock["sources"]
        .as_array()
        .context("lock sources")?
        .iter()
        .map(|s| {
            Ok((
                s["repository"]
                    .as_str()
                    .context("lock repository")?
                    .to_owned(),
                s["commit"].clone(),
            ))
        })
        .collect::<Result<_>>()?;
    ensure!(
        provenance["sourceCommits"] == Value::Object(commits),
        "source commits disagree"
    );
    let legacy_bytes = bytes(&data.join("legacy-routes.json"))?;
    ensure!(
        provenance["legacyRoutesSha256"] == sha256(&legacy_bytes),
        "legacy route digest differs"
    );
    let facts = artifact_facts(&build)?;
    verify_facts(&provenance, &facts)?;
    let quarantined: BTreeSet<String> = set
        .as_ref()
        .and_then(|s| s["quarantined"].as_array())
        .into_iter()
        .flatten()
        .filter_map(|s| s["repository"].as_str().map(str::to_owned))
        .collect();
    for route in facts["routes"]
        .as_array()
        .context("routes")?
        .iter()
        .filter_map(Value::as_str)
    {
        for repo in &quarantined {
            ensure!(
                !quarantined_route(route, repo),
                "quarantined route published: {route}"
            );
        }
    }
    let independent = if data.join("data/independent-sites.json").is_file() {
        IndependentSites::load(&data)?
    } else {
        IndependentSites::default()
    };
    let expected = effective_redirect_map(
        &serde_json::from_slice(&legacy_bytes)?,
        &facts,
        &quarantined,
        &independent,
    )?;
    ensure!(
        bytes(&build.join(".well-known/b10x-redirects.json"))?
            == canonical_json(&expected)?.as_bytes(),
        "effective redirect map differs from declared routes and artifact"
    );
    ensure!(
        bytes(&build.join("._b10x/deployment.json"))?
            == canonical_json(&deployment(&provenance))?.as_bytes(),
        "deployment metadata disagrees with provenance"
    );
    let compatibility = read_json(&build.join(".well-known/b10x-compatibility-artifacts.json"))?;
    ensure!(
        compatibility["schema"] == "b10x-compatibility-artifacts/v1"
            && compatibility["artifacts"]
                .as_array()
                .is_some_and(|a| a.len() == 1),
        "invalid compatibility ledger"
    );
    let frozen = &compatibility["artifacts"][0];
    ensure!(
        frozen["path"] == "static/artifacts/ess/lab/billing_web_realized.wasm"
            && frozen["mediaType"] == "application/wasm",
        "unexpected frozen artifact"
    );
    let wasm = bytes(&build.join("artifacts/ess/lab/billing_web_realized.wasm"))?;
    ensure!(
        frozen["size"] == wasm.len() && frozen["sha256"] == sha256(&wasm),
        "frozen artifact bytes disagree"
    );
    let quality = read_json(&build.join("._b10x/quality.json"))?;
    ensure!(
        quality["schema"] == "b10x-website-quality/v1"
            && quality["status"] == "passed"
            && quality["diagnostics"].as_array().is_some_and(Vec::is_empty),
        "quality report is not passed"
    );
    println!(
        "verified {} routes, {} files and exact publication agreement",
        facts["routes"].as_array().unwrap().len(),
        facts["files"].as_array().unwrap().len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quarantine_covers_every_source_namespace_with_exact_repository_boundaries() {
        for namespace in [
            "docs",
            "ecosystem",
            "api",
            "components",
            "data",
            "source-assets",
            "updates/field-notes",
        ] {
            assert!(quarantined_route(
                &format!("/{namespace}/broken/nested/"),
                "broken"
            ));
            assert!(quarantined_route(&format!("/{namespace}/broken"), "broken"));
            assert!(!quarantined_route(
                &format!("/{namespace}/broken-extra/"),
                "broken"
            ));
        }
        assert!(!quarantined_route("/other/broken/", "broken"));
    }
    #[test]
    fn integrity_rejects_changed_bytes_and_private_routes() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("index.html"), "original").unwrap();
        let original = artifact_facts(dir.path()).unwrap();
        verify_facts(&original, &original).unwrap();
        fs::write(dir.path().join("index.html"), "tampered").unwrap();
        assert!(verify_facts(&original, &artifact_facts(dir.path()).unwrap()).is_err());
        let mut private = original.clone();
        private["routes"] = json!(["/", "/docs/bench/secret/"]);
        assert!(
            verify_facts(&private, &private)
                .unwrap_err()
                .to_string()
                .contains("private Bench")
        );
    }
    #[test]
    fn only_nonzero_lowercase_revisions_are_admitted() {
        assert!(revision("a2af0dc6835d2b798e54c35915a3b7def8836740"));
        assert!(!revision(&"0".repeat(40)));
        assert!(!revision(&"A".repeat(40)));
        assert!(!revision("abc"));
    }
    #[test]
    fn metadata_binds_counts_and_quarantine() {
        let value = json!({"schema":"b10x-website-provenance/v3","websiteCommit":"abc","sourceCommits":{"ess":"abc"},"routes":["/"],"files":[{},{}],"quarantinedSources":[{"repository":"broken"}]});
        let output = deployment(&value);
        assert_eq!(output["schema"], "b10x-docs-deployment/v3");
        assert_eq!(output["fileCount"], 2);
        assert_eq!(output["routeCount"], 1);
        assert_eq!(output["sourceCount"], 1);
        assert_eq!(output["quarantinedSources"], json!(["broken"]));
    }
}
