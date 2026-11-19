// ── Remote "mho" installation ───────────────────────────────────────────
//
// Everything that actually installs mho — download, extraction, deployment
// and remote `strip`/`upx` — is delegated to `easy-install` (`ei`), which can
// write straight to a remote host over SSH. This module only:
//
//   * translates UI parameters into an `InstallConfig`,
//   * runs the two small probes the UI needs (is mho present? is the target
//     directory usable?).

use easy_install::{InstallConfig, RemoteConfig, ei};
use github_proxy::Proxy;
use guess_target::Target;
use serde::Serialize;
use sssh::Client;
use std::str::FromStr;
use std::time::Duration;

use crate::platform;
use crate::ssh::ConnectParams;

/// Options shown in the install UI come straight from `ei`, so the two
/// projects cannot drift apart.
pub(crate) use easy_install::{PROXIES, default_target};

/// Repository that publishes the full mho bundle (binary + default config
/// + base assets).
const BUNDLE_REPO: &str = "ahaoboy/mho-assets";
/// Release tag of the nightly bundle.
const BUNDLE_TAG: &str = "nightly";
/// Branch the bundle is also committed to.
///
/// Repo-hosted archives work with *every* proxy: jsDelivr and Statically only
/// mirror repo files, so `/releases/download/` URLs are rejected there.
const BUNDLE_REF: &str = "main";
const BINARY: &str = "mho";

/// Warm-up budget for the whole install (download + upload to the remote).
const INSTALL_TIMEOUT_SECS: u64 = 900;

/// Free space a fresh install is expected to need; the bundle is ~20 MB and
/// the extracted binary a few MB more.
///
/// Only used for the advisory warning — `ei` performs the authoritative check
/// against the real extracted file list and fails with a clear error when the
/// write genuinely does not fit.
const BUNDLE_MIN_BYTES: u64 = 24 * 1024 * 1024;

/// Targets published as `mho-full-<target>.tar.xz` in the bundle release.
///
/// Unlike `ei::SUPPORTED_TARGETS` (every triple a release *could* use), this is
/// the concrete asset list, so the UI cannot offer a target that 404s.
pub(crate) const TARGETS: &[&str] = &[
    "x86_64-unknown-linux-musl",
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-musl",
    "aarch64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-pc-windows-gnu",
];

/// Bundle sources offered in the UI.
pub(crate) const SOURCES: &[&str] = &["repo", "release"];

/// Where the bundle is downloaded from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BundleSource {
    /// Archive committed to the repo (`main`). Works with every proxy.
    Repo,
    /// GitHub release asset (`nightly`). Release-only mirrors work here.
    Release,
}

impl BundleSource {
    /// Parse the UI value; anything empty or unknown means the repo copy,
    /// which is the most compatible choice.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "" | "repo" => Some(Self::Repo),
            "release" => Some(Self::Release),
            _ => None,
        }
    }
}

/// Download URL of the bundle for `target`.
fn bundle_url(source: BundleSource, target: &str) -> String {
    match source {
        BundleSource::Repo => {
            format!("https://github.com/{BUNDLE_REPO}/raw/{BUNDLE_REF}/mho-full-{target}.tar.xz")
        }
        BundleSource::Release => format!(
            "https://github.com/{BUNDLE_REPO}/releases/download/{BUNDLE_TAG}/mho-full-{target}.tar.xz"
        ),
    }
}

// ── Result types ────────────────────────────────────────────────────────

/// Snapshot of the remote host, shown at the top of the install page.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct RemoteInfo {
    pub os: String,
    pub arch: String,
    pub libc: String,
    pub home: String,
    pub user: String,
    /// Configured `mho` path, as entered by the user.
    pub mho_path: String,
    /// Detected target triple.
    pub target: String,
    /// Whether a bundle is published for [`Self::target`].
    pub target_supported: bool,
    pub mho_exists: bool,
    /// Absolute path of the detected binary, when it exists.
    pub mho_resolved: Option<String>,
    pub mho_version: Option<String>,
    /// Suggested installation directory (parent of the configured binary).
    pub install_dir: String,
}

/// Result of a successful install.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct InstallReport {
    /// Absolute path of the installed binary on the remote host.
    pub path: String,
}

/// State of a directory on the remote host, as sent to the frontend.
///
/// Mirrors `src/types.ts` (`DirStatus`), flattening the nested
/// [`sssh::fs::DiskSpace`] the library returns.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct DirStatus {
    /// Path that was inspected (expanded, `~`-free).
    pub dir: String,
    pub exists: bool,
    pub writable: bool,
    /// The directory is missing, but its nearest existing ancestor is writable.
    pub creatable: bool,
    pub total_bytes: u64,
    pub available_bytes: u64,
    /// Whether `available_bytes` is a real measurement (0 can mean "full").
    pub space_known: bool,
    /// Path the space figures came from (the nearest existing ancestor).
    pub space_from: String,
    /// Non-blocking warning about free space (e.g. "not enough for a full
    /// install"). The install is still attempted: `ei` performs the
    /// authoritative check with the real extracted file list and fails with a
    /// clear error when the write really does not fit.
    pub space_warning: Option<String>,
    /// Why the directory is unusable, when it is.
    pub error: Option<String>,
}

impl From<sssh::fs::DirStatus> for DirStatus {
    fn from(status: sssh::fs::DirStatus) -> Self {
        Self {
            dir: status.path.to_string_lossy().into_owned(),
            exists: status.exists,
            writable: status.writable,
            creatable: status.creatable,
            total_bytes: status.space.total_bytes,
            available_bytes: status.space.available_bytes,
            space_known: status.space.known,
            space_from: status.space.probe_path.to_string_lossy().into_owned(),
            space_warning: None,
            error: status.error,
        }
    }
}

// ── Connection helpers ──────────────────────────────────────────────────

fn remote_config(params: &ConnectParams) -> RemoteConfig {
    RemoteConfig {
        user: params.username.clone(),
        host: params.host.clone(),
        port: params.port,
        password: params.password.clone(),
        identity: None,
        key: params.private_key.clone(),
    }
}

async fn connect(params: &ConnectParams, timeout_secs: u64) -> Result<Client, String> {
    remote_config(params)
        .connect(timeout_secs)
        .await
        .map_err(|e| easy_install::error::format_chain(&e))
}

async fn version_of(client: &Client, path: &str) -> Option<String> {
    let output = client
        .exec_sh(&format!(
            "{} -V 2>/dev/null | head -n 1",
            sssh::shell_quote(path)
        ))
        .await
        .ok()?;
    let version = output.stdout_lossy().trim().to_string();
    (!version.is_empty()).then_some(version)
}

/// Human readable byte size (0 renders as `0 B`, not "unknown").
fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

/// Directory holding the configured binary.
///
/// Prefers the parent of the resolved executable; before installation the
/// binary does not exist yet, so the configured path is used instead. That
/// keeps the suggested directory consistent in both states.
fn install_dir_for(configured: &str, resolved: Option<&str>, home: &str) -> String {
    let default = || format!("{}/.mho", home.trim_end_matches('/'));

    let candidate = resolved.map(|path| path.to_string()).or_else(|| {
        // A bare command name (found via PATH, or not yet installed) says
        // nothing about a directory.
        configured
            .contains('/')
            .then(|| expand_home(configured, home))
    });

    let Some(candidate) = candidate else {
        return default();
    };
    match candidate.rfind('/') {
        Some(0) => "/".to_string(),
        Some(i) => candidate[..i].to_string(),
        None => default(),
    }
}

/// Expand a leading `~` using the remote home directory.
fn expand_home(path: &str, home: &str) -> String {
    let home = home.trim_end_matches('/');
    if path == "~" {
        return home.to_string();
    }
    match path.strip_prefix("~/") {
        Some(rest) => format!("{home}/{rest}"),
        None => path.to_string(),
    }
}

// ── Public operations ───────────────────────────────────────────────────

/// Probe the remote host: platform, mho availability and suggested paths.
pub(crate) async fn probe(params: &ConnectParams, mho_path: &str) -> Result<RemoteInfo, String> {
    let client = connect(params, 30).await?;
    let platform = platform::detect(&client).await?;

    let mho_resolved = platform::resolve_executable(&client, mho_path).await;
    let mho_version = match &mho_resolved {
        Some(path) => version_of(&client, path).await,
        None => None,
    };
    let home = client.home().to_string();
    let target = platform.target.clone();

    Ok(RemoteInfo {
        target_supported: TARGETS.contains(&target.as_str()),
        os: platform.os,
        arch: platform.arch,
        libc: platform.libc,
        install_dir: install_dir_for(mho_path, mho_resolved.as_deref(), &home),
        mho_exists: mho_resolved.is_some(),
        mho_version,
        mho_resolved,
        home,
        user: params.username.clone(),
        mho_path: mho_path.to_string(),
        target,
    })
}

/// Inspect a candidate installation directory.
pub(crate) async fn check_dir(params: &ConnectParams, dir: &str) -> Result<DirStatus, String> {
    let client = connect(params, 30).await?;
    let mut status = DirStatus::from(
        client
            .fs()
            .dir_status(dir)
            .await
            .map_err(|e| e.to_string())?,
    );
    status.space_warning = space_warning(&client, dir, &status).await;
    Ok(status)
}

/// Free space the install needs, given what replacing existing files frees.
///
/// `BUNDLE_MIN_BYTES` is the worst case (no previous install). Replacing a
/// binary frees its blocks before the new one is written, so only the
/// difference has to fit — the same rule `easy-install` applies per file.
fn required_bytes(reclaimed: u64) -> u64 {
    BUNDLE_MIN_BYTES.saturating_sub(reclaimed)
}

/// Bytes that reinstalling frees again: the currently installed binary.
///
/// The bundle is mostly the executable, so replacing an existing copy needs
/// far less free space than a fresh install. `ei` performs the same
/// per-file discount when it writes to the remote host — this pre-check must
/// agree with it, or it rejects installs that would have succeeded (a 15 MB
/// `/jffs` with an old mho already on it is the common case on routers).
///
/// Uses `~`-aware metadata lookups, so a relative or `~/` install dir works.
async fn reclaimed_bytes(client: &Client, install_dir: &str) -> u64 {
    let base = install_dir.trim_end_matches('/');
    let mut total = 0;
    for name in [BINARY, "mho.exe"] {
        let path = format!("{base}/{name}");
        if let Ok(Some(meta)) = client.fs().try_metadata(&path).await
            && meta.is_file()
        {
            total += meta.len();
        }
    }
    total
}

/// Non-blocking space warning for `dir`, or `None` when it looks fine.
///
/// The estimate is `BUNDLE_MIN_BYTES` minus the existing binary (see
/// [`reclaimed_bytes`]). It is deliberately advisory: the bundle also carries
/// assets, so only `ei` — which knows the extracted file list after
/// downloading — can decide for certain. The UI shows this and still allows
/// the install, because a false positive must not block a working setup.
async fn space_warning(
    client: &Client,
    install_dir: &str,
    status: &DirStatus,
) -> Option<String> {
    if !status.space_known || status.available_bytes >= BUNDLE_MIN_BYTES {
        return None;
    }

    let reclaimed = reclaimed_bytes(client, install_dir).await;
    let required = required_bytes(reclaimed);
    if status.available_bytes >= required {
        return None;
    }

    // When the directory does not exist yet, the figure comes from its nearest
    // existing ancestor (usually `/`), so name that path — otherwise the
    // warning blames a directory that is not even there.
    let where_ = if status.space_from.is_empty() || status.space_from == status.dir {
        String::new()
    } else {
        format!(" (measured on {})", status.space_from)
    };
    let reclaimed_note = if reclaimed > 0 {
        format!(
            " Replacing the existing binary frees {}, so {} more is needed.",
            format_bytes(reclaimed),
            format_bytes(required),
        )
    } else {
        String::new()
    };

    Some(format!(
        "limited space for {install_dir}: {} free{where_}, about {} recommended.{reclaimed_note} The install will still be attempted.",
        format_bytes(status.available_bytes),
        format_bytes(required),
    ))
}

/// Install the full mho bundle on the remote host through `ei`.
///
/// The bundle (`mho-full-<target>.tar.xz` from `mho-assets`) contains the
/// binary plus every base asset, so a single archive installs a working set.
pub(crate) async fn install(
    params: &ConnectParams,
    install_dir: &str,
    target: &str,
    proxy: &str,
    source: &str,
) -> Result<InstallReport, String> {
    let install_dir = install_dir.trim();
    if install_dir.is_empty() {
        return Err("install directory is empty".to_string());
    }

    let proxy = Proxy::from_str(proxy).map_err(|e| format!("unsupported proxy: {e}"))?;
    let source = BundleSource::parse(source)
        .ok_or_else(|| format!("unsupported bundle source: {source}"))?;
    // Validate the triple before hitting the network so a typo fails fast.
    Target::from_str(target).map_err(|e| format!("unsupported target: {e}"))?;
    if !TARGETS.contains(&target) {
        return Err(format!("no mho-full bundle is published for {target}"));
    }

    let config = InstallConfig {
        dir: Some(install_dir.to_string()),
        proxy,
        timeout: 600,
        remote: Some(remote_config(params)),
        ..Default::default()
    };

    // Space is not checked here: `check_dir` already shows an advisory warning
    // in the UI, and `ei` owns the authoritative check — after extracting it
    // knows the real file list, discounts files it is about to overwrite, and
    // fails with a clear "not enough disk space" error when the write genuinely
    // does not fit. Re-checking here would duplicate the message and cost an
    // extra SSH round trip.

    // `ei` handles download, extraction (tar.xz), permissions and remote
    // deployment; the proxy is applied to the GitHub URL automatically.
    //
    // The whole install is bounded so a stalled SSH channel can never leave
    // the UI spinning forever.
    tokio::time::timeout(
        Duration::from_secs(INSTALL_TIMEOUT_SECS),
        ei(&bundle_url(source, target), &config),
    )
    .await
    .map_err(|_| format!("install timed out after {INSTALL_TIMEOUT_SECS}s"))?
    .map_err(|e| easy_install::error::format_chain(&e))?;

    // Resolve the installed path instead of guessing it: this also expands
    // `~` and confirms the binary really landed. Windows bundles ship
    // `mho.exe`, hence the two candidates.
    let client = connect(params, 30).await?;
    let base = install_dir.trim_end_matches('/');
    let mut path = None;
    for name in [BINARY, "mho.exe"] {
        let candidate = format!("{base}/{name}");
        if let Some(found) = platform::resolve_executable(&client, &candidate).await {
            path = Some(found);
            break;
        }
    }
    let path =
        path.ok_or_else(|| format!("installed, but no mho binary was found in {install_dir}"))?;

    Ok(InstallReport { path })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_install_dir_from_binary() {
        assert_eq!(
            install_dir_for("~/.mho-ssh/mho", Some("/root/.mho-ssh/mho"), "/root"),
            "/root/.mho-ssh"
        );
        assert_eq!(install_dir_for("/mho", Some("/mho"), "/home/me"), "/");
        assert_eq!(install_dir_for("mho", None, "/home/me"), "/home/me/.mho");
    }

    /// Before installation the binary does not exist, so the configured path
    /// decides the suggested directory (this used to fall back to `~/.mho`).
    #[test]
    fn derives_install_dir_before_install() {
        assert_eq!(
            install_dir_for("~/.mho-ssh/mho", None, "/root"),
            "/root/.mho-ssh"
        );
        assert_eq!(
            install_dir_for("/root/.mho-ssh/mho", None, "/root"),
            "/root/.mho-ssh"
        );
    }

    #[test]
    fn expands_remote_home() {
        assert_eq!(expand_home("~/a/b", "/root"), "/root/a/b");
        assert_eq!(expand_home("/opt/mho", "/root"), "/opt/mho");
    }

    #[test]
    fn default_target_parses() {
        assert!(Target::from_str(&default_target()).is_ok());
    }

    #[test]
    fn builds_bundle_urls() {
        assert_eq!(
            bundle_url(BundleSource::Repo, "aarch64-apple-darwin"),
            "https://github.com/ahaoboy/mho-assets/raw/main/mho-full-aarch64-apple-darwin.tar.xz"
        );
        assert_eq!(
            bundle_url(BundleSource::Release, "aarch64-apple-darwin"),
            "https://github.com/ahaoboy/mho-assets/releases/download/nightly/mho-full-aarch64-apple-darwin.tar.xz"
        );
    }

    #[test]
    fn parses_bundle_source() {
        assert_eq!(BundleSource::parse(""), Some(BundleSource::Repo));
        assert_eq!(BundleSource::parse("repo"), Some(BundleSource::Repo));
        assert_eq!(BundleSource::parse("release"), Some(BundleSource::Release));
        assert_eq!(BundleSource::parse("ftp"), None);
    }

    /// The repo copy must be servable through every proxy; the release asset
    /// only through the release-aware ones.
    #[test]
    fn proxies_support_the_bundle_sources() {
        let repo = bundle_url(BundleSource::Repo, "aarch64-unknown-linux-musl");
        let repo = github_proxy::Resource::try_from(repo.as_str()).expect("repo copy is a file");
        let release = bundle_url(BundleSource::Release, "aarch64-unknown-linux-musl");
        let release =
            github_proxy::Resource::try_from(release.as_str()).expect("release is an asset");

        for proxy in PROXIES.iter().filter_map(|p| Proxy::from_str(p).ok()) {
            assert!(repo.url(&proxy).is_some(), "{proxy} cannot serve the repo copy");
        }
        assert!(release.url(&Proxy::Github).is_some());
        assert!(release.url(&Proxy::Jsdelivr).is_none());
        assert!(release.url(&Proxy::Statically).is_none());
    }

    #[test]
    fn every_target_has_a_bundle_url() {
        for target in TARGETS {
            for source in [BundleSource::Repo, BundleSource::Release] {
                assert!(
                    bundle_url(source, target).ends_with(&format!("mho-full-{target}.tar.xz"))
                );
            }
        }
    }

    /// Reinstalling over an existing binary must not demand the full bundle
    /// size again — the old copy's blocks are freed before writing.
    #[test]
    fn existing_binary_discounts_required_space() {
        // Fresh install: the whole bundle must fit.
        assert_eq!(required_bytes(0), BUNDLE_MIN_BYTES);

        // Replacing a 6 MB binary leaves ~18 MB to find.
        let six_mb = 6 * 1024 * 1024;
        assert_eq!(required_bytes(six_mb), BUNDLE_MIN_BYTES - six_mb);

        // A binary as large as the estimate needs no extra room...
        assert_eq!(required_bytes(BUNDLE_MIN_BYTES), 0);
        // ...and an even larger old binary never produces a negative number.
        assert_eq!(required_bytes(BUNDLE_MIN_BYTES * 2), 0);
    }
}
