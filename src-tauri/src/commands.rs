use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use crate::analysis::{self, MatchDetail};
use crate::assets;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::heatmap;
use crate::henrik::Henrik;
use crate::i18n::tr;
use crate::models::{Account, Season, SyncReport};
use crate::notify;
use crate::reports::Report;
use crate::repo;
use crate::state::AppState;
use crate::stats;
use crate::storage;
use crate::sync::{self, ACTIVE_ACCOUNT_SETTING, API_KEY_SETTING, COMBINED_SETTING};
use crate::thresholds::Thresholds;

const REGIONS: [&str; 6] = ["eu", "na", "ap", "kr", "latam", "br"];
const PREFERENCES: [&str; 4] = ["theme", "language", "tutorial_done", notify::NOTIFY_SETTING];
const MAX_API_KEY_LEN: usize = 128;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    has_api_key: bool,
    accounts: Vec<Account>,
    active_puuid: Option<String>,
    theme: String,
    language: String,
    tutorial_done: bool,
    notify_matches: bool,
    combined: bool,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    let conn = state.conn()?;
    let accounts = repo::list_accounts(&conn)?;
    let active = db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING)?
        .filter(|puuid| accounts.iter().any(|account| &account.puuid == puuid))
        .or_else(|| accounts.first().map(|account| account.puuid.clone()));
    let combined = accounts.len() > 1 && db::get_setting(&conn, COMBINED_SETTING)?.as_deref() == Some("true");
    Ok(Bootstrap {
        has_api_key: db::get_setting(&conn, API_KEY_SETTING)?.is_some_and(|key| !key.is_empty()),
        accounts,
        active_puuid: active,
        theme: db::get_setting(&conn, "theme")?.unwrap_or_else(|| "dark".into()),
        language: db::get_setting(&conn, "language")?.unwrap_or_else(|| "fr".into()),
        tutorial_done: db::get_setting(&conn, "tutorial_done")?.as_deref() == Some("true"),
        notify_matches: notify::enabled(&conn)?,
        combined,
    })
}

#[tauri::command]
pub fn save_api_key(state: State<'_, AppState>, key: String) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::Invalid(tr("La clé API est vide", "The API key is empty").into()));
    }
    if !valid_api_key(key) {
        return Err(AppError::Invalid(
            tr("Cette clé API n'a pas un format valide", "This API key does not have a valid format").into(),
        ));
    }
    db::set_setting(&*state.conn()?, API_KEY_SETTING, key)
}

fn valid_api_key(key: &str) -> bool {
    key.len() <= MAX_API_KEY_LEN && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
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
        .ok_or_else(|| {
            AppError::Invalid(tr("Le Riot ID doit être au format Pseudo#TAG", "The Riot ID must use the Name#TAG format").into())
        })?;
    let region = region.trim().to_lowercase();
    if !REGIONS.contains(&region.as_str()) {
        return Err(AppError::Invalid(tr("Région inconnue", "Unknown region").into()));
    }
    let key = db::get_setting(&*state.conn()?, API_KEY_SETTING)?
        .ok_or_else(|| AppError::Invalid(tr("Ajoute d'abord ta clé API HenrikDev", "Add your HenrikDev API key first").into()))?;
    let data = Henrik::new(key)?.account(&name, &tag).await?;
    let conn = state.conn()?;
    let puuid = repo::upsert_account(&conn, &data, &region)?
        .ok_or_else(|| AppError::Api(tr("Réponse inattendue de l'API HenrikDev", "Unexpected response from the HenrikDev API").into()))?;
    db::set_setting(&conn, ACTIVE_ACCOUNT_SETTING, &puuid)?;
    forget_combined(&state);
    repo::get_account(&conn, &puuid)?.ok_or_else(|| AppError::Invalid(tr("Compte introuvable", "Account not found").into()))
}

#[tauri::command]
pub fn set_active_account(state: State<'_, AppState>, puuid: String) -> AppResult<()> {
    let conn = state.conn()?;
    db::set_setting(&conn, COMBINED_SETTING, "false")?;
    db::set_setting(&conn, ACTIVE_ACCOUNT_SETTING, &puuid)
}

#[tauri::command]
pub fn set_combined_view(state: State<'_, AppState>, enabled: bool) -> AppResult<()> {
    let conn = state.conn()?;
    if enabled && repo::list_accounts(&conn)?.len() < 2 {
        return Err(AppError::Invalid(
            tr("La vue combinée demande au moins deux comptes", "The combined view needs at least two accounts").into(),
        ));
    }
    db::set_setting(&conn, COMBINED_SETTING, if enabled { "true" } else { "false" })
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, puuid: String) -> AppResult<()> {
    repo::delete_account(&*state.conn()?, &puuid)?;
    forget_combined(&state);
    stats::forget_groups();
    Ok(())
}

fn forget_combined(state: &AppState) {
    let prefix = format!("{}|", stats::ALL_ACCOUNTS);
    state.forget(|key| key.starts_with(&prefix));
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    repo::list_accounts(&*state.conn()?)
}

#[tauri::command]
pub async fn sync_account(app: AppHandle, puuid: String) -> AppResult<SyncReport> {
    sync::run(&app, &puuid).await
}

#[tauri::command(async)]
pub fn get_overview(state: State<'_, AppState>, puuid: String, filters: Option<stats::Filters>) -> AppResult<Response> {
    Report::Overview(filters.unwrap_or_default()).serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn get_filter_options(state: State<'_, AppState>, puuid: String) -> AppResult<Response> {
    Report::FilterOptions.serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn get_recent_matches(
    state: State<'_, AppState>,
    puuid: String,
    limit: Option<i64>,
    offset: Option<i64>,
    filters: Option<stats::Filters>,
) -> AppResult<Response> {
    Report::Recent(filters.unwrap_or_default(), limit.unwrap_or(10).clamp(1, 2000), offset.unwrap_or(0).max(0))
        .serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn get_match(state: State<'_, AppState>, puuid: String, match_id: String) -> AppResult<Response> {
    state.cached(format!("{puuid}|Match({match_id})"), |conn| {
        let detail = match_detail(conn, &puuid, &match_id)?;
        serde_json::to_string(&detail).map_err(|err| AppError::Invalid(err.to_string()))
    })
}

fn match_detail(conn: &Connection, puuid: &str, match_id: &str) -> AppResult<MatchDetail> {
    let game =
        storage::load_game(conn, match_id)?.ok_or_else(|| AppError::Invalid(tr("Match introuvable", "Match not found").into()))?;
    let map_id = game.pointer("/metadata/map/id").and_then(Value::as_str).unwrap_or_default();
    let map = assets::load_map(conn, map_id)?;
    let roles = assets::agent_roles(conn)?;
    let thresholds = Thresholds::load(conn)?;
    let mut detail = analysis::analyze(&game, puuid, map.as_ref(), &roles, &thresholds)
        .ok_or_else(|| AppError::Invalid(tr("Impossible d'analyser ce match", "Could not analyze this match").into()))?;
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

#[tauri::command(async)]
pub fn get_progression(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Response> {
    Report::Progression(season).serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn get_recent_flaws(state: State<'_, AppState>, puuid: String) -> AppResult<Response> {
    Report::Flaws.serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn get_heatmap(
    state: State<'_, AppState>,
    puuid: String,
    map_id: Option<String>,
    season: Option<String>,
    agent_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Response> {
    let key = format!("{puuid}|Heatmap({map_id:?},{season:?},{agent_id:?},{limit:?})");
    let filters = heatmap::Filters {
        map_id: map_id.as_deref(),
        season: season.as_deref(),
        agent_id: agent_id.as_deref(),
        queue: Some("competitive"),
        limit,
    };
    state.cached(key, |conn| {
        let heatmap = heatmap::heatmap(conn, &puuid, &filters)?;
        serde_json::to_string(&heatmap).map_err(|err| AppError::Invalid(err.to_string()))
    })
}

#[tauri::command]
pub fn get_seasons(state: State<'_, AppState>, puuid: String) -> AppResult<Vec<Season>> {
    stats::seasons(&*state.conn()?, &puuid)
}

#[tauri::command]
pub fn set_preference(app: AppHandle, state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    if !PREFERENCES.contains(&key.as_str()) {
        return Err(AppError::Invalid(tr("Préférence inconnue", "Unknown preference").into()));
    }
    let conn = state.conn()?;
    db::set_setting(&conn, &key, &value)?;
    if key == crate::i18n::LANGUAGE_SETTING {
        crate::i18n::set(&value);
        crate::tray::relabel(&app);
        let active = db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING)?;
        drop(conn);
        state.invalidate();
        if let Some(puuid) = active {
            crate::reports::warm(&app, puuid);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_plausible_api_keys() {
        assert!(valid_api_key("HDEV-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"));
        assert!(!valid_api_key("HDEV-1a2b 3c4d"));
        assert!(!valid_api_key("HDEV-1a2b\r\nX-Injected: oui"));
        assert!(!valid_api_key("clé"));
        assert!(!valid_api_key(&"a".repeat(MAX_API_KEY_LEN + 1)));
    }
}
