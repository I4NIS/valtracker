use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

use crate::analysis::{self, MatchDetail, Position, attack_side, int, point, text};
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

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    pub samples: i64,
    pub rounds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub season: Option<String>,
    pub agent_id: Option<String>,
    pub attack: bool,
    pub zone: String,
    pub all: Seen,
    pub before: Seen,
    pub after: Seen,
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
    pub presence: Vec<Presence>,
}

#[derive(Debug, Clone, PartialEq)]
struct Sighting {
    round: usize,
    attack: bool,
    after: bool,
    zone: String,
}

fn sightings(game: &Value, puuid: &str, map: &MapData) -> Vec<Sighting> {
    let empty = Vec::new();
    let players = game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty);
    let Some(team) = players.iter().find(|player| text(player, "/puuid") == Some(puuid)).and_then(|player| text(player, "/team_id")) else {
        return Vec::new();
    };
    let attack_first = analysis::attacks_first(game, team);
    let rounds = game.pointer("/rounds").and_then(Value::as_array).unwrap_or(&empty);
    let kills = game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty);
    let mut deaths: HashMap<usize, i64> = HashMap::new();
    for kill in kills.iter().filter(|kill| text(kill, "/victim/puuid") == Some(puuid)) {
        let entry = deaths.entry(int(kill, "/round") as usize).or_insert(i64::MAX);
        *entry = (*entry).min(int(kill, "/time_in_round_in_ms"));
    }
    let mine = |event: &Value| {
        event
            .pointer("/player_locations")
            .and_then(Value::as_array)
            .and_then(|list| list.iter().find(|entry| text(entry, "/player/puuid") == Some(puuid)))
            .and_then(|entry| point(entry, "/location"))
    };
    let mut snapshots: Vec<(usize, i64, Option<(f64, f64)>)> = Vec::new();
    for kill in kills {
        let location = if text(kill, "/victim/puuid") == Some(puuid) { point(kill, "/location") } else { mine(kill) };
        snapshots.push((int(kill, "/round") as usize, int(kill, "/time_in_round_in_ms"), location));
    }
    for (index, round) in rounds.iter().enumerate() {
        for event in ["/plant", "/defuse"].iter().filter_map(|pointer| round.pointer(pointer)).filter(|event| event.is_object()) {
            let location = if text(event, "/player/puuid") == Some(puuid) { point(event, "/location") } else { mine(event) };
            snapshots.push((index, int(event, "/round_time_in_ms"), location));
        }
    }
    snapshots
        .into_iter()
        .filter(|(round, time, _)| deaths.get(round).is_none_or(|died| time <= died))
        .filter_map(|(round, time, location)| {
            let (x, y) = location?;
            let planted = rounds.get(round).and_then(|line| line.pointer("/plant/round_time_in_ms")).and_then(Value::as_i64);
            Some(Sighting {
                round,
                attack: attack_side(round, attack_first),
                after: planted.is_some_and(|planted| time > planted),
                zone: map.zone(x, y)?,
            })
        })
        .collect()
}

type PlaceKey = (Option<String>, Option<String>, bool, String);

#[derive(Default)]
struct Places(HashMap<PlaceKey, Presence>);

impl Places {
    fn add(&mut self, season: Option<&str>, agent_id: Option<&str>, sightings: &[Sighting]) {
        let mut counted: HashSet<(bool, &str, usize, u8)> = HashSet::new();
        for sight in sightings {
            let key = (season.map(str::to_string), agent_id.map(str::to_string), sight.attack, sight.zone.clone());
            let entry = self.0.entry(key).or_insert_with(|| Presence {
                season: season.map(str::to_string),
                agent_id: agent_id.map(str::to_string),
                attack: sight.attack,
                zone: sight.zone.clone(),
                all: Seen::default(),
                before: Seen::default(),
                after: Seen::default(),
            });
            let bucket = u8::from(sight.after) + 1;
            let part = if sight.after { &mut entry.after } else { &mut entry.before };
            part.samples += 1;
            if counted.insert((sight.attack, &sight.zone, sight.round, bucket)) {
                part.rounds += 1;
            }
            entry.all.samples += 1;
            if counted.insert((sight.attack, &sight.zone, sight.round, 0)) {
                entry.all.rounds += 1;
            }
        }
    }

    fn finish(self) -> Vec<Presence> {
        let mut list: Vec<Presence> = self.0.into_values().collect();
        list.sort_by(|a, b| {
            b.all
                .samples
                .cmp(&a.all.samples)
                .then_with(|| a.zone.cmp(&b.zone))
                .then_with(|| a.attack.cmp(&b.attack))
                .then_with(|| a.season.cmp(&b.season))
                .then_with(|| a.agent_id.cmp(&b.agent_id))
        });
        list
    }
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
    let mut rows = stmt.query(params![puuid, COMPETITIVE, map_id, MATCH_LIMIT])?;

    let mut games = Vec::new();
    let mut actions = Vec::new();
    let mut places = Places::default();
    while let Some(row) = rows.next()? {
        let match_id: String = row.get(0)?;
        let started_at: String = row.get(1)?;
        let season: Option<String> = row.get(2)?;
        let Some(game) = storage::decode(row.get_ref(3)?.as_bytes().map_err(rusqlite::Error::from)?) else {
            continue;
        };
        let Some(detail) = analysis::analyze(&game, puuid, map.as_ref(), &roles, &thresholds) else {
            continue;
        };
        let mut found = collect(&game, puuid, map.as_ref(), &match_id, &detail);
        found.sort_by(|a, b| b.round.cmp(&a.round).then(b.time_s.total_cmp(&a.time_s)));
        actions.extend(found);
        if let Some(layout) = map.as_ref() {
            places.add(season.as_deref(), detail.agent_id.as_deref(), &sightings(&game, puuid, layout));
        }
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
        presence: places.finish(),
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

    fn kill_at(round: usize, time: i64, killer: &str, victim: &str, location: (i64, i64), me: Option<(i64, i64)>) -> Value {
        let locations: Vec<Value> = me.into_iter().map(|(x, y)| json!({ "player": { "puuid": "me" }, "location": { "x": x, "y": y } })).collect();
        json!({
            "round": round,
            "time_in_round_in_ms": time,
            "killer": { "puuid": killer },
            "victim": { "puuid": victim },
            "location": { "x": location.0, "y": location.1 },
            "player_locations": locations,
        })
    }

    #[test]
    fn places_me_on_each_side_until_i_die() {
        let mut game = sample();
        let mut rounds = vec![json!({ "winning_team": "Blue", "winning_team_role": "Attacker", "plant": { "round_time_in_ms": 30000 } })];
        rounds.extend((1..13).map(|_| json!({ "winning_team": "Red", "winning_team_role": "Attacker" })));
        rounds[12]["plant"] = json!({ "round_time_in_ms": 20000, "player": { "puuid": "me" }, "location": { "x": -1000, "y": -900 } });
        game["rounds"] = Value::Array(rounds);
        game["kills"] = json!([
            kill_at(0, 5000, "foe", "ally", (0, 0), Some((-900, -1000))),
            kill_at(0, 35000, "foe", "ally", (0, 0), Some((900, 1000))),
            kill_at(0, 40000, "foe", "me", (1000, 1100), None),
            kill_at(0, 50000, "foe", "ally", (0, 0), Some((-900, -1000))),
            kill_at(12, 10000, "me", "foe", (0, 0), Some((1000, 900))),
            kill_at(12, 15000, "foe", "ally", (0, 0), None),
        ]);
        let map = layout();
        let found = sightings(&game, "me", &map);
        let summary: Vec<(usize, bool, bool, &str)> = found.iter().map(|sight| (sight.round, sight.attack, sight.after, sight.zone.as_str())).collect();
        assert_eq!(
            summary,
            [(0, false, false, "B Main"), (0, false, true, "A Site"), (0, false, true, "A Site"), (12, true, false, "A Site"), (12, true, false, "B Main")]
        );

        let mut places = Places::default();
        places.add(Some("e9a3"), Some("jett"), &found);
        places.add(Some("e9a3"), Some("jett"), &found);
        let list = places.finish();
        let defense = list.iter().find(|entry| !entry.attack && entry.zone == "A Site").expect("defense A Site");
        assert_eq!((defense.all.samples, defense.all.rounds), (4, 2));
        assert_eq!((defense.after.samples, defense.after.rounds, defense.before.samples), (4, 2, 0));
        let attack = list.iter().filter(|entry| entry.attack).map(|entry| (entry.zone.as_str(), entry.before.samples, entry.after.rounds));
        assert_eq!(attack.collect::<Vec<_>>(), [("A Site", 2, 0), ("B Main", 2, 0)]);
        assert_eq!(list.len(), 4);
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
