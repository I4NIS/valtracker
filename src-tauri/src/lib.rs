mod analysis;
mod assets;
mod commands;
mod db;
mod error;
mod heatmap;
mod henrik;
mod models;
mod progression;
mod repo;
mod state;
mod stats;
mod sync;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("valtracker.db"))?;
            app.manage(AppState::new(conn));
            sync::spawn_auto_sync(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_api_key,
            commands::has_api_key,
            commands::add_account,
            commands::set_active_account,
            commands::remove_account,
            commands::list_accounts,
            commands::sync_account,
            commands::get_overview,
            commands::get_recent_matches,
            commands::get_match,
            commands::get_progression,
            commands::get_recent_flaws,
            commands::get_heatmap,
            commands::get_seasons,
            commands::set_preference,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
