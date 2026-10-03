use serde_json::json;
use std::collections::BTreeSet;
use website_tools::routes::{IndependentSites, effective_redirect_map};
#[test]
fn ordinary_redirects_preserve_nearest_truthful_route() {
    let d = json!({"schema":"b10x-redirects/v1","origin":"https://beyond10x.github.io","redirects":[{"from":"/old/docs/x","to":"/docs/aep/missing/","type":"html"}]});
    let f = json!({"files":[],"routes":["/","/docs/aep/"]});
    assert_eq!(
        effective_redirect_map(&d, &f, &BTreeSet::new(), &IndependentSites::default()).unwrap()["redirects"]
            [0]["to"],
        "/docs/aep/"
    );
}
#[test]
fn private_or_unsafe_redirects_are_refused() {
    let d = json!({"schema":"b10x-redirects/v1","origin":"https://beyond10x.github.io","redirects":[{"from":"/../bad","to":"/","type":"html"}]});
    assert!(
        effective_redirect_map(
            &d,
            &json!({"files":[],"routes":["/"]}),
            &BTreeSet::new(),
            &IndependentSites::default()
        )
        .is_err()
    );
}
#[test]
fn quarantine_covers_every_source_owned_prefix_without_claiming_other_routes() {
    let q = BTreeSet::from(["ess".into()]);
    for prefix in [
        "docs",
        "ecosystem",
        "api",
        "components",
        "data",
        "source-assets",
        "updates/field-notes",
    ] {
        assert_eq!(
            website_tools::routes::quarantined_target(&format!("/{prefix}/ess/x"), &q),
            Some("https://github.com/beyond10x/ess".into())
        );
    }
    assert_eq!(website_tools::routes::quarantined_target("/ess/", &q), None);
}

#[test]
fn independent_snapshot_identity_and_bytes_are_bound_before_route_admission() {
    use website_tools::facts::{sha256, write_json};
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("sources.yaml"),
        "excludedRepositories:\n  - repository: metaharness\n    public: true\n",
    )
    .unwrap();
    let commit = "a".repeat(40);
    let proof = json!({"schema":"b10x-project-site/v1","repository":"metaharness","commit":commit,"baseUrl":"/metaharness/"});
    let inventory = json!({"schema":"b10x-project-routes/v1","repository":"metaharness","commit":commit,"baseUrl":"/metaharness/","routes":[{"path":"/metaharness/","anchors":[]},{"path":"/metaharness/docs/","anchors":["overview"]}]});
    let proof_path = root.path().join("data/independent/site.json");
    let routes_path = root.path().join("data/independent/routes.json");
    write_json(&proof_path, &proof).unwrap();
    write_json(&routes_path, &inventory).unwrap();
    write_json(
        &root.path().join("sources.lock.json"),
        &json!({"sources":[]}),
    )
    .unwrap();
    let mut config = json!({"schema":"b10x-independent-sites/v1","sites":[{"repository":"metaharness","origin":"https://beyond10x.github.io","basePath":"/metaharness/","sourceCommit":commit,"provenancePath":"data/independent/site.json","provenanceSha256":sha256(&std::fs::read(&proof_path).unwrap()),"routesPath":"data/independent/routes.json","routesSha256":sha256(&std::fs::read(&routes_path).unwrap()),"surface":{"repository":{"id":"metaharness"},"canonicalUrl":"https://beyond10x.github.io/metaharness/"}}]});
    let config_path = root.path().join("data/independent-sites.json");
    write_json(&config_path, &config).unwrap();
    assert!(
        IndependentSites::load(root.path())
            .unwrap()
            .page("/metaharness/docs")
            .unwrap()
            .anchors
            .contains("overview")
    );
    let mut corrupted = inventory.clone();
    corrupted["commit"] = json!("b".repeat(40));
    write_json(&routes_path, &corrupted).unwrap();
    assert!(
        IndependentSites::load(root.path())
            .unwrap_err()
            .to_string()
            .contains("digest mismatch")
    );
    config["sites"][0]["routesSha256"] = json!(sha256(&std::fs::read(&routes_path).unwrap()));
    write_json(&config_path, &config).unwrap();
    assert!(
        IndependentSites::load(root.path())
            .unwrap_err()
            .to_string()
            .contains("identity mismatch")
    );
}

#[test]
fn alias_projection_drops_only_quarantined_files_and_refuses_other_missing_bytes() {
    let declared = json!({"schema":"b10x-redirects/v1","origin":"https://beyond10x.github.io","redirects":[{"from":"/aep-service/openapi.json","source":"api/aep-service/http-api/openapi.json","type":"alias","mediaType":"application/json"},{"from":"/feed.xml","source":"releases/rss.xml","type":"alias","mediaType":"application/rss+xml"}]});
    let facts = json!({"routes":["/"],"files":[{"path":"releases/rss.xml"}]});
    let q = BTreeSet::from(["aep-service".into()]);
    let map = effective_redirect_map(&declared, &facts, &q, &IndependentSites::default()).unwrap();
    assert_eq!(map["redirects"].as_array().unwrap().len(), 1);
    assert_eq!(map["redirects"][0]["from"], "/feed.xml");
    assert!(
        effective_redirect_map(
            &declared,
            &facts,
            &BTreeSet::new(),
            &IndependentSites::default()
        )
        .is_err()
    );
    assert!(
        effective_redirect_map(
            &declared,
            &json!({"routes":["/"],"files":[]}),
            &q,
            &IndependentSites::default()
        )
        .is_err()
    );
}
#[test]
fn redirect_template_retains_query_and_fragment_contract_and_escapes_targets() {
    let html = website_tools::routes::render_redirect("/old/", "/docs/aep/").unwrap();
    for fragment in [
        "rel=\"canonical\"",
        "window.location.search",
        "window.location.hash",
        "window.location.replace",
    ] {
        assert!(html.contains(fragment));
    }
    assert!(website_tools::routes::render_redirect("/../outside", "/").is_err());
}
