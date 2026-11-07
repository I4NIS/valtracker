use reqwest::Client;
use rusqlite::{Connection, params};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::db;
use crate::error::AppResult;
use crate::state::AppState;

const MAPS_URL: &str = "https://valorant-api.com/v1/maps";
const AGENTS_URL: &str = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const REFRESHED_SETTING: &str = "assets_refreshed_at";
const REFRESH_EVERY_SECS: i64 = 3 * 24 * 3600;

pub struct Callout {
    pub name: String,
    pub x: f64,
    pub y: f64,
}

pub struct MapData {
    pub display_icon: Option<String>,
    pub x_multiplier: f64,
    pub y_multiplier: f64,
    pub x_scalar: f64,
    pub y_scalar: f64,
    pub callouts: Vec<Callout>,
}

impl MapData {
    pub fn project(&self, game_x: f64, game_y: f64) -> (f64, f64) {
        (game_y * self.x_multiplier + self.x_scalar, game_x * self.y_multiplier + self.y_scalar)
    }

    pub fn zone(&self, game_x: f64, game_y: f64) -> Option<String> {
        self.callouts
            .iter()
            .min_by(|a, b| {
                let da = (a.x - game_x).powi(2) + (a.y - game_y).powi(2);
                let db = (b.x - game_x).powi(2) + (b.y - game_y).powi(2);
                da.total_cmp(&db)
            })
            .map(|callout| callout.name.clone())
    }
}

pub async fn refresh_if_needed(state: &AppState) -> AppResult<()> {
    let now = unix_now();
    let stale = {
        let conn = state.conn()?;
        let last = db::get_setting(&conn, REFRESHED_SETTING)?.and_then(|value| value.parse::<i64>().ok());
        let empty: i64 = conn.query_row("SELECT COUNT(*) FROM maps", [], |row| row.get(0))?;
        empty == 0 || last.is_none_or(|last| now - last > REFRESH_EVERY_SECS)
    };
    if !stale {
        return Ok(());
    }
    let client = Client::builder().timeout(Duration::from_secs(30)).build().unwrap_or_default();
    let maps: Value = client.get(MAPS_URL).send().await?.json().await?;
    let agents: Value = client.get(AGENTS_URL).send().await?.json().await?;
    let mut conn = state.conn()?;
    store(&mut conn, &maps, &agents)?;
    db::set_setting(&conn, REFRESHED_SETTING, &now.to_string())
}

fn store(conn: &mut Connection, maps: &Value, agents: &Value) -> AppResult<()> {
    let tx = conn.transaction()?;
    for map in maps.pointer("/data").and_then(Value::as_array).into_iter().flatten() {
        let (Some(uuid), Some(name)) = (map["uuid"].as_str(), map["displayName"].as_str()) else {
            continue;
        };
        let callouts: Vec<Value> = map["callouts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|callout| {
                let region = callout["regionName"].as_str()?;
                let super_region = callout["superRegionName"].as_str().unwrap_or_default();
                Some(serde_json::json!({
                    "name": format!("{super_region} {region}").trim(),
                    "x": callout.pointer("/location/x")?.as_f64()?,
                    "y": callout.pointer("/location/y")?.as_f64()?,
                }))
            })
            .collect();
        tx.execute(
            "INSERT OR REPLACE INTO maps (uuid, name, display_icon, x_multiplier, y_multiplier, x_scalar, y_scalar, callouts)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                uuid,
                name,
                map["displayIcon"].as_str(),
                map["xMultiplier"].as_f64().unwrap_or(0.0),
                map["yMultiplier"].as_f64().unwrap_or(0.0),
                map["xScalarToAdd"].as_f64().unwrap_or(0.0),
                map["yScalarToAdd"].as_f64().unwrap_or(0.0),
                Value::Array(callouts).to_string(),
            ],
        )?;
    }
    for agent in agents.pointer("/data").and_then(Value::as_array).into_iter().flatten() {
        let (Some(uuid), Some(name)) = (agent["uuid"].as_str(), agent["displayName"].as_str()) else {
            continue;
        };
        tx.execute(
            "INSERT OR REPLACE INTO agents (uuid, name, role, icon) VALUES (?1, ?2, ?3, ?4)",
            params![uuid, name, agent.pointer("/role/displayName").and_then(Value::as_str), agent["displayIcon"].as_str()],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn load_map(conn: &Connection, map_id: &str) -> AppResult<Option<MapData>> {
    let mut stmt = conn.prepare(
        "SELECT display_icon, x_multiplier, y_multiplier, x_scalar, y_scalar, callouts FROM maps WHERE uuid = ?1",
    )?;
    let mut rows = stmt.query(params![map_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let raw: String = row.get(5)?;
    let callouts = serde_json::from_str::<Vec<Value>>(&raw)
        .unwrap_or_default()
        .iter()
        .filter_map(|callout| {
            Some(Callout {
                name: callout["name"].as_str()?.to_string(),
                x: callout["x"].as_f64()?,
                y: callout["y"].as_f64()?,
            })
        })
        .collect();
    Ok(Some(MapData {
        display_icon: row.get(0)?,
        x_multiplier: row.get(1)?,
        y_multiplier: row.get(2)?,
        x_scalar: row.get(3)?,
        y_scalar: row.get(4)?,
        callouts,
    }))
}

pub fn agent_roles(conn: &Connection) -> AppResult<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT uuid, role FROM agents WHERE role IS NOT NULL")?;
    let roles = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    Ok(roles)
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs() as i64)
}
