// ── Remote platform / executable probes ─────────────────────────────────
//
// `sssh` exposes the raw `uname(1)` fields (`Client::uname`) and a remote
// filesystem API; this module gathers those *facts* and asks
// `guess_target::guess_system_target` for the Rust target triple the install
// page needs, then locates the executable on the remote host.
//
// Only the probing lives here: Alpine/musl detection needs remote file
// checks that `guess-target` must not know about. The guessing rules
// themselves are shared with `ei` and every other consumer.

use easy_install::RemotePlatform;
use guess_target::{Libc, SystemInfo, guess_system_target};
use sssh::{Client, Fs, shell_quote};

/// Detect the platform of the host behind `client`.
pub(crate) async fn detect(client: &Client) -> Result<RemotePlatform, String> {
    let fs = client.fs();
    let uname = client.uname().await.map_err(|e| e.to_string())?;

    let os = uname.sysname;
    let arch = uname.machine;
    let android = uname
        .os
        .as_deref()
        .is_some_and(|kernel| kernel.eq_ignore_ascii_case("android"))
        || (os == "Linux" && fs.try_exists("/system/build.prop").await.unwrap_or(false));
    let libc = if os == "Linux" && !android {
        detect_libc(client, &fs).await
    } else {
        Libc::Gnu
    };

    let info = SystemInfo::new(&os, &arch)
        .with_libc(libc)
        .with_android(android);
    let target = guess_system_target(&info)
        .map(|target| target.to_str().to_string())
        .unwrap_or_default();

    Ok(RemotePlatform {
        os,
        arch,
        libc: libc.to_string(),
        android,
        target,
    })
}

/// Distinguish musl from glibc on Linux.
async fn detect_libc(client: &Client, fs: &Fs) -> Libc {
    if let Ok(release) = fs.read_to_string("/etc/os-release").await
        && release.to_ascii_lowercase().contains("alpine")
    {
        return Libc::Musl;
    }

    for loader in [
        "/lib/ld-musl-x86_64.so.1",
        "/lib/ld-musl-aarch64.so.1",
        "/lib/ld-musl-armhf.so.1",
    ] {
        if fs.try_exists(loader).await.unwrap_or(false) {
            return Libc::Musl;
        }
    }

    if let Ok(output) = client.exec("ldd --version").await {
        let text = format!("{}\n{}", output.stdout_lossy(), output.stderr_lossy());
        if text.to_ascii_lowercase().contains("musl") {
            return Libc::Musl;
        }
    }

    Libc::Gnu
}

/// Resolve `path_or_name` to an executable on the remote host.
///
/// Accepts an absolute or `~`-relative path, or a bare command name that is
/// looked up in `PATH`. Returns `None` when nothing executable matches.
pub(crate) async fn resolve_executable(client: &Client, path_or_name: &str) -> Option<String> {
    let path = client.expand_path(path_or_name);
    let script = RESOLVE_SCRIPT
        .replace("__PATH__", &shell_quote(&path.to_string_lossy()))
        .replace("__NAME__", &shell_quote(path_or_name));

    let output = client.exec_sh(&script).await.ok()?;
    let found = output.stdout_lossy().trim().to_string();
    (!found.is_empty()).then_some(found)
}

/// `command -v` is the POSIX lookup; BusyBox builds without the builtin fall
/// back to `which` (when present).
const RESOLVE_SCRIPT: &str = r#"
if [ -x __PATH__ ]; then printf '%s' __PATH__
else
  found=$(command -v __NAME__ 2>/dev/null) || found=
  if [ -z "$found" ]; then found=$(which __NAME__ 2>/dev/null) || found=; fi
  printf '%s' "$found"
fi
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripts_substitute_quoted_values() {
        let script = RESOLVE_SCRIPT
            .replace("__PATH__", &shell_quote("/a b/mho"))
            .replace("__NAME__", &shell_quote("mho"));
        assert!(!script.contains("__PATH__"));
        assert!(!script.contains("__NAME__"));
        assert!(script.contains("'/a b/mho'"));
    }

    /// Only the probe output shape is ours; the mapping itself is tested in
    /// `guess-target`.
    #[test]
    fn builds_system_info_from_uname() {
        let info = SystemInfo::from_uname("Linux", "aarch64", Some("Android"));
        assert!(info.android);
        assert_eq!(
            guess_system_target(&info).map(|target| target.to_str()),
            Some("aarch64-linux-android")
        );

        let info = SystemInfo::from_uname("Linux", "x86_64", None).with_libc(Libc::Musl);
        assert_eq!(
            guess_system_target(&info).map(|target| target.to_str()),
            Some("x86_64-unknown-linux-musl")
        );
    }
}
