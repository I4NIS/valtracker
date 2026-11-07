use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::analysis::{self, MatchDetail};
use crate::assets;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::heatmap::{self, Heatmap};
use crate::henrik::Henrik;
use crate::progression::{self, Progression, RecentFlaws};
use crate::models::{Account, Overview, RecentMatch, Season, SyncReport};
use crate::repo;
use crate::state::AppState;
use crate::stats;
use crate::storage;
use crate::sync::{self, ACTIVE_ACCOUNT_SETTING, API_KEY_SETTING};

const REGIONS: [&str; 6] = ["eu", "na", "ap", "kr", "latam", "br"];
const PREFERENCES: [&str; 3] = ["theme", "language", "tutorial_done"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    has_api_key: bool,
    accounts: Vec<Account>,
    active_puuid: Option<String>,
    theme: String,
    language: String,
    tutorial_done: bool,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    let conn = state.conn()?;
    let accounts = repo::list_accounts(&conn)?;
    let active = db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING)?
        .filter(|puuid| accounts.iter().any(|account| &account.puuid == puuid))
        .or_else(|| accounts.first().map(|account| account.puuid.clone()));
    Ok(Bootstrap {
        has_api_key: db::get_setting(&conn, API_KEY_SETTING)?.is_some_and(|key| !key.is_empty()),
        accounts,
        active_puuid: active,
        theme: db::get_setting(&conn, "theme")?.unwrap_or_else(|| "dark".into()),
        language: db::get_setting(&conn, "language")?.unwrap_or_else(|| "fr".into()),
        tutorial_done: db::get_setting(&conn, "tutorial_done")?.as_deref() == Some("true"),
    })
}

#[tauri::command]
pub fn save_api_key(state: State<'_, AppState>, key: String) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::Invalid("La clé API est vide".into()));
    }
    db::set_setting(&*state.conn()?, API_KEY_SETTING, key)
}

#[tauri::command]
pub fn has_api_key(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(db::get_setting(&*state.conn()?, API_KEY_SETTING)?.is_some_and(|key| !key.is_empty()))
}

#[tauri::command]
pub async fn add_account(state: State<'_, AppState>, riot_id: String, region: String) -> AppResult<Account> {
    let (name, tag) = riot_id
        .trim()
        .rsplit_once('#')
        .map(|(name, tag)| (name.trim().to_string(), tag.trim().to_string()))
        .filter(|(name, tag)| !name.is_empty() && !tag.is_empty())
        .ok_or_else(|| AppError::Invalid("Le Riot ID doit être au format Pseudo#TAG".into()))?;
    let region = region.trim().to_lowercase();
    if !REGIONS.contains(&region.as_str()) {
        return Err(AppError::Invalid("Région inconnue".into()));
    }
    let key = db::get_setting(&*state.conn()?, API_KEY_SETTING)?
        .ok_or_else(|| AppError::Invalid("Ajoute d'abord ta clé API HenrikDev".into()))?;
    let data = Henrik::new(key).account(&name, &tag).await?;
    let conn = state.conn()?;
    let puuid = repo::upsert_account(&conn, &data, &region)?
        .ok_or_else(|| AppError::Api("Réponse inattendue de l'API HenrikDev".into()))?;
    db::set_setting(&conn, ACTIVE_ACCOUNT_SETTING, &puuid)?;
    repo::get_account(&conn, &puuid)?.ok_or_else(|| AppError::Invalid("Compte introuvable".into()))
}

#[tauri::command]
pub fn set_active_account(state: State<'_, AppState>, puuid: String) -> AppResult<()> {
    db::set_setting(&*state.conn()?, ACTIVE_ACCOUNT_SETTING, &puuid)
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, puuid: String) -> AppResult<()> {
    repo::delete_account(&*state.conn()?, &puuid)
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    repo::list_accounts(&*state.conn()?)
}

#[tauri::command]
pub async fn sync_account(app: AppHandle, puuid: String) -> AppResult<SyncReport> {
    sync::run(&app, &puuid).await
}

#[tauri::command]
pub fn get_overview(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Overview> {
    stats::overview(&*state.conn()?, &puuid, season.as_deref())
}

#[tauri::command]
pub fn get_recent_matches(
    state: State<'_, AppState>,
    puuid: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<RecentMatch>> {
    stats::recent_matches(&*state.conn()?, &puuid, limit.unwrap_or(10).clamp(1, 100), offset.unwrap_or(0).max(0))
}

#[tauri::command]
pub fn get_match(state: State<'_, AppState>, puuid: String, match_id: String) -> AppResult<MatchDetail> {
    let conn = state.conn()?;
    let game = storage::load_game(&conn, &match_id)?.ok_or_else(|| AppError::Invalid("Match introuvable".into()))?;
    let map_id = game.pointer("/metadata/map/id").and_then(Value::as_str).unwrap_or_default();
    let map = assets::load_map(&conn, map_id)?;
    let roles = assets::agent_roles(&conn)?;
    let mut detail = analysis::analyze(&game, &puuid, map.as_ref(), &roles)
        .ok_or_else(|| AppError::Invalid("Impossible d'analyser ce match".into()))?;
    if let Some((change, rr)) = conn
        .query_row(
            "SELECT last_change, rr FROM mmr_history WHERE puuid = ?1 AND match_id = ?2",
            params![puuid, match_id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .optional()?
    {
        detail.rr_change = change;
        detail.rr_after = rr;
    }
    Ok(detail)
}

#[tauri::command]
pub fn get_progression(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Progression> {
    progression::progression(&*state.conn()?, &puuid, season.as_deref())
}

#[tauri::command]
pub fn get_recent_flaws(state: State<'_, AppState>, puuid: String) -> AppResult<RecentFlaws> {
    progression::recent_flaws(&*state.conn()?, &puuid)
}

#[tauri::command]
pub fn get_heatmap(
    state: State<'_, AppState>,
    puuid: String,
    map_id: Option<String>,
    season: Option<String>,
    agent_id: Option<String>,
    queue: Option<String>,
    limit: Option<i64>,
) -> AppResult<Heatmap> {
    let filters = heatmap::Filters {
        map_id: map_id.as_deref(),
        season: season.as_deref(),
        agent_id: agent_id.as_deref(),
        queue: queue.as_deref(),
        limit,
    };
    heatmap::heatmap(&*state.conn()?, &puuid, &filters)
}

#[tauri::command]
pub fn get_seasons(state: State<'_, AppState>, puuid: String) -> AppResult<Vec<Season>> {
    stats::seasons(&*state.conn()?, &puuid)
}

#[tauri::command]
pub fn set_preference(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    if !PREFERENCES.contains(&key.as_str()) {
        return Err(AppError::Invalid("Préférence inconnue".into()));
    }
    db::set_setting(&*state.conn()?, &key, &value)
}
