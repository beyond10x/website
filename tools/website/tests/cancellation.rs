use std::{fs, process::Command, time::Duration};
use website_tools::{orchestration::Lease, prepare::run_preparation_child};
#[test]
fn fixture_process_tree() {
    let Ok(mode) = std::env::var("WEBSITE_PREPARATION_FIXTURE") else {
        return;
    };
    let marker = std::env::var("WEBSITE_PREPARATION_MARKER").unwrap();
    if mode == "leaf" {
        fs::write(format!("{marker}.ready"), "ready").unwrap();
        std::thread::sleep(Duration::from_millis(900));
        fs::write(marker, "continued after cancellation").unwrap();
    } else {
        let status = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "fixture_process_tree", "--nocapture"])
            .env("WEBSITE_PREPARATION_FIXTURE", "leaf")
            .status()
            .unwrap();
        assert!(status.success());
    }
}
#[test]
fn loss_of_preview_lease_cancels_preparation_and_its_descendant() {
    let root = tempfile::tempdir().unwrap();
    let marker = root.path().join("late.marker");
    let ready = root.path().join("late.marker.ready");
    let lease = Lease::acquire(root.path(), "preview cancellation test", false).unwrap();
    let lease_path = root.path().join(".b10x-website-generation.json");
    let cancel = std::thread::spawn(move || {
        let start = std::time::Instant::now();
        while !ready.exists() {
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "fixture descendant never became ready"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        fs::remove_file(lease_path).unwrap();
    });
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", "fixture_process_tree", "--nocapture"])
        .env("WEBSITE_PREPARATION_FIXTURE", "tree")
        .env("WEBSITE_PREPARATION_MARKER", &marker);
    let result = run_preparation_child(root.path(), lease.token(), command);
    cancel.join().unwrap();
    std::thread::sleep(Duration::from_millis(1000));
    assert!(
        result.is_err(),
        "lost lease must abort the preparation child"
    );
    assert!(
        !marker.exists(),
        "descendant kept writing after preview cancellation"
    );
}
