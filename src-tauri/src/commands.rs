// ── Tauri commands for the Crash Tauri wrapper ────────────────────────────

use crate::error::AppError;
use crate::ssh::{CommandOutput, ConnectParams, run_remote_command};

// ── Crash command execution ─────────────────────────────────────────────

/// Execute a command on the remote host via SSH and return the output.
///
/// Constructs the full command as `<crash_path> <args...>` and runs it
/// via SSH exec mode. Returns stdout, stderr, and exit code.
#[tauri::command]
pub(crate) async fn execute_crash(
    ssh_config: ConnectParams,
    crash_path: String,
    args: Vec<String>,
) -> Result<CommandOutput, String> {
    let full_command = if args.is_empty() {
        crash_path
    } else {
        format!("{} {}", crash_path, args.join(" "))
    };

    run_remote_command(&ssh_config, &full_command)
        .await
        .map_err(|e| AppError::from(e).into())
}
