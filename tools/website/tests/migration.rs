use serde_json::Value;
use std::{fs, path::Path};
#[test]
fn metaharness_is_independent_and_all_thirteen_document_routes_survive() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert_eq!(
        lock["sources"].as_array().unwrap().len(),
        26,
        "Metaharness retires from the27-source collector roster"
    );
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "metaharness")
    );
    let roster = fs::read_to_string(root.join("sources.yaml")).unwrap();
    assert!(roster.contains("repository: metaharness"));
    assert!(roster.contains("independently"));
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    assert!(
        !rows
            .iter()
            .any(|r| r["from"].as_str().unwrap().starts_with("/metaharness/")),
        "inverse redirects would create loops"
    );
    let migrated: Vec<_> = rows
        .iter()
        .filter(|r| {
            r["from"]
                .as_str()
                .unwrap()
                .starts_with("/docs/metaharness/")
        })
        .collect();
    let expected = [
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
    ];
    let actual: std::collections::BTreeSet<_> = migrated
        .iter()
        .map(|row| {
            row["from"]
                .as_str()
                .unwrap()
                .strip_prefix("/docs/metaharness/")
                .unwrap()
        })
        .collect();
    assert_eq!(actual, std::collections::BTreeSet::from(expected));
    for row in migrated {
        let from = row["from"].as_str().unwrap();
        assert_eq!(
            row["to"],
            from.replacen("/docs/metaharness/", "/metaharness/docs/", 1)
        );
    }
    assert!(
        rows.iter()
            .any(|r| r["from"] == "/docs/metaharness/harnesses/b10x/")
    );
    let experiences: Value =
        serde_json::from_slice(&fs::read(root.join("data/experiences.json")).unwrap()).unwrap();
    assert!(
        experiences
            .to_string()
            .contains("https://beyond10x.github.io/metaharness/")
    );
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
    assert_eq!(repositories.len(), 26);
    assert!(repositories.contains(&"gates"));
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
