use serde_json::Value;
use serde_json::value::RawValue;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::assets;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::henrik::Henrik;
use crate::i18n::{english, tr};
use crate::models::{SyncProgress, SyncReport};
use crate::notify;
use crate::repo;
use crate::state::AppState;

pub const API_KEY_SETTING: &str = "api_key";
pub const ACTIVE_ACCOUNT_SETTING: &str = "active_account";
pub const COMBINED_SETTING: &str = "combined_view";

const PAGE_SIZE: usize = 10;
const MAX_MATCHES_PER_MODE: usize = 2000;
const MAX_CONSECUTIVE_MISSING: usize = 5;
const AUTO_SYNC_INTERVAL: Duration = Duration::from_secs(10 * 60);
const COMPETITIVE: &str = "competitive";

pub async fn run(app: &AppHandle, puuid: &str) -> AppResult<SyncReport> {
    let state = app.state::<AppState>();
    let _guard = state.sync_lock.lock().await;
    let result = sync(app, &state, puuid).await;
    let error = result.as_ref().err().map(|err| match err {
        AppError::Unavailable => tr(
            "HenrikDev ne répond pas pour le moment. Tes matchs restent consultables, nouvel essai automatique d'ici 10 minutes",
            "HenrikDev is not responding right now. Your matches are still available, next try within 10 minutes",
        )
        .to_string(),
        err => err.to_string(),
    });
    let new_matches = result.as_ref().map_or(0, |report| report.new_matches);
    emit(app, puuid, tr("Terminé", "Done"), new_matches, false, error);
    crate::reports::ready(app);
    if result.is_ok() {
        crate::career::spawn_refresh(app, puuid);
        crate::extras::schedule(app, puuid);
    }
    result
}

async fn sync(app: &AppHandle, state: &AppState, puuid: &str) -> AppResult<SyncReport> {
    let (key, account, had_matches) = {
        let conn = state.conn()?;
        let key = db::get_setting(&conn, API_KEY_SETTING)?
            .filter(|key| !key.is_empty())
            .ok_or_else(|| {
                AppError::Invalid(tr("Ajoute ta clé API HenrikDev dans les paramètres", "Add your HenrikDev API key in Settings").into())
            })?;
        let account = repo::get_account(&conn, puuid)?
            .ok_or_else(|| AppError::Invalid(tr("Compte introuvable", "Account not found").into()))?;
        (key, account, notify::has_matches(&conn, puuid)?)
    };
    let api = Henrik::new(key)?;
    let (region, platform) = (account.region.as_str(), account.platform.as_str());

    emit(app, puuid, tr("Données des maps", "Map data"), 0, true, None);
    let _ = assets::refresh_if_needed(state).await;

    emit(app, puuid, tr("Rang", "Rank"), 0, true, None);
    let mmr = api.mmr(region, platform, puuid).await?;
    let seasons_changed = {
        let conn = state.conn()?;
        repo::update_rank(&conn, puuid, &mmr)?
    };

    emit(app, puuid, tr("Historique de RR", "RR history"), 0, true, None);
    let history = api.mmr_history(region, platform, puuid).await?;
    let history_changed = {
        let mut conn = state.conn()?;
        repo::upsert_mmr_history(&mut conn, puuid, &history)? > 0
    };
    let _ = crate::patches::refresh(state, &api).await;

    let mut new_matches = sync_mode(app, &api, region, platform, puuid, COMPETITIVE, tr("Matchs compétitifs", "Competitive matches"), 0).await?;
    if new_matches > 0 && had_matches {
        if let Ok(conn) = state.conn() {
            let _ = notify::new_matches(app, &conn, puuid, new_matches);
        }
    }
    new_matches += backfill(app, state, &api, region, puuid, new_matches).await;
    if new_matches > 0 || history_changed || seasons_changed {
        refreshed(app, state, puuid);
    }

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
        emit(app, puuid, label, already + added_total, true, None);
        let games = api.matches(region, platform, puuid, mode, start, PAGE_SIZE).await?;
        if games.is_empty() {
            break;
        }
        let count = games.len();
        let added = store(app, games.into_iter().map(Page::Raw).collect()).await?;
        added_total += added;
        if added == 0 || count < PAGE_SIZE {
            break;
        }
        start += PAGE_SIZE;
    }
    Ok(added_total)
}

enum Page {
    Raw(Box<RawValue>),
    Parsed(Value),
}

fn prepare(state: &AppState, games: Vec<Page>) -> AppResult<Vec<repo::PreparedMatch>> {
    let mut prepared = Vec::with_capacity(games.len());
    for game in games {
        let game = match game {
            Page::Raw(raw) => match serde_json::from_str::<Value>(raw.get()) {
                Ok(game) => game,
                Err(_) => continue,
            },
            Page::Parsed(game) => game,
        };
        if let Some(id) = repo::match_id(&game) {
            if state.read(|conn| repo::has_match(conn, id))? {
                continue;
            }
        }
        if let Some(game) = repo::prepare_match(game)? {
            prepared.push(game);
        }
    }
    Ok(prepared)
}

async fn store(app: &AppHandle, games: Vec<Page>) -> AppResult<usize> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let prepared = prepare(&state, games)?;
        if prepared.is_empty() {
            return Ok(0);
        }
        repo::insert_all(&mut *state.conn()?, &prepared)
    })
    .await
    .map_err(|err| AppError::Invalid(err.to_string()))?
}

async fn backfill(app: &AppHandle, state: &AppState, api: &Henrik, region: &str, puuid: &str, already: usize) -> usize {
    let Ok(missing) = state.conn().and_then(|conn| repo::missing_history_matches(&conn, puuid)) else {
        return 0;
    };
    let mut added = 0;
    let mut consecutive_missing = 0;
    for (index, match_id) in missing.iter().enumerate() {
        let stage = if english() {
            format!("Older matches, {} of {}", index + 1, missing.len())
        } else {
            format!("Matchs plus anciens, {} sur {}", index + 1, missing.len())
        };
        emit(app, puuid, &stage, already + added, true, None);
        match api.match_detail(region, match_id).await {
            Ok(game) => {
                consecutive_missing = 0;
                match store(app, vec![Page::Parsed(game)]).await {
                    Ok(1) => added += 1,
                    _ => {
                        let Ok(conn) = state.conn() else {
                            break;
                        };
                        let _ = repo::mark_unavailable(&conn, match_id);
                    }
                }
            }
            Err(AppError::NotFound) => {
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
            let targets = app.state::<AppState>().conn().ok().map(|conn| sync_targets(&conn)).unwrap_or_default();
            for puuid in targets {
                let _ = run(&app, &puuid).await;
            }
        }
    });
}

fn sync_targets(conn: &rusqlite::Connection) -> Vec<String> {
    let combined = db::get_setting(conn, COMBINED_SETTING).ok().flatten().as_deref() == Some("true");
    if combined {
        if let Ok(accounts) = repo::list_accounts(conn) {
            if accounts.len() > 1 {
                return accounts.into_iter().map(|account| account.puuid).collect();
            }
        }
    }
    db::get_setting(conn, ACTIVE_ACCOUNT_SETTING).ok().flatten().into_iter().collect()
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
