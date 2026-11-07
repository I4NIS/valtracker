use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::analysis::{self, MatchDetail, Position, int, point, text};
use crate::assets::{self, MapData};
use crate::error::AppResult;
use crate::heatmap::phase;
use crate::i18n::tr;
use crate::state::AppState;
use crate::storage;
use crate::thresholds::Thresholds;
use crate::weapon_stats::kill_weapon_id;

const COMPETITIVE: &str = "competitive";
const MATCH_LIMIT: i64 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Zone {
    pub name: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapGame {
    pub match_id: String,
    pub started_at: String,
    pub season: Option<String>,
    pub won: bool,
    pub draw: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapAction {
    pub kind: &'static str,
    pub match_id: String,
    pub round: usize,
    pub time_s: f64,
    pub attack: bool,
    pub phase: &'static str,
    pub round_won: bool,
    pub first: bool,
    pub zone: Option<String>,
    pub me_position: Option<Position>,
    pub opponent_position: Option<Position>,
    pub opponent: String,
    pub opponent_agent_id: Option<String>,
    pub weapon: Option<String>,
    pub weapon_id: Option<String>,
    pub weapon_kind: Option<String>,
    pub flaws: Vec<String>,
    pub positives: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapHistory {
    pub map_id: String,
    pub minimap: Option<String>,
    pub rotation: i32,
    pub total: i64,
    pub zones: Vec<Zone>,
    pub games: Vec<MapGame>,
    pub actions: Vec<MapAction>,
}

fn zones(map: &MapData) -> Vec<Zone> {
    let mut list: Vec<(String, f64, f64, f64)> = Vec::new();
    for callout in &map.callouts {
        let (x, y) = map.project(callout.x, callout.y);
        match list.iter_mut().find(|entry| entry.0 == callout.name) {
            Some(entry) => {
                entry.1 += x;
                entry.2 += y;
                entry.3 += 1.0;
            }
            None => list.push((callout.name.clone(), x, y, 1.0)),
        }
    }
    list.into_iter().map(|(name, x, y, count)| Zone { name, x: x / count, y: y / count }).collect()
}

pub fn map_history(conn: &Connection, puuid: &str, map_id: &str) -> AppResult<MapHistory> {
    let map = assets::load_map(conn, map_id)?;
    let roles = assets::agent_roles(conn)?;
    let thresholds = Thresholds::load(conn)?;
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND COALESCE(m.map_id, m.map_name, '') = ?3",
        params![puuid, COMPETITIVE, map_id],
        |row| row.get(0),
    )?;
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.season_short, m.raw FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND COALESCE(m.map_id, m.map_name, '') = ?3
         ORDER BY m.started_at DESC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE, map_id, MATCH_LIMIT], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get_ref(3)?.as_bytes()?.to_vec(),
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut games = Vec::new();
    let mut actions = Vec::new();
    for (match_id, started_at, season, raw) in rows {
        let Some(game) = storage::decode(&raw) else {
            continue;
        };
        let Some(detail) = analysis::analyze(&game, puuid, map.as_ref(), &roles, &thresholds) else {
            continue;
        };
        let mut found = collect(&game, puuid, map.as_ref(), &match_id, &detail);
        found.sort_by(|a, b| b.round.cmp(&a.round).then(b.time_s.total_cmp(&a.time_s)));
        actions.extend(found);
        games.push(MapGame {
            match_id,
            started_at,
            season,
            won: detail.won,
            draw: !detail.won && detail.rounds_won == detail.rounds_lost,
            rounds_won: detail.rounds_won,
            rounds_lost: detail.rounds_lost,
            agent_id: detail.agent_id,
            agent_name: detail.agent_name,
            kills: detail.kills,
            deaths: detail.deaths,
            assists: detail.assists,
            acs: detail.acs,
        });
    }

    Ok(MapHistory {
        map_id: map_id.to_string(),
        minimap: map.as_ref().and_then(|data| data.display_icon.clone()),
        rotation: map.as_ref().map_or(0, MapData::rotation),
        total,
        zones: map.as_ref().map(zones).unwrap_or_default(),
        games,
        actions,
    })
}

fn collect(game: &Value, puuid: &str, map: Option<&MapData>, match_id: &str, detail: &MatchDetail) -> Vec<MapAction> {
    let empty = Vec::new();
    let rounds = game.pointer("/rounds").and_then(Value::as_array).unwrap_or(&empty);
    let mut actions: Vec<MapAction> = detail
        .death_reviews
        .iter()
        .map(|death| {
            let index = death.round.saturating_sub(1);
            MapAction {
                kind: "death",
                match_id: match_id.to_string(),
                round: index,
                time_s: death.time_s,
                attack: death.attack,
                phase: phase(rounds, index, (death.time_s * 1000.0).round() as i64),
                round_won: death.round_won,
                first: death.first_death,
                zone: death.zone.clone(),
                me_position: death.position.clone(),
                opponent_position: death.killer_position.clone(),
                opponent: death.killer_name.clone(),
                opponent_agent_id: death.killer_agent_id.clone(),
                weapon: death.weapon.clone(),
                weapon_id: death.weapon_id.clone(),
                weapon_kind: death.weapon_kind.clone(),
                flaws: death.flaws.clone(),
                positives: death.positives.clone(),
            }
        })
        .collect();

    let players = game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty);
    let team_of = |id: &str| players.iter().find(|player| text(player, "/puuid") == Some(id)).and_then(|player| text(player, "/team_id"));
    let my_team = team_of(puuid);
    let kills = game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty);
    let mut first: HashMap<i64, i64> = HashMap::new();
    for kill in kills {
        let entry = first.entry(int(kill, "/round")).or_insert(i64::MAX);
        *entry = (*entry).min(int(kill, "/time_in_round_in_ms"));
    }
    let project = |spot: (f64, f64)| {
        map.map(|data| {
            let (x, y) = data.project(spot.0, spot.1);
            Position { x, y }
        })
    };
    let people = detail.teams.iter().flat_map(|team| team.players.iter());

    for kill in kills {
        if text(kill, "/killer/puuid") != Some(puuid) {
            continue;
        }
        let Some(victim) = text(kill, "/victim/puuid") else {
            continue;
        };
        if victim == puuid || team_of(victim) == my_team {
            continue;
        }
        let index = int(kill, "/round") as usize;
        let time = int(kill, "/time_in_round_in_ms");
        let spot = point(kill, "/location");
        let mine = kill
            .pointer("/player_locations")
            .and_then(Value::as_array)
            .and_then(|list| list.iter().find(|entry| text(entry, "/player/puuid") == Some(puuid)))
            .and_then(|entry| point(entry, "/location"));
        let line = people.clone().find(|line| line.puuid == victim);
        let round = detail.rounds.get(index);
        actions.push(MapAction {
            kind: "kill",
            match_id: match_id.to_string(),
            round: index,
            time_s: time as f64 / 1000.0,
            attack: round.is_some_and(|line| line.attack),
            phase: phase(rounds, index, time),
            round_won: round.is_some_and(|line| line.won),
            first: first.get(&(index as i64)) == Some(&time),
            zone: spot.and_then(|spot| map.and_then(|data| data.zone(spot.0, spot.1))),
            me_position: mine.and_then(&project),
            opponent_position: spot.and_then(&project),
            opponent: line.map_or_else(
                || text(kill, "/victim/name").unwrap_or(tr("Inconnu", "Unknown")).to_string(),
                |line| line.name.clone(),
            ),
            opponent_agent_id: line.and_then(|line| line.agent_id.clone()),
            weapon: text(kill, "/weapon/name").map(str::to_string),
            weapon_id: kill_weapon_id(kill),
            weapon_kind: analysis::weapon_kind(kill),
            flaws: Vec::new(),
            positives: Vec::new(),
        });
    }
    actions
}

#[tauri::command(async)]
pub fn get_map_history(state: tauri::State<'_, AppState>, puuid: String, map_id: String) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::MapHistory(map_id).serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::Callout;
    use serde_json::json;

    fn layout() -> MapData {
        MapData {
            display_icon: None,
            splash: None,
            x_multiplier: 0.0001,
            y_multiplier: 0.0001,
            x_scalar: 0.5,
            y_scalar: 0.5,
            callouts: vec![
                Callout { name: "A Site".into(), x: 1000.0, y: 1000.0 },
                Callout { name: "B Main".into(), x: -1000.0, y: -1000.0 },
            ],
        }
    }

    fn player(puuid: &str, team: &str) -> Value {
        json!({
            "puuid": puuid,
            "name": puuid,
            "tag": "0000",
            "team_id": team,
            "agent": { "id": "jett", "name": "Jett" },
            "stats": { "score": 200, "kills": 1, "deaths": 1, "assists": 0, "headshots": 1, "bodyshots": 0, "legshots": 0, "damage": { "dealt": 150 } },
        })
    }

    fn sample() -> Value {
        json!({
            "metadata": { "match_id": "m1", "map": { "id": "ascent", "name": "Ascent" } },
            "players": [player("me", "Red"), player("foe", "Blue")],
            "teams": [
                { "team_id": "Red", "won": false, "rounds": { "won": 0, "lost": 1 } },
                { "team_id": "Blue", "won": true, "rounds": { "won": 1, "lost": 0 } },
            ],
            "rounds": [{ "winning_team": "Blue", "winning_team_role": "Attacker", "result": "Elimination", "plant": { "round_time_in_ms": 30000 } }],
            "kills": [
                {
                    "round": 0,
                    "time_in_round_in_ms": 5000,
                    "killer": { "puuid": "me", "name": "me" },
                    "victim": { "puuid": "foe", "name": "foe" },
                    "weapon": { "name": "Vandal", "type": "Weapon" },
                    "location": { "x": 900, "y": 1100 },
                    "player_locations": [{ "player": { "puuid": "me" }, "location": { "x": -900, "y": -1000 } }],
                },
                {
                    "round": 0,
                    "time_in_round_in_ms": 40000,
                    "killer": { "puuid": "foe", "name": "foe" },
                    "victim": { "puuid": "me", "name": "me" },
                    "weapon": { "name": "Phantom", "type": "Weapon" },
                    "location": { "x": -1100, "y": -900 },
                },
            ],
        })
    }

    #[test]
    fn lists_kills_and_deaths_with_zones() {
        let game = sample();
        let map = layout();
        let detail = analysis::analyze(&game, "me", Some(&map), &HashMap::new(), &Thresholds::default()).expect("sample match");
        let actions = collect(&game, "me", Some(&map), "m1", &detail);
        let summary: Vec<(&str, Option<&str>, &str, bool)> =
            actions.iter().map(|action| (action.kind, action.zone.as_deref(), action.phase, action.first)).collect();
        assert_eq!(summary, [("death", Some("B Main"), "post", false), ("kill", Some("A Site"), "early", true)]);
        let kill = &actions[1];
        assert_eq!(kill.opponent, "foe");
        assert!(kill.me_position.is_some() && kill.opponent_position.is_some());
        assert!(actions[0].opponent_position.is_none());
    }

    #[test]
    fn averages_duplicate_callouts() {
        let mut map = layout();
        map.callouts.push(Callout { name: "A Site".into(), x: 3000.0, y: 1000.0 });
        let list = zones(&map);
        assert_eq!(list.len(), 2);
        assert!((list[0].y - 0.7).abs() < 1e-9);
    }
}
