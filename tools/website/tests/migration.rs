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
        21,
        "Metaharness, Substrate, Secrets, LLM and Connectors left for their own sites and Gates has no website documentation"
    );
}
/// Every page of Secrets' site answers its former `/docs/secrets/` path. The site has no
/// architecture, limitations or roadmap page: the overview holds the architecture, and Status holds
/// the limitations and the planned milestone. Its API page replaces the unified API catalog entry.
#[test]
fn secrets_is_independent_and_every_former_route_redirects() {
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
    let roster = fs::read_to_string(root.join("sources.yaml")).unwrap();
    assert!(roster.contains("repository: secrets"));
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    assert!(
        !rows
            .iter()
            .any(|r| r["from"].as_str().unwrap().starts_with("/secrets/")),
        "inverse redirects would create loops"
    );
    let actual: BTreeSet<_> = rows
        .iter()
        .filter(|r| {
            let from = r["from"].as_str().unwrap();
            from.starts_with("/docs/secrets/")
                || from.starts_with("/api/secrets/")
                || from == "/ecosystem/secrets/"
        })
        .map(|r| (r["from"].as_str().unwrap(), r["to"].as_str().unwrap()))
        .collect();
    let expected: BTreeSet<_> = [
        ("/api/secrets/", "/secrets/docs/http-api/"),
        ("/api/secrets/http-api/", "/secrets/docs/http-api/"),
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
        (
            "/docs/secrets/reference/ess/",
            "/secrets/docs/reference/ess/",
        ),
        (
            "/docs/secrets/reference/ess/crossings/",
            "/secrets/docs/reference/ess/crossings/",
        ),
        (
            "/docs/secrets/reference/ess/secrets-custody/",
            "/secrets/docs/reference/ess/secrets-custody/",
        ),
        (
            "/docs/secrets/reference/ess/secrets-storage/",
            "/secrets/docs/reference/ess/secrets-storage/",
        ),
        ("/docs/secrets/roadmap/", "/secrets/docs/status/"),
        ("/docs/secrets/rust-client/", "/secrets/docs/rust-client/"),
        (
            "/docs/secrets/security-model/",
            "/secrets/docs/security-model/",
        ),
        ("/docs/secrets/status/", "/secrets/docs/status/"),
        ("/ecosystem/secrets/", "/secrets/"),
    ]
    .into_iter()
    .collect();
    assert_eq!(actual, expected);
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
/// Every page of LLM's site answers its former `/docs/llm/` path. The unified site's category
/// indexes have no page of their own on the new site: concepts and reference land on their first
/// page, guides on the first guide, and the retired where-this-stands page on Status.
#[test]
fn llm_is_independent_and_every_former_route_redirects() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "llm")
    );
    let roster = fs::read_to_string(root.join("sources.yaml")).unwrap();
    assert!(roster.contains("repository: llm"));
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    assert!(
        !rows
            .iter()
            .any(|r| r["from"].as_str().unwrap().starts_with("/llm/")),
        "inverse redirects would create loops"
    );
    let actual: BTreeSet<_> = rows
        .iter()
        .filter(|r| {
            let from = r["from"].as_str().unwrap();
            from.starts_with("/docs/llm/") || from == "/ecosystem/llm/"
        })
        .map(|r| (r["from"].as_str().unwrap(), r["to"].as_str().unwrap()))
        .collect();
    let same = [
        "",
        "concepts/accounting/",
        "concepts/credentials/",
        "concepts/gateway/",
        "concepts/hosting/",
        "concepts/neutral-boundary/",
        "concepts/overview/",
        "concepts/protocols/",
        "concepts/routing/",
        "getting-started/",
        "guides/call-a-local-endpoint/",
        "guides/call-a-model-with-one-forced-tool/",
        "guides/explain-a-route/",
        "guides/price-recorded-usage/",
        "guides/resolve-a-local-secret/",
        "guides/run-a-local-turn/",
        "guides/run-the-checks/",
        "guides/start-the-gateway/",
        "guides/use-llm-from-a-synchronous-loop/",
        "reference/crates/",
        "reference/formats/",
        "status/",
        "status/limitations/",
        "status/roadmap/",
    ];
    let pairs: Vec<(String, String)> = same
        .iter()
        .map(|page| (format!("/docs/llm/{page}"), format!("/llm/docs/{page}")))
        .chain(
            [
                ("/docs/llm/concepts/", "/llm/docs/concepts/overview/"),
                ("/docs/llm/guides/", "/llm/docs/guides/run-a-local-turn/"),
                ("/docs/llm/reference/", "/llm/docs/reference/crates/"),
                ("/docs/llm/status/where-this-stands/", "/llm/docs/status/"),
                ("/ecosystem/llm/", "/llm/"),
            ]
            .map(|(from, to)| (from.to_owned(), to.to_owned())),
        )
        .collect();
    let expected: BTreeSet<_> = pairs
        .iter()
        .map(|(from, to)| (from.as_str(), to.as_str()))
        .collect();
    assert_eq!(actual, expected);
}
/// Every page of Connectors' site answers its `/docs/connectors/` path, as the independent
/// compatibility contract derives it from the retained route inventory, and so does the
/// unified site's overview. The site has no page at the four other former paths: design and
/// compositions land on the adapter concepts, development on Getting started and the
/// monitoring composition on the adapter reference, each a route of the inventory.
#[test]
fn connectors_is_independent_and_every_former_route_redirects() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "connectors")
    );
    let roster = fs::read_to_string(root.join("sources.yaml")).unwrap();
    assert!(roster.contains("repository: connectors"));
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    assert!(
        !rows
            .iter()
            .any(|r| r["from"].as_str().unwrap().starts_with("/connectors/")),
        "inverse redirects would create loops"
    );
    let actual: BTreeSet<(String, String)> = rows
        .iter()
        .filter(|r| {
            let from = r["from"].as_str().unwrap();
            from.starts_with("/docs/connectors/") || from == "/ecosystem/connectors/"
        })
        .map(|r| {
            assert_eq!(r["type"], "html");
            (
                r["from"].as_str().unwrap().to_owned(),
                r["to"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    let inventory: Value = serde_json::from_slice(
        &fs::read(root.join("data/independent/connectors-routes.json")).unwrap(),
    )
    .unwrap();
    let routes: BTreeSet<_> = inventory["routes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["path"].as_str().unwrap())
        .collect();
    let derived: Vec<(String, String)> = routes
        .iter()
        .filter_map(|path| {
            path.strip_prefix("/connectors/docs/")
                .map(|page| (format!("/docs/connectors/{page}"), (*path).to_owned()))
        })
        .collect();
    assert_eq!(derived.len(), 134);
    let former = [
        (
            "/docs/connectors/compositions/",
            "/connectors/docs/concepts/adapters/",
        ),
        (
            "/docs/connectors/compositions/monitoring/",
            "/connectors/docs/reference/adapters/",
        ),
        (
            "/docs/connectors/design/",
            "/connectors/docs/concepts/adapters/",
        ),
        (
            "/docs/connectors/development/",
            "/connectors/docs/getting-started/",
        ),
        ("/ecosystem/connectors/", "/connectors/"),
    ];
    for (_, to) in former {
        assert!(
            routes.contains(to),
            "{to} is not a route of the Connectors site"
        );
    }
    let expected: BTreeSet<(String, String)> = derived
        .into_iter()
        .chain(
            former
                .iter()
                .map(|(from, to)| ((*from).to_owned(), (*to).to_owned())),
        )
        .collect();
    assert_eq!(actual, expected);
    let experiences = fs::read_to_string(root.join("data/experiences.json")).unwrap();
    assert!(experiences.contains("https://beyond10x.github.io/connectors/"));
    assert!(!experiences.contains("https://beyond10x.github.io/docs/connectors/"));
}
/// Engineering Protocols never had unified documentation. Its own site owns
/// `/engineering-protocols/`, so the root's former redirect of that path to the AEP profile is
/// gone, and each of its documentation pages answers the `/docs/engineering-protocols/` path the
/// independent compatibility contract derives from the retained route inventory.
#[test]
fn engineering_protocols_is_independent_and_owns_its_base_path() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lock: Value =
        serde_json::from_slice(&fs::read(root.join("sources.lock.json")).unwrap()).unwrap();
    assert!(
        !lock["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["repository"] == "engineering-protocols")
    );
    let sites: Value =
        serde_json::from_slice(&fs::read(root.join("data/independent-sites.json")).unwrap())
            .unwrap();
    let site = sites["sites"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["repository"] == "engineering-protocols")
        .expect("engineering-protocols is an independent site");
    assert_eq!(site["basePath"], "/engineering-protocols/");
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows = redirects["redirects"].as_array().unwrap();
    assert!(
        !rows.iter().any(|r| r["from"]
            .as_str()
            .unwrap()
            .starts_with("/engineering-protocols/")),
        "inverse redirects would create loops"
    );
    let actual: BTreeSet<_> = rows
        .iter()
        .filter(|r| {
            let from = r["from"].as_str().unwrap();
            from.starts_with("/docs/engineering-protocols/")
                || from == "/ecosystem/engineering-protocols/"
        })
        .map(|r| (r["from"].as_str().unwrap(), r["to"].as_str().unwrap()))
        .collect();
    let pages = [
        "",
        "category/concepts/",
        "concepts/capabilities-and-bindings/",
        "concepts/composing-cases/",
        "concepts/profiles-and-generated-protocols/",
        "concepts/protocols-and-compositions/",
        "concepts/step-order/",
        "concepts/support-triage/",
        "guides/assertions/",
        "protocols/",
        "protocols/incident-response/1/",
        "protocols/software-change/1/",
        "protocols/support-triage/1/",
        "reference/assertions/",
        "showcase/",
        "status/",
        "vocabulary/",
    ];
    let pairs: Vec<(String, String)> = pages
        .iter()
        .map(|page| {
            (
                format!("/docs/engineering-protocols/{page}"),
                format!("/engineering-protocols/docs/{page}"),
            )
        })
        .chain([(
            "/ecosystem/engineering-protocols/".to_owned(),
            "/engineering-protocols/".to_owned(),
        )])
        .collect();
    let expected: BTreeSet<_> = pairs
        .iter()
        .map(|(from, to)| (from.as_str(), to.as_str()))
        .collect();
    assert_eq!(actual, expected);
}
/// GitHub serves no Pages site at `/els/` since the repository was renamed to
/// `engineering-protocols`, and the root does not redirect the former address.
#[test]
fn the_former_els_address_has_no_redirect() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let redirects: Value =
        serde_json::from_slice(&fs::read(root.join("legacy-routes.json")).unwrap()).unwrap();
    let rows: Vec<_> = redirects["redirects"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["from"].as_str().unwrap().starts_with("/els/"))
        .collect();
    assert!(rows.is_empty(), "{rows:?}");
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
    assert_eq!(repositories.len(), 21);
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
    assert!(!repositories.contains(&"llm"));
    assert!(!repositories.contains(&"connectors"));
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
    assert!(names.contains(&"gates"));
    assert!(names.contains(&"llm"));
    assert!(names.contains(&"connectors"));
    assert!(names.contains(&"engineering-protocols"));
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
