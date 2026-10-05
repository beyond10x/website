use serde_json::Value;
use std::{collections::BTreeSet, fs, path::Path};

/// A repository that left the collector for its own project site: no lock entry, an explicit
/// exclusion, no inverse redirect into its own prefix, and every former `/docs/<repository>/`
/// route redirected to the same path below `/<repository>/docs/`.
fn assert_independent_migration(repository: &str, expected: &[&str]) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == repository)
    );
    let roster = fs::read_to_string(root.join("sources.yaml")).unwrap();
    assert!(roster.contains(&format!("repository: {repository}")));
    assert!(roster.contains("independently"));
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    let own = format!("/{repository}/");
    assert!(
        !rows
            .iter()
            .any(|r| r["from"].as_str().unwrap().starts_with(&own)),
        "inverse redirects would create loops"
    );
    let old = format!("/docs/{repository}/");
    let new = format!("/{repository}/docs/");
    let migrated: Vec<_> = rows
        .iter()
        .filter(|r| r["from"].as_str().unwrap().starts_with(&old))
        .collect();
    let actual: BTreeSet<_> = migrated
        .iter()
        .map(|row| row["from"].as_str().unwrap().strip_prefix(&old).unwrap())
        .collect();
    assert_eq!(actual, expected.iter().copied().collect::<BTreeSet<_>>());
    for row in migrated {
        let from = row["from"].as_str().unwrap();
        assert_eq!(row["to"], from.replacen(&old, &new, 1));
    }
    let experiences: Value =
        serde_json::from_slice(&fs::read(root.join("data/experiences.json")).unwrap()).unwrap();
    let experiences = experiences.to_string();
    assert!(experiences.contains(&format!("https://beyond10x.github.io/{repository}/")));
    assert!(!experiences.contains(&format!("https://beyond10x.github.io/docs/{repository}/")));
}
#[test]
fn independent_and_undocumented_repositories_leave_the_collector_roster() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert_eq!(
        lock["sources"].as_array().unwrap().len(),
        23,
        "Metaharness, Substrate and Secrets left for their own sites and Gates has no website documentation"
    );
}
#[test]
fn metaharness_is_independent_and_all_thirteen_document_routes_survive() {
    assert_independent_migration(
        "metaharness",
        &[
            "",
            "control-seam/",
            "frames/",
            "harnesses/b10x/",
            "harnesses/claude/",
            "harnesses/codex/",
            "hermetic/",
            "protocol/commands/",
            "protocol/events/",
            "quickstart/",
            "reference/cli/",
            "reference/library/",
            "status/",
        ],
    );
}
#[test]
fn substrate_is_independent_and_all_fifteen_document_routes_survive() {
    assert_independent_migration(
        "substrate",
        &[
            "",
            "concepts/boundary/",
            "concepts/confinement/",
            "concepts/model/",
            "concepts/operations/",
            "getting-started/",
            "guides/deployment/",
            "guides/mcp-adapter/",
            "guides/run-a-command/",
            "guides/rust-sdk/",
            "guides/storage-and-metrics/",
            "reference/contract/",
            "security/",
            "status/",
            "use-cases/",
        ],
    );
}
#[test]
fn gates_has_no_website_documentation_and_its_former_routes_land_on_the_ecosystem() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "gates")
    );
    let sites: Value =
        serde_json::from_slice(&fs::read(root.join("data/independent-sites.json")).unwrap())
            .unwrap();
    assert!(
        !sites["sites"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "gates"),
        "gates publishes no site of its own either"
    );
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows: Vec<_> = redirects["redirects"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["from"].as_str().unwrap().contains("gates"))
        .map(|r| (r["from"].as_str().unwrap(), r["to"].as_str().unwrap()))
        .collect();
    assert_eq!(
        rows,
        [
            ("/docs/gates/", "/ecosystem/"),
            ("/ecosystem/gates/", "/ecosystem/")
        ]
    );
}
#[test]
fn secrets_is_independent_and_every_former_route_lands_on_its_site() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "secrets")
    );
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows: std::collections::BTreeMap<_, _> = redirects["redirects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| (r["from"].as_str().unwrap(), r["to"].as_str().unwrap_or("")))
        .collect();
    assert!(
        !rows.keys().any(|from| from.starts_with("/secrets/")),
        "inverse redirects would create loops"
    );
    // Every page the unified site published for Secrets (its sitemap on 2026-10-05) still lands.
    for (from, to) in [
        ("/docs/secrets/", "/secrets/docs/"),
        ("/docs/secrets/architecture/", "/secrets/docs/"),
        (
            "/docs/secrets/authentication/",
            "/secrets/docs/authentication/",
        ),
        (
            "/docs/secrets/getting-started/",
            "/secrets/docs/getting-started/",
        ),
        ("/docs/secrets/http-api/", "/secrets/docs/http-api/"),
        ("/docs/secrets/limitations/", "/secrets/docs/status/"),
        ("/docs/secrets/operations/", "/secrets/docs/operations/"),
        ("/docs/secrets/roadmap/", "/secrets/docs/status/"),
        ("/docs/secrets/rust-client/", "/secrets/docs/rust-client/"),
        (
            "/docs/secrets/security-model/",
            "/secrets/docs/security-model/",
        ),
        ("/api/secrets/", "/secrets/docs/http-api/"),
        ("/api/secrets/http-api/", "/secrets/docs/http-api/"),
        ("/ecosystem/secrets/", "/secrets/"),
    ] {
        assert_eq!(rows.get(from), Some(&to), "{from}");
    }
}
#[test]
fn source_roster_is_complete_sorted_and_lock_is_exact_with_private_exclusions() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let roster: Value =
        serde_yaml::from_slice(&fs::read(root.join("sources.yaml")).unwrap()).unwrap();
    let repositories: Vec<&str> = roster["repositories"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(repositories.len(), 23);
    assert!(repositories.contains(&"harness"));
    assert!(!repositories.contains(&"gates"));
    assert!(repositories.contains(&"mandate"));
    let mut sorted = repositories.clone();
    sorted.sort();
    assert_eq!(repositories, sorted);
    assert_eq!(
        roster["compatibilityRepositories"],
        serde_json::json!(["getting-started"])
    );
    assert!(!repositories.contains(&"getting-started"));
    assert!(!repositories.contains(&"bench"));
    assert!(!repositories.contains(&"metaharness"));
    assert!(!repositories.contains(&"substrate"));
    assert!(!repositories.contains(&"secrets"));
    let excluded = roster["excludedRepositories"].as_array().unwrap();
    assert!(!excluded.is_empty());
    let names: Vec<&str> = excluded
        .iter()
        .map(|e| e["repository"].as_str().unwrap())
        .collect();
    let mut sorted_names = names.clone();
    sorted_names.sort();
    assert_eq!(names, sorted_names);
    assert_eq!(
        names
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        names.len()
    );
    let repository_pattern = regex::Regex::new(r"^[a-z0-9][a-z0-9.-]*$").unwrap();
    for entry in excluded {
        let keys: std::collections::BTreeSet<_> = entry
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            std::collections::BTreeSet::from(["manifest", "public", "reason", "repository"])
        );
        let repo = entry["repository"].as_str().unwrap();
        assert!(repository_pattern.is_match(repo));
        assert!(entry["public"].is_boolean());
        assert!(entry["manifest"] == "present" || entry["manifest"] == "absent");
        assert!(entry["reason"].as_str().unwrap().trim().len() >= 40);
        assert!(!repositories.contains(&repo));
        assert_ne!(repo, "getting-started");
    }
    assert!(names.contains(&"bench"));
    assert!(names.contains(&"metaharness"));
    assert!(names.contains(&"substrate"));
    assert!(names.contains(&"secrets"));
    assert!(names.contains(&"gates"));
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert_eq!(lock["schema"], "b10x-sources/v1");
    let sources = lock["sources"].as_array().unwrap();
    if !sources.is_empty() {
        assert_eq!(sources.len(), repositories.len());
        assert_eq!(
            sources
                .iter()
                .map(|s| s["repository"].as_str().unwrap())
                .collect::<Vec<_>>(),
            repositories
        );
        assert!(
            sources
                .iter()
                .all(|s| s["url"] != "https://github.com/beyond10x/bench")
        );
    }
}
