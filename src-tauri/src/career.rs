use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::henrik::Henrik;
use crate::repo;
use crate::state::AppState;
use crate::sync::API_KEY_SETTING;

const REFRESH_SECS: i64 = 24 * 60 * 60;
const ACCOLADES: &str = "accolades";
const KINDS: [&str; 1] = [ACCOLADES];

static RUNNING: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

struct Running(String);

impl Running {
    fn start(puuid: &str) -> Option<Self> {
        let mut running = RUNNING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        running.insert(puuid.to_string()).then(|| Self(puuid.to_string()))
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        RUNNING.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(&self.0);
    }
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64)
}

fn report_key(puuid: &str, kind: &str) -> String {
    format!("{puuid}|Career({kind})")
}

fn due(conn: &Connection, puuid: &str, kind: &str, at: i64) -> AppResult<bool> {
    let fetched: Option<i64> = conn
        .query_row("SELECT fetched_at FROM career_cache WHERE puuid = ?1 AND kind = ?2", params![puuid, kind], |row| row.get(0))
        .optional()?;
    Ok(fetched.is_none_or(|fetched| at - fetched >= REFRESH_SECS || fetched > at))
}

fn mark_tried(conn: &Connection, puuid: &str, kind: &str, at: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO career_cache (puuid, kind, fetched_at, body) VALUES (?1, ?2, ?3, NULL)
         ON CONFLICT(puuid, kind) DO UPDATE SET fetched_at = excluded.fetched_at",
        params![puuid, kind, at],
    )?;
    Ok(())
}

fn store_body(conn: &Connection, puuid: &str, kind: &str, at: i64, body: &Value) -> AppResult<()> {
    conn.execute(
        "INSERT INTO career_cache (puuid, kind, fetched_at, body) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(puuid, kind) DO UPDATE SET fetched_at = excluded.fetched_at, body = excluded.body",
        params![puuid, kind, at, body.to_string()],
    )?;
    Ok(())
}

fn body(conn: &Connection, puuid: &str, kind: &str) -> AppResult<Option<Value>> {
    let text: Option<String> = conn
        .query_row("SELECT body FROM career_cache WHERE puuid = ?1 AND kind = ?2", params![puuid, kind], |row| row.get(0))
        .optional()?
        .flatten();
    Ok(text.and_then(|text| serde_json::from_str(&text).ok()))
}

pub fn store_accolades(conn: &Connection, puuid: &str, at: i64, data: &Value) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM match_accolades WHERE puuid = ?1", params![puuid])?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO match_accolades (puuid, match_id, accolade, kind, value, act_record)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for game in data.get("matches").and_then(Value::as_array).into_iter().flatten() {
            let Some(match_id) = game.get("match_id").and_then(Value::as_str) else {
                continue;
            };
            let mine = game
                .get("players")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter(|player| player.get("puuid").and_then(Value::as_str) == Some(puuid));
            for accolade in mine.flat_map(|player| player.get("accolades").and_then(Value::as_array).into_iter().flatten()) {
                let (Some(id), Some(value)) = (accolade.get("id").and_then(Value::as_str), accolade.get("value").and_then(Value::as_f64)) else {
                    continue;
                };
                stmt.execute(params![
                    puuid,
                    match_id,
                    id,
                    accolade.get("type").and_then(Value::as_str),
                    value,
                    accolade.get("is_act_record").and_then(Value::as_bool).unwrap_or(false),
                ])?;
            }
        }
    }
    store_body(&tx, puuid, ACCOLADES, at, &json!({ "summary": data.get("summary").cloned().unwrap_or(Value::Null) }))?;
    tx.commit()?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccoladeStat {
    pub id: String,
    pub kind: Option<String>,
    pub count: i64,
    pub best: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accolades {
    pub available: bool,
    pub all_time: Vec<AccoladeStat>,
    pub matches: i64,
}

fn accolade_stat(value: &Value) -> Option<AccoladeStat> {
    Some(AccoladeStat {
        id: value.get("id")?.as_str()?.to_string(),
        kind: value.get("type").and_then(Value::as_str).map(str::to_string),
        count: value.get("count").and_then(Value::as_i64).unwrap_or(0),
        best: value.get("best_value").and_then(Value::as_f64).unwrap_or(0.0),
    })
}

pub fn accolades(conn: &Connection, puuid: &str) -> AppResult<Accolades> {
    let Some(body) = body(conn, puuid, ACCOLADES)? else {
        return Ok(Accolades::default());
    };
    let mut all_time: Vec<AccoladeStat> =
        body.pointer("/summary/all_time").and_then(Value::as_array).into_iter().flatten().filter_map(accolade_stat).collect();
    all_time.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.id.cmp(&b.id)));
    let matches = conn.query_row("SELECT COUNT(DISTINCT match_id) FROM match_accolades WHERE puuid = ?1", params![puuid], |row| row.get(0))?;
    Ok(Accolades { available: true, all_time, matches })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchAccolade {
    pub id: String,
    pub kind: Option<String>,
    pub value: f64,
    pub act_record: bool,
}

pub fn match_accolades(conn: &Connection, puuid: &str, match_id: &str) -> AppResult<Vec<MatchAccolade>> {
    let mut stmt = conn.prepare_cached(
        "SELECT accolade, kind, value, act_record FROM match_accolades WHERE puuid = ?1 AND match_id = ?2 ORDER BY act_record DESC, accolade",
    )?;
    let list = stmt
        .query_map(params![puuid, match_id], |row| {
            Ok(MatchAccolade { id: row.get(0)?, kind: row.get(1)?, value: row.get(2)?, act_record: row.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(list)
}

#[tauri::command(async)]
pub fn get_accolades(state: tauri::State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    state.cached(report_key(&puuid, ACCOLADES), |conn| {
        serde_json::to_string(&accolades(conn, &puuid)?).map_err(|err| AppError::Invalid(err.to_string()))
    })
}

pub fn spawn_refresh(app: &AppHandle, puuid: &str) {
    let app = app.clone();
    let puuid = puuid.to_string();
    tauri::async_runtime::spawn(async move {
        let Some(_running) = Running::start(&puuid) else {
            return;
        };
        if refresh(&app, &puuid).await.unwrap_or(false) {
            let state = app.state::<AppState>();
            state.forget(|key| KINDS.iter().any(|kind| key == report_key(&puuid, kind)));
            let _ = app.emit("career-changed", &puuid);
        }
    });
}

async fn fetch(api: &Henrik, kind: &str, region: &str, platform: &str, puuid: &str) -> AppResult<Value> {
    match kind {
        ACCOLADES => api.accolades(region, platform, puuid).await,
        _ => Err(AppError::NotFound),
    }
}

async fn refresh(app: &AppHandle, puuid: &str) -> AppResult<bool> {
    let state = app.state::<AppState>();
    let at = now();
    let (key, account, kinds) = {
        let conn = state.conn()?;
        let Some(key) = db::get_setting(&conn, API_KEY_SETTING)?.filter(|key| !key.is_empty()) else {
            return Ok(false);
        };
        let Some(account) = repo::get_account(&conn, puuid)? else {
            return Ok(false);
        };
        let mut kinds = Vec::new();
        for kind in KINDS {
            if due(&conn, puuid, kind, at)? {
                kinds.push(kind);
            }
        }
        (key, account, kinds)
    };
    if kinds.is_empty() {
        return Ok(false);
    }
    let api = Henrik::new(key)?;
    let mut changed = false;
    for kind in kinds {
        let result = fetch(&api, kind, &account.region, &account.platform, puuid).await;
        let conn = state.conn()?;
        match result {
            Ok(data) if data.is_object() => {
                match kind {
                    ACCOLADES => store_accolades(&conn, puuid, at, &data)?,
                    _ => store_body(&conn, puuid, kind, at, &data)?,
                }
                changed = true;
            }
            Ok(_) | Err(AppError::NotFound | AppError::Api(_)) => mark_tried(&conn, puuid, kind, at)?,
            Err(_) => {}
        }
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        db::migrate(&conn).unwrap();
        conn.execute("INSERT INTO accounts (puuid, name, tag, region) VALUES ('me', 'Moi', 'EUW', 'eu')", []).unwrap();
        conn
    }

    #[test]
    fn refreshes_once_a_day_and_keeps_the_last_good_body() {
        let conn = conn();
        assert!(due(&conn, "me", ACCOLADES, 1_000_000).unwrap());
        mark_tried(&conn, "me", ACCOLADES, 1_000_000).unwrap();
        assert!(!due(&conn, "me", ACCOLADES, 1_000_000 + 3600).unwrap());
        assert!(due(&conn, "me", ACCOLADES, 1_000_000 + REFRESH_SECS).unwrap());
        assert!(!accolades(&conn, "me").unwrap().available);

        let data = json!({
            "account": {"puuid": "me", "name": "Moi", "tag": "EUW"},
            "summary": {"all_time": [{"id": "g1", "type": "kills", "count": 4, "best_value": 31.0}, {"id": "g2", "type": "aces", "count": 9, "best_value": 1.0}], "seasons": []},
            "matches": [
                {"match_id": "m1", "started_at": null, "players": [
                    {"puuid": "me", "accolades": [{"id": "g1", "type": "kills", "value": 31.0, "is_act_record": true}]},
                    {"puuid": "other", "accolades": [{"id": "g2", "type": "aces", "value": 1.0, "is_act_record": false}]}
                ]},
                {"match_id": null, "players": []}
            ]
        });
        store_accolades(&conn, "me", 2_000_000, &data).unwrap();
        mark_tried(&conn, "me", ACCOLADES, 2_100_000).unwrap();
        let report = accolades(&conn, "me").unwrap();
        assert!(report.available);
        assert_eq!(report.matches, 1);
        assert_eq!(report.all_time[0].id, "g2");
        assert_eq!(report.all_time[1].best, 31.0);
        let found = match_accolades(&conn, "me", "m1").unwrap();
        assert_eq!(found.len(), 1);
        assert!(found[0].act_record);
        assert_eq!(found[0].kind.as_deref(), Some("kills"));
        assert!(match_accolades(&conn, "other", "m1").unwrap().is_empty());
    }
}
