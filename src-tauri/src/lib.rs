mod journal;
mod map_stats;
mod weapon_stats;
mod agent_stats;
mod duels;
mod analysis;
mod assets;
mod commands;
mod db;
mod error;
mod heatmap;
mod henrik;
mod models;
mod progression;
mod recap;
mod reports;
mod repo;
mod state;
mod stats;
mod storage;
mod sync;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("valtracker.db");
            let conn = db::open(&path)?;
            app.manage(AppState::new(conn, path));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let active = handle.state::<AppState>().conn().ok().and_then(|conn| {
                    let _ = storage::compact_existing(&conn);
                    db::get_setting(&conn, sync::ACTIVE_ACCOUNT_SETTING).ok().flatten()
                });
                if let Some(puuid) = active {
                    reports::warm(&handle, puuid);
                }
            });
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
            agent_stats::get_agent_stats,
            map_stats::get_map_stats,
            weapon_stats::get_weapon_stats,
            weapon_stats::get_weapon_history,
            duels::get_duels,
            journal::get_note,
            journal::save_note,
            journal::list_notes,
            journal::list_tags,
            recap::get_session_recap,
            recap::get_act_recap,
            recap::save_recap_image,
            recap::reveal_recap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
