// ── Module declarations ──────────────────────────────────────────────────

mod commands;
mod error;
mod ssh;
use commands::{SshCancel, cancel_ssh, execute_mho};
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

    info!("Starting Mho Tauri application");

    let builder = tauri::Builder::default()
        .manage(SshCancel::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(target_os = "windows")]
    let builder = builder
        // .plugin(tauri_plugin_media::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));

    builder
        .invoke_handler(tauri::generate_handler![execute_mho, cancel_ssh])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
