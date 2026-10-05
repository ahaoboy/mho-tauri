// ── Tauri commands for the Mho Tauri wrapper ────────────────────────────

use crate::error::AppError;
use crate::ssh::{CommandOutput, ConnectParams, run_remote_command};

// ── Mho command execution ─────────────────────────────────────────────

/// Execute a command on the remote host via SSH and return the output.
///
/// Constructs the full command as `<mho_path> <args...>` and runs it
/// via SSH exec mode. Returns stdout, stderr, and exit code.
#[tauri::command]
pub(crate) async fn execute_mho(
    ssh_config: ConnectParams,
    mho_path: String,
    args: Vec<String>,
) -> Result<CommandOutput, String> {
    let full_command = if args.is_empty() {
        mho_path
    } else {
        format!("{} {}", mho_path, args.join(" "))
    };

    run_remote_command(&ssh_config, &full_command)
        .await
        .map_err(|e| AppError::from(e).into())
}
