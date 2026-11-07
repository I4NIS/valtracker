use rusqlite::Connection;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::henrik::Henrik;
use crate::repo;
use crate::rotation;
use crate::state::AppState;
use crate::sync::API_KEY_SETTING;

struct Queue {
    pending: Vec<String>,
    running: bool,
}

static QUEUE: Mutex<Queue> = Mutex::new(Queue { pending: Vec::new(), running: false });

fn locked() -> std::sync::MutexGuard<'static, Queue> {
    QUEUE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs()) as i64
}

pub fn due(conn: &Connection, key: &str) -> bool {
    db::get_setting(conn, key).ok().flatten().and_then(|value| value.parse::<i64>().ok()).is_none_or(|next| next <= now())
}

pub fn next_in(conn: &Connection, key: &str, secs: i64) {
    let _ = db::set_setting(conn, key, &(now() + secs).to_string());
}

pub async fn idle(state: &AppState) {
    drop(state.sync_lock.lock().await);
}

pub fn schedule(app: &AppHandle, puuid: &str) {
    let mut queue = locked();
    if !queue.pending.iter().any(|item| item == puuid) {
        queue.pending.push(puuid.to_string());
    }
    if queue.running {
        return;
    }
    queue.running = true;
    drop(queue);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let next = {
                let mut queue = locked();
                if queue.pending.is_empty() {
                    queue.running = false;
                    None
                } else {
                    Some(queue.pending.remove(0))
                }
            };
            let Some(puuid) = next else {
                break;
            };
            if run(&app, &puuid).await {
                let _ = app.emit("data-changed", &puuid);
            }
        }
    });
}

async fn run(app: &AppHandle, puuid: &str) -> bool {
    let state = app.state::<AppState>();
    let found = state.conn().ok().and_then(|conn| {
        let key = db::get_setting(&conn, API_KEY_SETTING).ok().flatten().filter(|key| !key.is_empty())?;
        let account = repo::get_account(&conn, puuid).ok().flatten()?;
        Some((key, account.region))
    });
    let Some((key, region)) = found else {
        return false;
    };
    let Ok(api) = Henrik::new(key) else {
        return false;
    };
    rotation::refresh(&state, &api, &region).await
}
