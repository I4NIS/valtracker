use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::assets;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::henrik::{Henrik, NOT_FOUND};
use crate::models::{SyncProgress, SyncReport};
use crate::repo;
use crate::state::AppState;

pub const API_KEY_SETTING: &str = "api_key";
pub const ACTIVE_ACCOUNT_SETTING: &str = "active_account";

const PAGE_SIZE: usize = 10;
const MAX_MATCHES_PER_MODE: usize = 2000;
const MAX_CONSECUTIVE_MISSING: usize = 5;
const AUTO_SYNC_INTERVAL: Duration = Duration::from_secs(10 * 60);
const COMPETITIVE: &str = "competitive";

pub async fn run(app: &AppHandle, puuid: &str) -> AppResult<SyncReport> {
    let state = app.state::<AppState>();
    let _guard = state.sync_lock.lock().await;
    let result = sync(app, &state, puuid).await;
    let error = result.as_ref().err().map(ToString::to_string);
    let new_matches = result.as_ref().map_or(0, |report| report.new_matches);
    emit(app, puuid, "Terminé", new_matches, false, error);
    result
}

async fn sync(app: &AppHandle, state: &AppState, puuid: &str) -> AppResult<SyncReport> {
    let (key, account) = {
        let conn = state.conn()?;
        let key = db::get_setting(&conn, API_KEY_SETTING)?
            .filter(|key| !key.is_empty())
            .ok_or_else(|| AppError::Invalid("Ajoute ta clé API HenrikDev dans les paramètres".into()))?;
        let account = repo::get_account(&conn, puuid)?
            .ok_or_else(|| AppError::Invalid("Compte introuvable".into()))?;
        (key, account)
    };
    let api = Henrik::new(key);
    let (region, platform) = (account.region.as_str(), account.platform.as_str());

    emit(app, puuid, "Données des maps", 0, true, None);
    let _ = assets::refresh_if_needed(state).await;

    emit(app, puuid, "Rang", 0, true, None);
    let mmr = api.mmr(region, platform, puuid).await?;
    {
        let conn = state.conn()?;
        repo::update_rank(&conn, puuid, &mmr)?;
    }

    emit(app, puuid, "Historique de RR", 0, true, None);
    let history = api.mmr_history(region, platform, puuid).await?;
    {
        let mut conn = state.conn()?;
        repo::upsert_mmr_history(&mut conn, puuid, &history)?;
    }

    let mut new_matches = sync_mode(app, state, &api, region, platform, puuid, COMPETITIVE, "compétitifs", 0).await?;
    if new_matches > 0 {
        refreshed(app, state, puuid);
    }
    let older = backfill(app, state, &api, region, puuid, new_matches).await;
    if older > 0 {
        refreshed(app, state, puuid);
    }
    new_matches += older;

    let finished_at = now_iso();
    {
        let conn = state.conn()?;
        repo::set_last_sync(&conn, puuid, &finished_at)?;
    }
    Ok(SyncReport { new_matches, finished_at })
}

#[allow(clippy::too_many_arguments)]
async fn sync_mode(
    app: &AppHandle,
    state: &AppState,
    api: &Henrik,
    region: &str,
    platform: &str,
    puuid: &str,
    mode: &str,
    label: &str,
    already: usize,
) -> AppResult<usize> {
    let mut added_total = 0;
    let mut start = 0;
    while start < MAX_MATCHES_PER_MODE {
        emit(app, puuid, &format!("Matchs {label}"), already + added_total, true, None);
        let page = api.matches(region, platform, puuid, mode, start, PAGE_SIZE).await?;
        let games = page.as_array().cloned().unwrap_or_default();
        if games.is_empty() {
            break;
        }
        let mut added = 0;
        {
            let mut conn = state.conn()?;
            for game in &games {
                if repo::insert_match(&mut conn, game)? {
                    added += 1;
                }
            }
        }
        added_total += added;
        if added == 0 || games.len() < PAGE_SIZE {
            break;
        }
        start += PAGE_SIZE;
    }
    Ok(added_total)
}

async fn backfill(app: &AppHandle, state: &AppState, api: &Henrik, region: &str, puuid: &str, already: usize) -> usize {
    let Ok(missing) = state.conn().and_then(|conn| repo::missing_history_matches(&conn, puuid)) else {
        return 0;
    };
    let mut added = 0;
    let mut consecutive_missing = 0;
    for (index, match_id) in missing.iter().enumerate() {
        emit(
            app,
            puuid,
            &format!("Matchs plus anciens, {} sur {}", index + 1, missing.len()),
            already + added,
            true,
            None,
        );
        match api.match_detail(region, match_id).await {
            Ok(game) => {
                consecutive_missing = 0;
                let Ok(mut conn) = state.conn() else {
                    break;
                };
                match repo::insert_match(&mut conn, &game) {
                    Ok(true) => added += 1,
                    _ => {
                        let _ = repo::mark_unavailable(&conn, match_id);
                    }
                }
            }
            Err(AppError::Api(message)) if message == NOT_FOUND => {
                if let Ok(conn) = state.conn() {
                    let _ = repo::mark_unavailable(&conn, match_id);
                }
                consecutive_missing += 1;
                if consecutive_missing >= MAX_CONSECUTIVE_MISSING {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    added
}

pub fn spawn_auto_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(AUTO_SYNC_INTERVAL).await;
            let active = app
                .state::<AppState>()
                .conn()
                .ok()
                .and_then(|conn| db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING).ok().flatten());
            if let Some(puuid) = active {
                let _ = run(&app, &puuid).await;
            }
        }
    });
}

fn refreshed(app: &AppHandle, state: &AppState, puuid: &str) {
    state.invalidate();
    let _ = app.emit("data-changed", puuid);
    crate::reports::warm(app, puuid.to_string());
}

fn emit(app: &AppHandle, puuid: &str, stage: &str, new_matches: usize, running: bool, error: Option<String>) {
    let _ = app.emit(
        "sync-progress",
        SyncProgress { puuid: puuid.to_string(), stage: stage.to_string(), new_matches, running, error },
    );
}

fn now_iso() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs()) as i64;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
