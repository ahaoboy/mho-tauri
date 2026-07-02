// ── Module declarations ──────────────────────────────────────────────────

mod commands;
mod error;
mod ssh;
use commands::execute_crash;
use tracing::info;

// ── Entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing: respects RUST_LOG env var (defaults to "info").
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Starting Crash Tauri application");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![execute_crash])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
