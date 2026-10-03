use crate::{
    facts::{read_json, write_json},
    orchestration::Lease,
    routes::{IndependentSites, write_root},
};
use anyhow::{Context, Result, ensure};
use serde_json::json;
use std::{path::Path, process::Command};

pub fn run(root: &Path) -> Result<()> {
    let sites = IndependentSites::load(root)?;
    let lease = Lease::acquire(root, "site preparation", true)?;
    let mut command = Command::new("node");
    command
        .arg("scripts/prepare-site.mjs")
        .current_dir(root)
        .env("B10X_GENERATION_LEASE_TOKEN", lease.token());
    run_preparation_child(root, lease.token(), command)?;
    append_discovery(root, &sites)?;
    // Compatibility files are real root-owned redirects. Independently deployed targets never
    // become placeholder files in this artifact.
    write_root(root, &root.join(".generated/static"))?;
    Ok(())
}
pub fn append_discovery(root: &Path, sites: &IndependentSites) -> Result<()> {
    let file = root.join(".generated/data/ecosystem.json");
    let mut registry = read_json(&file)?;
    let surfaces = registry["surfaces"]
        .as_array_mut()
        .context("generated registry missing surfaces")?;
    for site in &sites.sites {
        ensure!(
            !surfaces
                .iter()
                .any(|s| s["repository"]["id"] == site.repository),
            "independent discovery collides with collected surface"
        );
        let mut surface = site.surface.clone();
        surface["independentDiscovery"] = json!(true);
        surface["independentSourceCommit"] = json!(site.source_commit);
        surface["independentProvenanceSha256"] = json!(site.provenance_sha256);
        surfaces.push(surface);
    }
    surfaces.sort_by(|a, b| a["key"].as_str().cmp(&b["key"].as_str()));
    let mut nodes = std::collections::BTreeMap::new();
    let mut edges = std::collections::BTreeSet::new();
    for surface in registry["surfaces"].as_array().unwrap() {
        let repository = surface["repository"]["id"]
            .as_str()
            .context("surface repository missing")?;
        nodes.insert(repository.to_owned(), surface["name"].clone());
    }
    for surface in registry["surfaces"].as_array().unwrap() {
        let repository = surface["repository"]["id"].as_str().unwrap();
        if let Some(relations) = surface["relationships"].as_array() {
            for relation in relations {
                let kind = relation["kind"]
                    .as_str()
                    .context("relationship kind missing")?;
                let target = relation["target"]
                    .as_str()
                    .context("relationship target missing")?;
                if kind == "documentation-source"
                    || (kind == "supports" && target == "website/docs")
                {
                    continue;
                }
                let target_repository = target.split('/').next().unwrap();
                if nodes.contains_key(target_repository) {
                    edges.insert((
                        repository.to_owned(),
                        target_repository.to_owned(),
                        kind.to_owned(),
                    ));
                }
            }
        }
    }
    let graph = json!({"schema":"b10x-public-dependency-graph/v1", "nodes":nodes.into_iter().map(|(id,label)|json!({"id":id,"label":label})).collect::<Vec<_>>(), "edges":edges.into_iter().map(|(from,to,label)|json!({"from":from,"to":to,"label":label})).collect::<Vec<_>>()});
    write_json(&root.join(".generated/data/dependencies.json"), &graph)?;
    write_json(&root.join(".generated/static/dependencies.json"), &graph)?;
    write_json(&file, &registry)?;
    write_json(&root.join(".generated/static/ecosystem.json"), &registry)?;
    println!(
        "added {} independently published discovery surfaces; collected manifests and document index unchanged",
        sites.sites.len()
    );
    Ok(())
}

pub fn run_preparation_child(root: &Path, token: &str, mut command: Command) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().context("starting source preparation")?;
    loop {
        if let Some(status) = child.try_wait()? {
            ensure!(status.success(), "source preparation exited {status}");
            return Ok(());
        }
        let lease = read_json(&root.join(".b10x-website-generation.json"));
        let alive = lease.as_ref().is_ok_and(|value| {
            value["token"] == token && value["pid"].as_u64().is_some_and(owner_alive)
        });
        if !alive {
            terminate_preparation(&mut child)?;
            anyhow::bail!(
                "source preparation cancelled: generation lease owner or token disappeared"
            );
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
}
fn owner_alive(pid: u64) -> bool {
    #[cfg(unix)]
    {
        let Ok(pid) = i32::try_from(pid) else {
            return false;
        };
        if pid <= 0 {
            return false;
        }
        // Signal0 observes only; the lease's positive owner PID is never signalled here.
        unsafe {
            libc::kill(pid, 0) == 0
                || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
        }
    }
    #[cfg(not(unix))]
    {
        pid > 0
    }
}
fn terminate_preparation(child: &mut std::process::Child) -> Result<()> {
    #[cfg(unix)]
    {
        let group = i32::try_from(child.id())?;
        ensure!(group > 0, "invalid owned preparation process group");
        // The child was started in its own group above. Signal only that owned group,
        // including descendants. Do not reap its leader until escalation prevents PID reuse.
        unsafe {
            libc::kill(-group, libc::SIGTERM);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
        unsafe {
            libc::kill(-group, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .status()?;
        ensure!(
            status.success(),
            "could not stop owned preparation process tree"
        );
    }
    let _ = child.wait()?;
    Ok(())
}
