//! Preserve the existing generation lease and gate order while using Rust route checks.
use crate::facts::{canonical_json, read_json};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};

pub struct Lease {
    path: PathBuf,
    document: Value,
    borrowed: bool,
}
impl Lease {
    pub fn acquire(root: &Path, owner: &str, borrow: bool) -> Result<Self> {
        let path = root.join(".b10x-website-generation.json");
        if path.exists() {
            let held = read_json(&path)?;
            let token = held["token"]
                .as_str()
                .context("invalid generation lease token")?;
            ensure!(
                held["schema"] == "b10x-website-generation-lease/v1"
                    && held["pid"]
                        .as_u64()
                        .is_some_and(|p| p > 0 && p <= 9_007_199_254_740_991)
                    && held.get("childPid").is_none_or(|v| v
                        .as_u64()
                        .is_some_and(|p| p > 0 && p <= 9_007_199_254_740_991))
                    && held["owner"].as_str().is_some_and(|s| !s.is_empty())
                    && uuid::Uuid::parse_str(token).is_ok_and(|id| id.get_version_num() == 4
                        && id.get_variant() == uuid::Variant::RFC4122
                        && id.to_string() == token),
                "invalid Website generation lease; inspect before removing it"
            );
            if borrow && std::env::var("B10X_GENERATION_LEASE_TOKEN").ok().as_deref() == Some(token)
            {
                return Ok(Self {
                    path,
                    document: held,
                    borrowed: true,
                });
            }
            bail!(
                "Website generation lease held by {} (pid {}); inspect {} before starting {owner}",
                held["owner"],
                held["pid"],
                path.display()
            );
        }
        let document = json!({"schema":"b10x-website-generation-lease/v1","pid":std::process::id(),"owner":owner,"token":uuid::Uuid::new_v4().to_string(),"startedAt":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true)});
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .context("claiming exclusive Website generation lease")?;
        file.write_all(canonical_json(&document)?.as_bytes())?;
        Ok(Self {
            path,
            document,
            borrowed: false,
        })
    }
    pub fn token(&self) -> &str {
        self.document["token"].as_str().expect("validated token")
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if !self.borrowed
            && let Ok(held) = read_json(&self.path)
            && ["pid", "owner", "token"]
                .iter()
                .all(|key| held[key] == self.document[key])
        {
            let _ = fs::remove_file(&self.path);
        }
    }
}
fn child(root: &Path, lease: &Lease, program: &str, args: &[&str], borrow: bool) -> Result<()> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(root)
        .env_remove("B10X_GENERATION_LEASE_TOKEN");
    if borrow {
        command.env("B10X_GENERATION_LEASE_TOKEN", lease.token());
    }
    let status = command
        .status()
        .with_context(|| format!("starting {program} {}", args.join(" ")))?;
    ensure!(
        status.success(),
        "{program} {} exited {status}",
        args.join(" ")
    );
    Ok(())
}
pub fn run(root: &Path, mode: &str, extra: &[String]) -> Result<()> {
    let gate = mode == "gate";
    if gate {
        let forbidden: Vec<_> = std::env::vars_os()
            .filter_map(|(k, _)| k.to_str().map(str::to_owned))
            .filter(|k| k == "B10X_LOCAL_PREVIEW" || k.starts_with("B10X_PREVIEW_"))
            .collect();
        ensure!(
            forbidden.is_empty(),
            "production gate refuses local-preview environment: {}",
            forbidden.join(", ")
        );
    }
    let lease = Lease::acquire(root, mode, !gate)?;
    if matches!(mode, "build-site" | "clear") {
        let verb = if mode == "clear" { "clear" } else { "build" };
        let mut args = vec!["node_modules/@docusaurus/core/bin/docusaurus.mjs", verb];
        args.extend(extra.iter().map(String::as_str));
        return child(root, &lease, "node", &args, false);
    }
    ensure!(
        matches!(mode, "gate" | "build") && extra.is_empty(),
        "invalid complete build arguments"
    );
    let run_npm = |name: &str, borrow: bool| child(root, &lease, "npm", &["run", name], borrow);
    if gate {
        child(
            root,
            &lease,
            "cargo",
            &[
                "fmt",
                "--manifest-path",
                "tools/website/Cargo.toml",
                "--check",
            ],
            false,
        )?;
        child(
            root,
            &lease,
            "cargo",
            &[
                "clippy",
                "--locked",
                "--manifest-path",
                "tools/website/Cargo.toml",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
            false,
        )?;
        child(
            root,
            &lease,
            "cargo",
            &[
                "test",
                "--locked",
                "--manifest-path",
                "tools/website/Cargo.toml",
            ],
            false,
        )?;
        run_npm("sources:verify", false)?;
        run_npm("bootstrap:verify", false)?;
        run_npm("validate:experiences", false)?;
        child(root, &lease, "npm", &["test"], true)?;
        child(
            root,
            &lease,
            "npm",
            &["audit", "--audit-level=critical"],
            false,
        )?;
    }
    run_npm("prepare:site", true)?;
    child(
        root,
        &lease,
        "node",
        &["scripts/code-contract.mjs", "source"],
        true,
    )?;
    if gate {
        run_npm("typecheck", false)?;
    }
    run_npm("build:site", true)?;
    if !gate {
        child(
            root,
            &lease,
            "node",
            &["scripts/code-contract.mjs", "build"],
            true,
        )?;
    }
    run_npm("redirects:root", false)?;
    run_npm("verify:navigation", false)?;
    if gate {
        child(
            root,
            &lease,
            "node",
            &["scripts/code-contract.mjs", "build"],
            false,
        )?;
    }
    run_npm("index:search", false)?;
    run_npm("verify:search", false)?;
    if gate {
        run_npm("audit:navigation-layout", false)?;
    }
    run_npm("redirects:effective", false)?;
    run_npm("crawl", false)?;
    child(
        root,
        &lease,
        "node",
        &["scripts/write-provenance.mjs"],
        false,
    )?;
    if gate {
        run_npm("verify:build", false)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lease_is_exclusive_and_only_owner_removes_it() {
        let dir = tempfile::tempdir().unwrap();
        let lease = Lease::acquire(dir.path(), "first", false).unwrap();
        assert!(Lease::acquire(dir.path(), "second", false).is_err());
        assert_eq!(
            read_json(&dir.path().join(".b10x-website-generation.json")).unwrap()["owner"],
            "first"
        );
        drop(lease);
        assert!(!dir.path().join(".b10x-website-generation.json").exists());
    }
    #[test]
    fn replacing_owner_preserves_replacement_on_drop() {
        let dir = tempfile::tempdir().unwrap();
        let lease = Lease::acquire(dir.path(), "first", false).unwrap();
        let path = dir.path().join(".b10x-website-generation.json");
        let mut replacement = read_json(&path).unwrap();
        replacement["token"] = json!(uuid::Uuid::new_v4().to_string());
        fs::write(&path, canonical_json(&replacement).unwrap()).unwrap();
        drop(lease);
        assert_eq!(read_json(&path).unwrap(), replacement);
    }
}
