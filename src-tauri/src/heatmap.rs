use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;

use crate::analysis::{attack_side, attacks_first, int, point, text};
use crate::assets;
use crate::error::AppResult;
use crate::storage;

const EARLY_ROUND_MS: i64 = 20_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatPoint {
    pub kind: &'static str,
    pub x: f64,
    pub y: f64,
    pub attack: bool,
    pub phase: &'static str,
    pub zone: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapOption {
    pub id: String,
    pub name: String,
    pub matches: i64,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Heatmap {
    pub maps: Vec<MapOption>,
    pub map_id: Option<String>,
    pub minimap: Option<String>,
    pub splash: Option<String>,
    pub rotation: i32,
    pub matches: i64,
    pub points: Vec<HeatPoint>,
}

pub fn heatmap(conn: &Connection, puuid: &str, map_id: Option<&str>, season: Option<&str>) -> AppResult<Heatmap> {
    let mut stmt = conn.prepare(
        "SELECT m.map_id, COALESCE(m.map_name, ''), COUNT(*), (SELECT splash FROM maps WHERE uuid = m.map_id)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id IS NOT NULL AND (?2 IS NULL OR m.season_short = ?2)
         GROUP BY m.map_id
         ORDER BY COUNT(*) DESC",
    )?;
    let maps = stmt
        .query_map(params![puuid, season], |row| {
            Ok(MapOption { id: row.get(0)?, name: row.get(1)?, matches: row.get(2)?, image: row.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let selected = map_id
        .filter(|id| maps.iter().any(|map| map.id == *id))
        .map(str::to_string)
        .or_else(|| maps.first().map(|map| map.id.clone()));
    let Some(selected) = selected else {
        return Ok(Heatmap { maps, map_id: None, minimap: None, splash: None, rotation: 0, matches: 0, points: Vec::new() });
    };
    let data = assets::load_map(conn, &selected)?;

    let mut stmt = conn.prepare(
        "SELECT m.raw FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
    )?;
    let raws = stmt
        .query_map(params![puuid, selected, season], |row| Ok(row.get_ref(0)?.as_bytes()?.to_vec()))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut points = Vec::new();
    let matches = raws.len() as i64;
    if let Some(map) = &data {
        for raw in raws {
            let Some(game) = storage::decode(&raw) else {
                continue;
            };
            collect(&game, puuid, map, &mut points);
        }
    }

    Ok(Heatmap {
        maps,
        rotation: data.as_ref().map_or(0, assets::MapData::rotation),
        splash: data.as_ref().and_then(|map| map.splash.clone()),
        minimap: data.and_then(|map| map.display_icon),
        map_id: Some(selected),
        matches,
        points,
    })
}

fn collect(game: &Value, puuid: &str, map: &assets::MapData, points: &mut Vec<HeatPoint>) {
    let empty = Vec::new();
    let players = game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty);
    let Some(team) = players
        .iter()
        .find(|player| text(player, "/puuid") == Some(puuid))
        .and_then(|player| text(player, "/team_id"))
    else {
        return;
    };
    let attack_first = attacks_first(game, team);
    let rounds = game.pointer("/rounds").and_then(Value::as_array).unwrap_or(&empty);

    for kill in game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty) {
        let round = int(kill, "/round") as usize;
        let time = int(kill, "/time_in_round_in_ms");
        let plant = rounds
            .get(round)
            .and_then(|r| r.pointer("/plant/round_time_in_ms"))
            .and_then(Value::as_i64);
        let phase = match plant {
            Some(planted_at) if time > planted_at => "post",
            _ if time < EARLY_ROUND_MS => "early",
            _ => "mid",
        };
        let attack = attack_side(round, attack_first);
        let mut push = |kind: &'static str, spot: (f64, f64)| {
            let (x, y) = map.project(spot.0, spot.1);
            points.push(HeatPoint { kind, x, y, attack, phase, zone: map.zone(spot.0, spot.1) });
        };
        let killer = text(kill, "/killer/puuid").unwrap_or_default();
        if text(kill, "/victim/puuid") == Some(puuid) {
            if let Some(spot) = point(kill, "/location") {
                push("death", spot);
            }
            let killer_spot = kill
                .pointer("/player_locations")
                .and_then(Value::as_array)
                .and_then(|list| list.iter().find(|entry| text(entry, "/player/puuid") == Some(killer)))
                .and_then(|entry| point(entry, "/location"));
            if let Some(spot) = killer_spot {
                push("killer", spot);
            }
        } else if killer == puuid {
            if let Some(spot) = point(kill, "/location") {
                push("kill", spot);
            }
        }
    }
}
