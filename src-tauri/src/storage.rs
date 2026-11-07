use flate2::Compression;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use rusqlite::{Connection, params};
use serde_json::{Map, Value, json};
use std::io::{Read, Write};

use crate::error::{AppError, AppResult};

fn pick(value: &Value, keys: &[&str]) -> Value {
    let mut map = Map::new();
    for key in keys {
        if let Some(field) = value.get(*key) {
            if !field.is_null() {
                map.insert((*key).to_string(), field.clone());
            }
        }
    }
    Value::Object(map)
}

fn each(value: &Value, map: impl Fn(&Value) -> Value) -> Value {
    Value::Array(value.as_array().map(|items| items.iter().map(map).collect()).unwrap_or_default())
}

fn person(value: &Value) -> Value {
    pick(value, &["puuid", "name", "tag", "team"])
}

fn action(value: &Value) -> Value {
    if !value.is_object() {
        return Value::Null;
    }
    json!({
        "round_time_in_ms": value["round_time_in_ms"],
        "site": value["site"],
        "location": value["location"],
        "player": person(&value["player"]),
    })
}

pub fn slim(game: &Value) -> Value {
    json!({
        "metadata": pick(
            &game["metadata"],
            &["match_id", "map", "started_at", "queue", "season", "game_length_in_ms", "region", "cluster", "platform"],
        ),
        "players": each(&game["players"], |player| json!({
            "puuid": player["puuid"],
            "name": player["name"],
            "tag": player["tag"],
            "team_id": player["team_id"],
            "party_id": player["party_id"],
            "agent": pick(&player["agent"], &["id", "name"]),
            "tier": pick(&player["tier"], &["id", "name"]),
            "stats": player["stats"],
            "ability_casts": player["ability_casts"],
        })),
        "teams": each(&game["teams"], |team| pick(team, &["team_id", "won", "rounds"])),
        "rounds": each(&game["rounds"], |round| json!({
            "winning_team": round["winning_team"],
            "winning_team_role": round["winning_team_role"],
            "result": round["result"],
            "ceremony": round["ceremony"],
            "plant": action(&round["plant"]),
            "defuse": action(&round["defuse"]),
            "stats": each(&round["stats"], |stat| json!({
                "player": person(&stat["player"]),
                "ability_casts": stat["ability_casts"],
                "economy": {
                    "loadout_value": stat["economy"]["loadout_value"],
                    "remaining": stat["economy"]["remaining"],
                    "weapon": pick(&stat["economy"]["weapon"], &["name"]),
                    "armor": pick(&stat["economy"]["armor"], &["name"]),
                },
                "stats": pick(&stat["stats"], &["score", "kills", "headshots", "bodyshots", "legshots"]),
                "damage_events": each(&stat["damage_events"], |event| pick(event, &["player", "damage", "headshots", "bodyshots", "legshots"])),
            })),
        })),
        "kills": each(&game["kills"], |kill| json!({
            "round": kill["round"],
            "time_in_round_in_ms": kill["time_in_round_in_ms"],
            "killer": person(&kill["killer"]),
            "victim": person(&kill["victim"]),
            "assistants": each(&kill["assistants"], |assistant| pick(assistant, &["puuid", "team"])),
            "location": kill["location"],
            "weapon": pick(&kill["weapon"], &["name", "type"]),
            "player_locations": each(&kill["player_locations"], |entry| json!({
                "player": pick(&entry["player"], &["puuid", "team"]),
                "location": entry["location"],
                "view_radians": entry["view_radians"],
            })),
        })),
    })
}

pub fn encode(game: &Value) -> AppResult<Vec<u8>> {
    let bytes = serde_json::to_vec(&slim(game)).map_err(|e| AppError::Invalid(e.to_string()))?;
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(7));
    encoder.write_all(&bytes)?;
    Ok(encoder.finish()?)
}

pub fn decode(bytes: &[u8]) -> Option<Value> {
    if bytes.first() == Some(&b'{') {
        return serde_json::from_slice(bytes).ok();
    }
    let mut json = Vec::new();
    DeflateDecoder::new(bytes).read_to_end(&mut json).ok()?;
    serde_json::from_slice(&json).ok()
}

pub fn load_game(conn: &Connection, match_id: &str) -> AppResult<Option<Value>> {
    let mut stmt = conn.prepare("SELECT raw FROM matches WHERE match_id = ?1")?;
    let mut rows = stmt.query(params![match_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(decode(row.get_ref(0)?.as_bytes().map_err(rusqlite::Error::from)?))
}

pub fn compact_existing(conn: &Connection) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare("SELECT match_id FROM matches WHERE typeof(raw) = 'text'")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for id in &ids {
        let Some(game) = load_game(conn, id)? else {
            continue;
        };
        conn.execute("UPDATE matches SET raw = ?2 WHERE match_id = ?1", params![id, encode(&game)?])?;
    }
    if !ids.is_empty() {
        conn.execute_batch("VACUUM;")?;
    }
    Ok(ids.len())
}
