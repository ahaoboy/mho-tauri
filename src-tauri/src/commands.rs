// ── Tauri commands for the Mho Tauri wrapper ────────────────────────────

use crate::error::AppError;
use crate::installer::{self, InstallReport, RemoteInfo};
use crate::ssh::{CommandOutput, ConnectParams, SshError, run_remote_command};
use easy_install::DirStatus;
use serde::Serialize;
use tokio::sync::watch;

// ── In-flight SSH cancellation ────────────────────────────────────────

/// Cancellation token shared by every in-flight SSH operation.
///
/// Each operation records the current generation; `cancel_ssh` bumps it,
/// which wakes everything started before the bump. Dropping the pending
/// future closes its TCP socket immediately.
#[derive(Clone)]
pub(crate) struct CancelToken {
    generation: watch::Sender<u64>,
}

impl Default for CancelToken {
    fn default() -> Self {
        let (generation, _) = watch::channel(0);
        Self { generation }
    }
}

impl CancelToken {
    fn subscribe(&self) -> (u64, watch::Receiver<u64>) {
        let rx = self.generation.subscribe();
        let generation = *rx.borrow();
        (generation, rx)
    }

    fn cancel_all(&self) {
        let next = self.generation.borrow().wrapping_add(1);
        // `send` fails when no receiver is alive; `send_replace` always
        // updates the generation, so a later request starts from the new
        // value instead of inheriting the stale one.
        self.generation.send_replace(next);
    }
}

/// Resolves when `cancel_ssh` is invoked after the given generation.
async fn wait_cancelled(generation: u64, mut rx: watch::Receiver<u64>) {
    loop {
        if *rx.borrow() != generation {
            return;
        }
        if rx.changed().await.is_err() {
            return;
        }
    }
}

// ── Mho command execution ─────────────────────────────────────────────

/// Execute a command on the remote host via SSH and return the output.
///
/// Constructs the full command as `<mho_path> <args...>` and runs it
/// via SSH exec mode. Returns stdout, stderr, and exit code.
/// `timeout_secs` bounds the whole operation; defaults to 30 seconds.
#[tauri::command]
pub(crate) async fn execute_mho(
    state: tauri::State<'_, CancelToken>,
    ssh_config: ConnectParams,
    mho_path: String,
    args: Vec<String>,
    timeout_secs: Option<u64>,
) -> Result<CommandOutput, String> {
    let full_command = if args.is_empty() {
        mho_path
    } else {
        format!("{} {}", mho_path, args.join(" "))
    };

    let (generation, cancel_rx) = state.subscribe();

    let result = tokio::select! {
        result = run_remote_command(&ssh_config, &full_command, timeout_secs) => result,
        _ = wait_cancelled(generation, cancel_rx) => {
            Err(SshError::Other("Connection cancelled".into()))
        }
    };

    result.map_err(|e| AppError::from(e).into())
}

/// Cancel all in-flight `execute_mho` operations.
///
/// The frontend calls this when the user presses "Cancel" while a connection
/// or command is running. The pending SSH future is dropped, which closes the
/// underlying TCP socket.
#[tauri::command]
pub(crate) fn cancel_ssh(state: tauri::State<'_, CancelToken>) {
    state.cancel_all();
}

// ── Remote installation ───────────────────────────────────────────────

/// Options for the install page.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct InstallOptions {
    /// Suggested target for the host running this build when it has a
    /// published bundle, otherwise the first published one.
    pub target: String,
    pub targets: Vec<&'static str>,
    pub proxies: Vec<&'static str>,
}

#[tauri::command]
pub(crate) fn install_options() -> InstallOptions {
    let local = installer::default_target();
    let target = if installer::TARGETS.contains(&local.as_str()) {
        local
    } else {
        installer::TARGETS[0].to_string()
    };
    InstallOptions {
        target,
        targets: installer::TARGETS.to_vec(),
        proxies: installer::PROXIES.to_vec(),
    }
}

/// Inspect the remote host: platform, mho availability and suggested paths.
#[tauri::command]
pub(crate) async fn probe_remote(
    state: tauri::State<'_, CancelToken>,
    ssh_config: ConnectParams,
    mho_path: String,
) -> Result<RemoteInfo, String> {
    let (generation, cancel_rx) = state.subscribe();

    tokio::select! {
        result = installer::probe(&ssh_config, &mho_path) => result,
        _ = wait_cancelled(generation, cancel_rx) => {
            Err("Connection cancelled".to_string())
        }
    }
}

/// Check that a remote directory is writable and has free space.
#[tauri::command]
pub(crate) async fn check_dir(
    state: tauri::State<'_, CancelToken>,
    ssh_config: ConnectParams,
    dir: String,
) -> Result<DirStatus, String> {
    let (generation, cancel_rx) = state.subscribe();

    tokio::select! {
        result = installer::check_dir(&ssh_config, &dir) => result,
        _ = wait_cancelled(generation, cancel_rx) => {
            Err("Connection cancelled".to_string())
        }
    }
}

/// Install the mho bundle on the remote host.
#[tauri::command]
pub(crate) async fn install_mho(
    state: tauri::State<'_, CancelToken>,
    ssh_config: ConnectParams,
    install_dir: String,
    target: String,
    proxy: String,
    tag: Option<String>,
) -> Result<InstallReport, String> {
    let (generation, cancel_rx) = state.subscribe();

    tokio::select! {
        result = installer::install(
            &ssh_config,
            &install_dir,
            &target,
            &proxy,
            tag.as_deref(),
        ) => result,
        _ = wait_cancelled(generation, cancel_rx) => {
            Err("Installation cancelled".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn cancel_wakes_in_flight_waiter() {
        let cancel = CancelToken::default();
        let (generation, rx) = cancel.subscribe();
        let waiter = tokio::spawn(wait_cancelled(generation, rx));

        cancel.cancel_all();

        tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("cancellation should wake the waiter")
            .expect("waiter task should not panic");
    }

    #[tokio::test]
    async fn subscription_after_cancel_starts_fresh() {
        let cancel = CancelToken::default();
        let before = *cancel.generation.borrow();
        cancel.cancel_all();
        assert_eq!(*cancel.generation.borrow(), before.wrapping_add(1));

        let (generation, rx) = cancel.subscribe();
        tokio::time::timeout(Duration::from_millis(100), wait_cancelled(generation, rx))
            .await
            .expect_err("a new subscription must not inherit an earlier cancellation");
    }
}
