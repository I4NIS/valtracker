use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Window, WindowEvent};

use crate::db;
use crate::state::AppState;
use crate::sync::{self, ACTIVE_ACCOUNT_SETTING};

const MAIN_WINDOW: &str = "main";

pub fn install(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Valtracker", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Synchroniser", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &sync, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Valtracker")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "sync" => sync_active(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == MAIN_WINDOW {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn sync_active(app: &AppHandle) {
    let active = app
        .state::<AppState>()
        .conn()
        .ok()
        .and_then(|conn| db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING).ok().flatten());
    if let Some(puuid) = active {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = sync::run(&app, &puuid).await;
        });
    }
}
