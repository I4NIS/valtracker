use flate2::Compression;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use rusqlite::{Connection, params};
use serde_json::{Map, Value};
use std::io::{Read, Write};

use crate::error::{AppError, AppResult};

const MAX_INFLATED: u64 = 16 * 1024 * 1024;

fn object<const N: usize>(entries: [(&str, Value); N]) -> Value {
    let mut map = Map::new();
    for (key, value) in entries {
        map.insert(key.to_string(), value);
    }
    Value::Object(map)
}

fn take(value: &mut Value, key: &str) -> Value {
    value.get_mut(key).map(Value::take).unwrap_or(Value::Null)
}

fn inner<'a>(value: &'a mut Value, key: &str, field: &str) -> Option<&'a mut Value> {
    value.get_mut(key)?.get_mut(field)
}

fn pick(value: Option<&mut Value>, keys: &[&str]) -> Value {
    let mut map = Map::new();
    if let Some(value) = value {
        for key in keys {
            if let Some(field) = value.get_mut(*key) {
                if !field.is_null() {
                    map.insert((*key).to_string(), field.take());
                }
            }
        }
    }
    Value::Object(map)
}

fn each(value: Option<&mut Value>, map: impl FnMut(&mut Value) -> Value) -> Value {
    Value::Array(value.and_then(Value::as_array_mut).map(|items| items.iter_mut().map(map).collect()).unwrap_or_default())
}

fn person(value: Option<&mut Value>) -> Value {
    pick(value, &["puuid", "name", "tag", "team"])
}

fn action(value: Option<&mut Value>) -> Value {
    match value {
        Some(value) if value.is_object() => object([
            ("round_time_in_ms", take(value, "round_time_in_ms")),
            ("site", take(value, "site")),
            ("location", take(value, "location")),
            ("player", person(value.get_mut("player"))),
        ]),
        _ => Value::Null,
    }
}

fn player(player: &mut Value) -> Value {
    object([
        ("puuid", take(player, "puuid")),
        ("name", take(player, "name")),
        ("tag", take(player, "tag")),
        ("team_id", take(player, "team_id")),
        ("party_id", take(player, "party_id")),
        ("agent", pick(player.get_mut("agent"), &["id", "name"])),
        ("tier", pick(player.get_mut("tier"), &["id", "name"])),
        ("stats", take(player, "stats")),
        ("ability_casts", take(player, "ability_casts")),
        ("customization", pick(player.get_mut("customization"), &["card"])),
    ])
}

fn round_stat(stat: &mut Value) -> Value {
    object([
        ("player", person(stat.get_mut("player"))),
        ("ability_casts", take(stat, "ability_casts")),
        (
            "economy",
            object([
                ("loadout_value", inner(stat, "economy", "loadout_value").map(Value::take).unwrap_or(Value::Null)),
                ("remaining", inner(stat, "economy", "remaining").map(Value::take).unwrap_or(Value::Null)),
                ("weapon", pick(inner(stat, "economy", "weapon"), &["id", "name"])),
                ("armor", pick(inner(stat, "economy", "armor"), &["name"])),
            ]),
        ),
        ("stats", pick(stat.get_mut("stats"), &["score", "kills", "headshots", "bodyshots", "legshots"])),
        (
            "damage_events",
            each(stat.get_mut("damage_events"), |event| pick(Some(event), &["player", "damage", "headshots", "bodyshots", "legshots"])),
        ),
    ])
}

fn round(round: &mut Value) -> Value {
    object([
        ("winning_team", take(round, "winning_team")),
        ("winning_team_role", take(round, "winning_team_role")),
        ("result", take(round, "result")),
        ("ceremony", take(round, "ceremony")),
        ("plant", action(round.get_mut("plant"))),
        ("defuse", action(round.get_mut("defuse"))),
        ("stats", each(round.get_mut("stats"), round_stat)),
    ])
}

fn kill(kill: &mut Value) -> Value {
    object([
        ("round", take(kill, "round")),
        ("time_in_round_in_ms", take(kill, "time_in_round_in_ms")),
        ("killer", person(kill.get_mut("killer"))),
        ("victim", person(kill.get_mut("victim"))),
        ("assistants", each(kill.get_mut("assistants"), |assistant| pick(Some(assistant), &["puuid", "team"]))),
        ("location", take(kill, "location")),
        ("weapon", pick(kill.get_mut("weapon"), &["id", "name", "type"])),
        (
            "player_locations",
            each(kill.get_mut("player_locations"), |entry| {
                object([
                    ("player", pick(entry.get_mut("player"), &["puuid", "team"])),
                    ("location", take(entry, "location")),
                    ("view_radians", take(entry, "view_radians")),
                ])
            }),
        ),
    ])
}

pub fn slim(mut game: Value) -> Value {
    object([
        (
            "metadata",
            pick(
                game.get_mut("metadata"),
                &["match_id", "map", "started_at", "queue", "season", "game_length_in_ms", "region", "cluster", "platform"],
            ),
        ),
        ("players", each(game.get_mut("players"), player)),
        ("teams", each(game.get_mut("teams"), |team| pick(Some(team), &["team_id", "won", "rounds"]))),
        ("rounds", each(game.get_mut("rounds"), round)),
        ("kills", each(game.get_mut("kills"), kill)),
    ])
}

pub fn encode(game: Value) -> AppResult<Vec<u8>> {
    let bytes = serde_json::to_vec(&slim(game)).map_err(|e| AppError::Invalid(e.to_string()))?;
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(7));
    encoder.write_all(&bytes)?;
    Ok(encoder.finish()?)
}

pub fn inflate(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.first() == Some(&b'{') {
        return Some(bytes.to_vec());
    }
    let mut json = Vec::new();
    DeflateDecoder::new(bytes).take(MAX_INFLATED + 1).read_to_end(&mut json).ok()?;
    (json.len() as u64 <= MAX_INFLATED).then_some(json)
}

pub fn decode(bytes: &[u8]) -> Option<Value> {
    serde_json::from_slice(&inflate(bytes)?).ok()
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
        conn.execute("UPDATE matches SET raw = ?2 WHERE match_id = ?1", params![id, encode(game)?])?;
    }
    if !ids.is_empty() {
        conn.execute_batch("VACUUM;")?;
    }
    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    mod reference {
        use serde_json::{Map, Value, json};

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
                    "customization": pick(&player["customization"], &["card"]),
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
                            "weapon": pick(&stat["economy"]["weapon"], &["id", "name"]),
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
                    "weapon": pick(&kill["weapon"], &["id", "name", "type"]),
                    "player_locations": each(&kill["player_locations"], |entry| json!({
                        "player": pick(&entry["player"], &["puuid", "team"]),
                        "location": entry["location"],
                        "view_radians": entry["view_radians"],
                    })),
                })),
            })
        }
    }

    fn same_slim(game: &Value) {
        let expected = serde_json::to_vec(&reference::slim(game)).unwrap();
        let found = serde_json::to_vec(&slim(game.clone())).unwrap();
        assert!(expected == found, "slim output changed for {}", game.pointer("/metadata/match_id").unwrap_or(&Value::Null));
    }

    #[test]
    fn slim_keeps_its_exact_output_on_odd_shapes() {
        same_slim(&json!({}));
        same_slim(&json!({ "metadata": "x", "players": {}, "rounds": [1, null, {}], "kills": [null, "k", { "killer": 3 }] }));
        same_slim(&json!({
            "metadata": { "match_id": "m", "map": { "id": "a" }, "queue": null, "extra": 1 },
            "players": [{ "puuid": "p", "agent": null, "tier": { "id": 3, "name": null }, "stats": { "score": 1 }, "customization": { "card": "c", "title": "t" } }],
            "teams": [{ "team_id": "Red", "won": true, "rounds": { "won": 13 }, "premier": null }],
            "rounds": [{
                "winning_team": "Red",
                "plant": { "round_time_in_ms": 1, "site": "A", "player": { "puuid": "p", "extra": 2 }, "extra": 3 },
                "defuse": "none",
                "stats": [
                    { "player": { "puuid": "p" }, "economy": { "loadout_value": 3900, "weapon": { "id": "w", "type": "x" }, "armor": null } },
                    { "economy": "broken", "stats": [1], "damage_events": [{ "player": { "puuid": "q" }, "damage": 10, "extra": 1 }, 5] },
                ],
            }],
            "kills": [{ "round": 0, "killer": { "puuid": "p", "team": "Red", "card": "x" }, "assistants": [{ "puuid": "q" }], "location": { "x": 1.5, "y": -2 },
                        "weapon": { "id": "w", "name": "Vandal", "type": "Weapon", "assets": {} },
                        "player_locations": [{ "player": { "puuid": "p" }, "location": { "x": 1, "y": 2 }, "view_radians": 0.5 }, null] }],
        }));
    }

    #[test]
    fn slim_keeps_its_exact_output_on_real_matches() {
        if let Some(path) = std::env::var_os("VALTRACKER_EQUIV_PAGE") {
            let page: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
            let games = page["data"].as_array().unwrap();
            assert!(!games.is_empty());
            games.iter().for_each(same_slim);
        }
        if let Some(setup) = crate::equivalence::setup("slim") {
            let mut stmt = setup.conn.prepare("SELECT raw FROM matches").unwrap();
            let mut rows = stmt.query([]).unwrap();
            while let Some(row) = rows.next().unwrap() {
                same_slim(&decode(row.get_ref(0).unwrap().as_bytes().unwrap()).unwrap());
            }
        }
    }

    fn deflate(bytes: &[u8]) -> Vec<u8> {
        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(9));
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn inflates_a_stored_match() {
        let game = json!({ "metadata": { "match_id": "abc" } });
        assert_eq!(decode(&encode(game).unwrap()).unwrap()["metadata"]["match_id"], "abc");
    }

    #[test]
    fn refuses_a_decompression_bomb() {
        let bomb = deflate(&vec![b' '; MAX_INFLATED as usize + 1]);
        assert!(inflate(&bomb).is_none());
        assert!(inflate(&deflate(&[b' '; 1024])).is_some());
    }
}
