// ── Thin wrapper over the `sssh` crate for Tauri integration ────────────

use serde::{Deserialize, Serialize};
use std::time::Duration;

pub use sssh::Error as SshError;

/// Default total wall-clock budget for one SSH operation (connect + auth +
/// command + output collection).
const DEFAULT_TIMEOUT_SECS: u64 = 30;
/// Upper bound accepted from the frontend, to avoid absurd values.
const MAX_TIMEOUT_SECS: u64 = 600;

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
///
/// `timeout_secs` bounds the whole operation (TCP connect, handshake,
/// authentication and command execution). Without it, Android's blocked
/// local-network TCP connects can stall forever.
pub(crate) async fn run_remote_command(
    params: &ConnectParams,
    command: &str,
    timeout_secs: Option<u64>,
) -> Result<CommandOutput, SshError> {
    let timeout_secs = timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .clamp(1, MAX_TIMEOUT_SECS);

    let config = sssh::Config {
        host: params.host.clone(),
        port: params.port,
        username: params.username.clone(),
        password: params.password.clone(),
        private_key: params.private_key.clone(),
        command: None,
        cols: 80,
        rows: 24,
        // Also let sssh apply its own TCP-connect timeout.
        timeout_secs: Some(timeout_secs),
        host_key_verifier: None,
    };

    let output = match tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        sssh::Session::exec(config, command),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err(SshError::Timeout),
    };

    Ok(CommandOutput {
        stdout: output.stdout,
        stderr: output.stderr,
        exit_code: output.exit_code.unwrap_or(0) as i32,
    })
}
