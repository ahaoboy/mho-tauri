// ── Thin wrapper over the `sssh` crate for Tauri integration ────────────

use serde::{Deserialize, Serialize};

pub use sssh::Error as SshError;

// ── Tauri-compatible types ──────────────────────────────────────────────

/// SSH connection parameters (serde-friendly, camelCase from JS).
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    #[serde(rename = "privateKey")]
    pub private_key: Option<String>,
}

/// Result of a remote command execution, returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

// ── Remote command execution ────────────────────────────────────────────

/// Execute an arbitrary command on the remote host via SSH (exec mode)
/// and capture stdout + stderr + exit code.
pub(crate) async fn run_remote_command(
    params: &ConnectParams,
    command: &str,
) -> Result<CommandOutput, SshError> {
    let target = format!("{}@{}", params.username, params.host);

    let auth = if let Some(ref key) = params.private_key {
        sssh::Auth::key(key.clone())
    } else {
        sssh::Auth::password(params.password.clone().unwrap_or_default())
    };

    let output = sssh::exec(&target, params.port, auth, command).await?;

    Ok(CommandOutput {
        stdout: output.stdout,
        stderr: output.stderr,
        exit_code: output.exit_code.unwrap_or(0) as i32,
    })
}
