use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use website_tools::{crawl, orchestration, prepare, routes, verify};
#[derive(Parser)]
#[command(about = "Build and verify Website with explicit independent project routes")]
struct Cli {
    #[arg(long, global = true, default_value = ".")]
    root: PathBuf,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    CaptureRoutes,
    RootRedirects,
    EffectiveRedirects,
    Navigation,
    Crawl,
    Prepare,
    VerifyBuild(verify::VerifyArgs),
    Gate,
    Build,
    BuildSite {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        extra: Vec<String>,
    },
    Clear {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        extra: Vec<String>,
    },
}
fn main() -> Result<()> {
    let args = Cli::parse();
    let root = args.root.canonicalize()?;
    let build = root.join("build");
    match args.command {
        Command::CaptureRoutes => routes::capture(&root),
        Command::RootRedirects => routes::write_root(&root, &build),
        Command::EffectiveRedirects => routes::write_effective(&root, &build),
        Command::Navigation => crawl::navigation(&root, &build),
        Command::Crawl => crawl::run(&root, &build),
        Command::Prepare => prepare::run(&root),
        Command::VerifyBuild(args) => verify::run(&root, &args),
        Command::Gate => orchestration::run(&root, "gate", &[]),
        Command::Build => orchestration::run(&root, "build", &[]),
        Command::BuildSite { extra } => orchestration::run(&root, "build-site", &extra),
        Command::Clear { extra } => orchestration::run(&root, "clear", &extra),
    }
}
