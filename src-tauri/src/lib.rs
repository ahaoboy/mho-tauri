// ── Module declarations ──────────────────────────────────────────────────

mod commands;
mod error;
mod installer;
mod platform;
mod ssh;
use commands::{
    CancelToken, cancel_ssh, check_dir, execute_mho, install_mho, install_options, probe_remote,
};
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
        .manage(CancelToken::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        // Both plugins are granted in `capabilities/*.json`; register them or
        // the frontend calls (`platform()`, clipboard) fail at runtime.
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(target_os = "windows")]
    let builder = builder
        // .plugin(tauri_plugin_media::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));

    builder
        .invoke_handler(tauri::generate_handler![
            execute_mho,
            cancel_ssh,
            install_options,
            probe_remote,
            check_dir,
            install_mho
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
