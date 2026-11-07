use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::db;
use crate::error::AppResult;
use crate::extras;
use crate::henrik::Henrik;
use crate::state::AppState;

const DAY: i64 = 86_400;
const RETRY: i64 = 3_600;
const MAX_AGE: i64 = 7 * DAY;
const COMPETITIVE: &str = "competitive";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationMap {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rotation {
    pub region: String,
    pub fetched_at: i64,
    pub maps: Vec<RotationMap>,
}

fn data_key(region: &str) -> String {
    format!("map_rotation|{region}")
}

fn next_key(region: &str) -> String {
    format!("map_rotation_next|{region}")
}

fn text<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str).map(str::trim).filter(|text| !text.is_empty())
}

pub fn competitive_maps(data: &Value) -> Option<Vec<RotationMap>> {
    let queue = data.as_array()?.iter().find(|queue| {
        text(queue, "/mode_id").is_some_and(|id| id.eq_ignore_ascii_case(COMPETITIVE))
            || text(queue, "/mode").is_some_and(|mode| mode.eq_ignore_ascii_case(COMPETITIVE))
    })?;
    if queue.get("enabled").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let maps: Vec<RotationMap> = queue
        .get("maps")?
        .as_array()?
        .iter()
        .filter(|entry| entry.get("enabled").and_then(Value::as_bool) == Some(true))
        .filter_map(|entry| {
            Some(RotationMap { id: text(entry, "/map/id").unwrap_or_default().to_string(), name: text(entry, "/map/name")?.to_string() })
        })
        .collect();
    (!maps.is_empty()).then_some(maps)
}

fn load(conn: &Connection, region: &str) -> Option<Rotation> {
    let raw = db::get_setting(conn, &data_key(region)).ok().flatten()?;
    serde_json::from_str(&raw).ok()
}

fn save(conn: &Connection, rotation: &Rotation) -> AppResult<()> {
    let raw = serde_json::to_string(rotation).map_err(|err| crate::error::AppError::Invalid(err.to_string()))?;
    db::set_setting(conn, &data_key(&rotation.region), &raw)
}

pub async fn refresh(state: &AppState, api: &Henrik, region: &str) -> bool {
    if !state.conn().is_ok_and(|conn| extras::due(&conn, &next_key(region))) {
        return false;
    }
    extras::idle(state).await;
    let maps = api.queue_status(region).await.ok().and_then(|data| competitive_maps(&data));
    let Ok(conn) = state.conn() else {
        return false;
    };
    let Some(maps) = maps else {
        extras::next_in(&conn, &next_key(region), RETRY);
        return false;
    };
    let previous = load(&conn, region).map(|rotation| rotation.maps);
    let rotation = Rotation { region: region.to_string(), fetched_at: extras::now(), maps };
    if save(&conn, &rotation).is_err() {
        return false;
    }
    extras::next_in(&conn, &next_key(region), DAY);
    previous.as_ref() != Some(&rotation.maps)
}

#[tauri::command(async)]
pub fn get_map_rotation(state: State<'_, AppState>, region: String) -> AppResult<Option<Rotation>> {
    let region = region.trim().to_lowercase();
    let rotation = state.read(|conn| Ok(load(conn, &region)))?;
    Ok(rotation.filter(|rotation| extras::now() - rotation.fetched_at <= MAX_AGE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_enabled_competitive_maps_only() {
        let data = serde_json::json!([
            { "mode": "Unrated", "mode_id": "unrated", "enabled": true, "maps": [{ "map": { "id": "u", "name": "Split" }, "enabled": true }] },
            { "mode": "Competitive", "mode_id": "competitive", "enabled": true, "maps": [
                { "map": { "id": "a", "name": "Ascent" }, "enabled": true },
                { "map": { "id": "b", "name": "Bind" }, "enabled": false },
                { "map": { "id": "", "name": "Haven" }, "enabled": true },
                { "map": { "id": "x" }, "enabled": true }
            ] }
        ]);
        let maps = competitive_maps(&data).unwrap();
        assert_eq!(maps, [RotationMap { id: "a".into(), name: "Ascent".into() }, RotationMap { id: String::new(), name: "Haven".into() }]);
    }

    #[test]
    fn ignores_a_disabled_or_missing_queue() {
        assert!(competitive_maps(&serde_json::json!([{ "mode_id": "competitive", "enabled": false, "maps": [] }])).is_none());
        assert!(competitive_maps(&serde_json::json!([{ "mode_id": "unrated", "enabled": true, "maps": [] }])).is_none());
        assert!(competitive_maps(&Value::Null).is_none());
    }
}
