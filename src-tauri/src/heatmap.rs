use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;

use crate::analysis::attack_side;
use crate::assets;
use crate::error::AppResult;
use crate::game::{self, Game, Round};

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
    pub won: bool,
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
pub struct AgentOption {
    pub id: String,
    pub name: String,
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Heatmap {
    pub maps: Vec<MapOption>,
    pub agents: Vec<AgentOption>,
    pub map_id: Option<String>,
    pub minimap: Option<String>,
    pub splash: Option<String>,
    pub rotation: i32,
    pub available: i64,
    pub matches: i64,
    pub points: Vec<HeatPoint>,
}

pub struct Filters<'a> {
    pub map_id: Option<&'a str>,
    pub season: Option<&'a str>,
    pub agent_id: Option<&'a str>,
    pub queue: Option<&'a str>,
    pub limit: Option<i64>,
}

pub fn heatmap(conn: &Connection, puuid: &str, filters: &Filters) -> AppResult<Heatmap> {
    let mut stmt = conn.prepare(
        "SELECT m.map_id, COALESCE(m.map_name, ''), COUNT(*), (SELECT splash FROM maps WHERE uuid = m.map_id)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id IS NOT NULL
           AND (?2 IS NULL OR m.season_short = ?2)
           AND (?3 IS NULL OR m.queue = ?3)
         GROUP BY m.map_id
         ORDER BY COUNT(*) DESC",
    )?;
    let maps = stmt
        .query_map(params![puuid, filters.season, filters.queue], |row| {
            Ok(MapOption { id: row.get(0)?, name: row.get(1)?, matches: row.get(2)?, image: assets::trusted_image(row.get(3)?) })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let selected = filters
        .map_id
        .filter(|id| maps.iter().any(|map| map.id == *id))
        .map(str::to_string)
        .or_else(|| maps.first().map(|map| map.id.clone()));
    let Some(selected) = selected else {
        return Ok(Heatmap {
            maps,
            agents: Vec::new(),
            map_id: None,
            minimap: None,
            splash: None,
            rotation: 0,
            available: 0,
            matches: 0,
            points: Vec::new(),
        });
    };
    let data = assets::load_map(conn, &selected)?;

    let mut stmt = conn.prepare(
        "SELECT p.agent_id, COALESCE(MAX(p.agent_name), ''), COUNT(*)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id = ?2 AND p.agent_id IS NOT NULL
           AND (?3 IS NULL OR m.season_short = ?3)
           AND (?4 IS NULL OR m.queue = ?4)
         GROUP BY p.agent_id
         ORDER BY COUNT(*) DESC",
    )?;
    let agents = stmt
        .query_map(params![puuid, selected, filters.season, filters.queue], |row| {
            Ok(AgentOption { id: row.get(0)?, name: row.get(1)?, matches: row.get(2)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let agent = filters.agent_id.filter(|id| agents.iter().any(|agent| agent.id == *id));
    let available: i64 = conn.query_row(
        "SELECT COUNT(*) FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id = ?2
           AND (?3 IS NULL OR m.season_short = ?3)
           AND (?4 IS NULL OR m.queue = ?4)
           AND (?5 IS NULL OR p.agent_id = ?5)",
        params![puuid, selected, filters.season, filters.queue, agent],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT m.raw FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.map_id = ?2
           AND (?3 IS NULL OR m.season_short = ?3)
           AND (?4 IS NULL OR m.queue = ?4)
           AND (?5 IS NULL OR p.agent_id = ?5)
         ORDER BY m.started_at DESC
         LIMIT ?6",
    )?;
    let mut rows =
        stmt.query(params![puuid, selected, filters.season, filters.queue, agent, filters.limit.filter(|n| *n > 0).unwrap_or(-1)])?;
    let mut points = Vec::new();
    let mut matches = 0;
    while let Some(row) = rows.next()? {
        let raw = row.get_ref(0)?.as_bytes().map_err(rusqlite::Error::from)?;
        matches += 1;
        if let Some(map) = &data {
            game::with_game(raw, |game| collect(game, puuid, map, &mut points));
        }
    }
    drop(rows);
    drop(stmt);

    Ok(Heatmap {
        maps,
        agents,
        rotation: data.as_ref().map_or(0, assets::MapData::rotation),
        splash: data.as_ref().and_then(|map| map.splash.clone()),
        minimap: data.and_then(|map| map.display_icon),
        map_id: Some(selected),
        available,
        matches,
        points,
    })
}

pub fn phase(rounds: &[Value], round: usize, time: i64) -> &'static str {
    let plant = rounds.get(round).and_then(|r| r.pointer("/plant/round_time_in_ms")).and_then(Value::as_i64);
    match plant {
        Some(planted_at) if time > planted_at => "post",
        _ if time < EARLY_ROUND_MS => "early",
        _ => "mid",
    }
}

fn phase_of(rounds: &[Round], round: usize, time: i64) -> &'static str {
    let plant = rounds.get(round).and_then(|r| r.plant.as_ref()).and_then(|plant| plant.round_time_in_ms.0);
    match plant {
        Some(planted_at) if time > planted_at => "post",
        _ if time < EARLY_ROUND_MS => "early",
        _ => "mid",
    }
}

fn collect(game: &Game, puuid: &str, map: &assets::MapData, points: &mut Vec<HeatPoint>) {
    let Some(team) = game.player(puuid).and_then(|player| player.team_id.get()) else {
        return;
    };
    let won = game.teams.iter().find(|entry| entry.team_id.get() == Some(team)).and_then(|entry| entry.won.0).unwrap_or(false);
    let attack_first = game.attacks_first(team);
    let rounds = &game.rounds;

    for kill in game.kills.iter() {
        let round = kill.round() as usize;
        let phase = phase_of(rounds, round, kill.time());
        let attack = attack_side(round, attack_first);
        let mut push = |kind: &'static str, spot: (f64, f64)| {
            let (x, y) = map.project(spot.0, spot.1);
            points.push(HeatPoint { kind, x, y, attack, phase, zone: map.zone(spot.0, spot.1), won });
        };
        let killer = kill.killer.puuid.get().unwrap_or_default();
        if kill.victim.puuid.get() == Some(puuid) {
            if let Some(spot) = kill.location.get() {
                push("death", spot);
            }
            if let Some(spot) = kill.location_of(killer) {
                push("killer", spot);
            }
        } else if killer == puuid {
            if let Some(spot) = kill.location.get() {
                push("kill", spot);
            }
        }
    }
}
