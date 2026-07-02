// ── Application error type ──────────────────────────────────────────────

use crate::ssh::SshError;

/// Application-level errors — wraps SSH failures for Tauri command return types.
#[derive(Debug, thiserror::Error)]
#[error(transparent)]
pub(crate) struct AppError(#[from] SshError);

/// Tauri commands return `Result<T, String>`, so we convert.
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
