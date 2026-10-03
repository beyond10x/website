use anyhow::{Result, bail};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read_json(path: &Path) -> Result<Value> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
pub fn canonical_json(value: &Value) -> Result<String> {
    Ok(format!("{}\n", serde_json::to_string_pretty(value)?))
}
pub fn write_json(path: &Path, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(fs::write(path, canonical_json(value)?)?)
}
pub fn portable_path(value: &str) -> Result<()> {
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || value.starts_with('/')
        || value.contains(['\\', '?', '#'])
        || value.chars().any(char::is_control)
        || ["%2e", "%2f", "%5c"].iter().any(|s| lower.contains(s))
        || value.split('/').any(|s| {
            s.is_empty()
                || matches!(s, "." | "..")
                || [".git", ".gitattributes", ".gitignore"]
                    .contains(&s.to_ascii_lowercase().as_str())
        })
    {
        bail!("not a portable artifact path: {value}");
    }
    Ok(())
}
pub fn route_for_file(file: &str) -> String {
    if file == "index.html" {
        "/".into()
    } else if let Some(p) = file.strip_suffix("/index.html") {
        format!("/{p}/")
    } else {
        format!("/{file}")
    }
}
pub fn artifact_facts(build: &Path) -> Result<Value> {
    fn walk(root: &Path, current: &Path, files: &mut Vec<Value>) -> Result<()> {
        for entry in fs::read_dir(current)? {
            let path = entry?.path();
            let metadata = fs::symlink_metadata(&path)?;
            if metadata.is_symlink() {
                bail!("artifact contains symbolic link {}", path.display());
            }
            if metadata.is_dir() {
                walk(root, &path, files)?;
            } else if metadata.is_file() {
                let relative = path
                    .strip_prefix(root)?
                    .to_str()
                    .ok_or_else(|| anyhow::anyhow!("non-UTF8 artifact path"))?;
                portable_path(relative)?;
                if [
                    "PROVENANCE.json",
                    ".well-known/b10x-docs.json",
                    "._b10x/deployment.json",
                ]
                .contains(&relative)
                {
                    continue;
                }
                let bytes = fs::read(&path)?;
                files.push(json!({"path":relative,"sha256":sha256(&bytes),"size":bytes.len()}));
            } else {
                bail!("artifact contains non-regular entry {}", path.display());
            }
        }
        Ok(())
    }
    let mut files = vec![];
    walk(build, build, &mut files)?;
    files.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    let mut routes: Vec<String> = files
        .iter()
        .filter_map(|f| f["path"].as_str())
        .filter(|f| f.ends_with(".html") && *f != "404.html")
        .map(route_for_file)
        .collect();
    routes.sort();
    let inventory = files
        .iter()
        .map(|f| {
            format!(
                "{}  {}\n",
                f["sha256"].as_str().unwrap(),
                f["path"].as_str().unwrap()
            )
        })
        .collect::<String>();
    let route_inventory = format!("{}\n", routes.join("\n"));
    Ok(
        json!({"files":files,"routes":routes,"artifactSha256":sha256(inventory.as_bytes()),"routesSha256":sha256(route_inventory.as_bytes())}),
    )
}
