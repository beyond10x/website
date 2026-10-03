use serde_json::json;
use std::{collections::BTreeSet, fs};
use website_tools::{
    crawl::crawl_artifact,
    routes::{IndependentPage, IndependentSite, IndependentSites},
};
fn sites() -> IndependentSites {
    IndependentSites {
        sites: vec![IndependentSite {
            repository: "metaharness".into(),
            origin: "https://beyond10x.github.io".into(),
            base_path: "/metaharness/".into(),
            source_commit: "a".repeat(40),
            provenance_path: "data/independent/metaharness.json".into(),
            provenance_sha256: "b".repeat(64),
            routes_path: "data/independent/routes.json".into(),
            routes_sha256: "c".repeat(64),
            surface: json!({"repository":{"id":"metaharness"},"canonicalUrl":"https://beyond10x.github.io/metaharness/"}),
            pages: vec![
                IndependentPage {
                    path: "/metaharness/".into(),
                    anchors: BTreeSet::new(),
                },
                IndependentPage {
                    path: "/metaharness/docs/".into(),
                    anchors: BTreeSet::from(["answer".into()]),
                },
            ],
        }],
    }
}
#[test]
fn independent_exact_routes_and_anchors_pass_without_fake_local_files() {
    let t = tempfile::tempdir().unwrap();
    fs::write(
        t.path().join("index.html"),
        "<a href='/metaharness/docs/?q=x#answer'>Docs</a>",
    )
    .unwrap();
    let map = json!({"redirects":[]});
    let report = crawl_artifact(t.path(), &map, &sites(), &[], &BTreeSet::new()).unwrap();
    assert_eq!(report["status"], "passed");
}
#[test]
fn independent_missing_page_and_fragment_are_not_exempt() {
    let t = tempfile::tempdir().unwrap();
    fs::write(t.path().join("index.html"),"<a href='/metaharness/docs/missing/'>Broken</a><a href='/metaharness/docs/#missing'>Broken anchor</a>").unwrap();
    let report = crawl_artifact(
        t.path(),
        &json!({"redirects":[]}),
        &sites(),
        &[],
        &BTreeSet::new(),
    )
    .unwrap();
    assert_eq!(report["status"], "failed");
    assert_eq!(report["diagnostics"].as_array().unwrap().len(), 2);
}
#[test]
fn redirects_are_followed_and_cycles_refused() {
    let t = tempfile::tempdir().unwrap();
    fs::write(t.path().join("index.html"), "<a href='/old/'>Docs</a>").unwrap();
    let good = json!({"redirects":[{"from":"/old/","to":"/metaharness/docs/","type":"html"}]});
    assert_eq!(
        crawl_artifact(t.path(), &good, &sites(), &[], &BTreeSet::new()).unwrap()["status"],
        "passed"
    );
    let bad = json!({"redirects":[{"from":"/old/","to":"/old/","type":"html"}]});
    assert_eq!(
        crawl_artifact(t.path(), &bad, &sites(), &[], &BTreeSet::new()).unwrap()["diagnostics"][0]
            ["code"],
        "redirect-cycle"
    );
}
#[test]
fn html_svg_css_srcset_refresh_and_fragments_are_all_checked() {
    let t = tempfile::tempdir().unwrap();
    fs::create_dir(t.path().join("assets")).unwrap();
    fs::write(t.path().join("index.html"),"<meta http-equiv='refresh' content='120;url=/#answer'><h1 id='answer'>Answer</h1><style>.a{background:url('/assets/p.svg#mark')}</style><img srcset='/assets/p.svg 1x,/assets/p.svg 2x'><link href='/assets/site.css' rel='stylesheet'>").unwrap();
    fs::write(
        t.path().join("assets/p.svg"),
        "<svg><g id='mark'><a xlink:href='/#answer'>Answer</a></g></svg>",
    )
    .unwrap();
    fs::write(
        t.path().join("assets/site.css"),
        "@import 'second.css';.a{background:url(p.svg#mark)}",
    )
    .unwrap();
    fs::write(t.path().join("assets/second.css"), "").unwrap();
    let report = crawl_artifact(
        t.path(),
        &json!({"redirects":[]}),
        &IndependentSites::default(),
        &[],
        &BTreeSet::new(),
    )
    .unwrap();
    assert_eq!(report["status"], "passed", "{report}");
    assert_eq!(report["svgDocuments"], 1);
    assert_eq!(report["cssDocuments"], 2);
    assert!(report["referencesChecked"].as_u64().unwrap() >= 8);
    fs::write(
        t.path().join("assets/p.svg"),
        "<svg><g id='mark'><a xlink:href='/#missing'>Bad</a></g></svg>",
    )
    .unwrap();
    assert_eq!(
        crawl_artifact(
            t.path(),
            &json!({"redirects":[]}),
            &IndependentSites::default(),
            &[],
            &BTreeSet::new()
        )
        .unwrap()["status"],
        "failed"
    );
}
