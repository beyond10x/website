use serde_json::json;
use std::{collections::BTreeSet, fs};
use website_tools::{
    facts::{read_json, write_json},
    prepare::append_discovery,
    routes::{IndependentPage, IndependentSite, IndependentSites},
};
#[test]
fn independent_discovery_updates_graph_without_claiming_collected_documents() {
    let root = tempfile::tempdir().unwrap();
    let data = root.path().join(".generated/data");
    fs::create_dir_all(&data).unwrap();
    write_json(&data.join("ecosystem.json"),&json!({"schema":"b10x-docs-registry/v2","surfaces":[{"name":"Harness","key":"harness/docs","repository":{"id":"harness"},"relationships":[]}]})).unwrap();
    write_json(&data.join("dependencies.json"),&json!({"schema":"b10x-public-dependency-graph/v1","nodes":[{"id":"harness","label":"Harness"}],"edges":[]})).unwrap();
    fs::write(data.join("manifests.json"), "[]\n").unwrap();
    fs::write(data.join("document-index.json"), "{\"documents\":[]}\n").unwrap();
    let site = IndependentSite {
        repository: "metaharness".into(),
        origin: "https://beyond10x.github.io".into(),
        base_path: "/metaharness/".into(),
        source_commit: "a".repeat(40),
        provenance_path: "data/independent/site.json".into(),
        provenance_sha256: "b".repeat(64),
        routes_path: "data/independent/routes.json".into(),
        routes_sha256: "c".repeat(64),
        pages: vec![IndependentPage {
            path: "/metaharness/".into(),
            anchors: BTreeSet::new(),
        }],
        surface: json!({"name":"Metaharness","key":"metaharness/docs","canonicalUrl":"https://beyond10x.github.io/metaharness/","repository":{"id":"metaharness"},"relationships":[{"kind":"drives","target":"harness/docs"}]}),
    };
    append_discovery(root.path(), &IndependentSites { sites: vec![site] }).unwrap();
    let graph = read_json(&data.join("dependencies.json")).unwrap();
    assert_eq!(graph["nodes"].as_array().unwrap().len(), 2);
    assert_eq!(
        graph["edges"][0],
        json!({"from":"metaharness","to":"harness","label":"drives"})
    );
    let registry = read_json(&data.join("ecosystem.json")).unwrap();
    assert_eq!(registry["surfaces"][1]["independentDiscovery"], true);
    assert_eq!(
        fs::read_to_string(data.join("manifests.json")).unwrap(),
        "[]\n"
    );
    assert_eq!(
        fs::read_to_string(data.join("document-index.json")).unwrap(),
        "{\"documents\":[]}\n"
    );
}
