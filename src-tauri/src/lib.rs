mod i18n;
mod journal;
mod map_stats;
mod weapon_stats;
mod agent_stats;
mod duels;
mod analysis;
mod assets;
mod backup;
mod commands;
mod db;
mod error;
mod favorites;
mod heatmap;
mod henrik;
mod models;
mod notify;
mod progression;
mod recap;
mod reports;
mod repo;
mod state;
mod stats;
mod storage;
mod sync;
mod tray;
mod thresholds;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| tray::show(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("valtracker.db");
            let conn = db::open(&path)?;
            i18n::load(&conn);
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
            tray::install(app)?;
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_api_key,
            commands::has_api_key,
            commands::add_account,
            commands::set_active_account,
            commands::set_combined_view,
            commands::remove_account,
            commands::list_accounts,
            commands::sync_account,
            commands::get_overview,
            commands::get_filter_options,
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
            favorites::toggle_favorite,
            favorites::list_favorites,
            recap::get_session_recap,
            recap::get_act_recap,
            recap::get_selection_recap,
            recap::get_range_recap,
            recap::get_recap_matches,
            recap::save_recap_image,
            recap::reveal_recap,
            backup::export_database,
            backup::pick_database_import,
            backup::import_database,
            thresholds::get_thresholds,
            thresholds::set_thresholds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
