use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::analysis::{int, point, text};
use crate::error::{AppError, AppResult};
use crate::i18n::tr;
use crate::state::AppState;
use crate::storage;

const COMPETITIVE: &str = "competitive";
const ABILITIES: &str = "Capacités";
const MELEE: &str = "Couteau";
const SPIKE: &str = "Spike";
const FALL: &str = "Chute";
const UNITS_PER_METER: f64 = 100.0;
const SHORT_RANGE: f64 = 10.0;
const LONG_RANGE: f64 = 25.0;
const WEAPONS: &[(&str, &str)] = &[
    ("Odin", "63e6c2b6-4a8e-869c-3d4c-e38355226584"),
    ("Ares", "55d8a0f4-4274-ca67-fe2c-06ab45efdf58"),
    ("Vandal", "9c82e19d-4575-0200-1a81-3eacf00cf872"),
    ("Warden", "8db0a1bf-4a50-832a-4566-faaaa6d250ca"),
    ("Bulldog", "ae3de142-4d85-2547-dd26-4e90bed35cf7"),
    ("Phantom", "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a"),
    ("Judge", "ec845bf4-4f79-ddda-a3da-0db3774b2794"),
    ("Bucky", "910be174-449b-c412-ab22-d0873436b21b"),
    ("Frenzy", "44d4e95c-4157-0037-81b2-17841bf2e8e3"),
    ("Classic", "29a0cfab-485b-f5d5-779a-b59f85e204a8"),
    ("Bandit", "410b2e0b-4ceb-1321-1727-20858f7f3477"),
    ("Ghost", "1baa85b4-4c70-1284-64bb-6481dfc3bb4e"),
    ("Sheriff", "e336c6b8-418d-9340-d77f-7a9e4cfe0702"),
    ("Shorty", "42da8ccc-40d5-affc-beec-15aa47b42eda"),
    ("Operator", "a03b24d3-4319-996d-0f8c-94bbfba1dfc7"),
    ("Guardian", "4ade7faa-4cf1-8376-95ef-39884480959b"),
    ("Outlaw", "5f0aaf7a-4289-3998-d5ff-eb9a5cf7ef5c"),
    ("Marshal", "c4883e50-4494-202c-3ec3-6b8a9284f00b"),
    ("Spectre", "462080d1-4035-2937-7c09-27aa2a5c27a7"),
    ("Stinger", "f7e1b454-4ad4-1063-ec0a-159e56b58941"),
    ("Melee", "2f59173c-4bed-b6c3-2191-dea9b58be9c7"),
    (MELEE, "2f59173c-4bed-b6c3-2191-dea9b58be9c7"),
];

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeSplit {
    pub short: i64,
    pub medium: i64,
    pub long: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbilityPart {
    pub name: Option<String>,
    pub agent_id: Option<String>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponLine {
    pub id: Option<String>,
    pub name: String,
    pub ability: bool,
    pub kills: i64,
    pub kill_share: f64,
    pub avg_kill_distance: Option<f64>,
    pub kill_ranges: RangeSplit,
    pub deaths: i64,
    pub avg_death_distance: Option<f64>,
    pub death_ranges: RangeSplit,
    pub rounds_held: i64,
    pub kills_held: i64,
    pub kills_per_round_held: Option<f64>,
    pub headshots: i64,
    pub bodyshots: i64,
    pub legshots: i64,
    pub hs_pct: Option<f64>,
    pub parts: Vec<AbilityPart>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillerLine {
    pub id: Option<String>,
    pub name: String,
    pub ability: bool,
    pub deaths: i64,
    pub death_share: f64,
    pub avg_distance: Option<f64>,
    pub ranges: RangeSplit,
    pub parts: Vec<AbilityPart>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponReport {
    pub matches: i64,
    pub analyzed_matches: i64,
    pub kills: i64,
    pub deaths: i64,
    pub headshots: i64,
    pub bodyshots: i64,
    pub legshots: i64,
    pub hs_pct: f64,
    pub body_pct: f64,
    pub leg_pct: f64,
    pub weapons: Vec<WeaponLine>,
    pub killers: Vec<KillerLine>,
}

#[derive(Default)]
struct Tally {
    kills: i64,
    kill_distance: f64,
    kill_measured: i64,
    kill_ranges: RangeSplit,
    deaths: i64,
    death_distance: f64,
    death_measured: i64,
    death_ranges: RangeSplit,
    rounds_held: i64,
    kills_held: i64,
    headshots: i64,
    bodyshots: i64,
    legshots: i64,
    kill_parts: HashMap<(String, String), i64>,
    death_parts: HashMap<(String, String), i64>,
}

pub fn weapon_id(name: &str) -> Option<String> {
    let name = name.trim();
    WEAPONS.iter().find(|(known, _)| known.eq_ignore_ascii_case(name)).map(|(_, id)| (*id).to_string())
}

pub fn kill_weapon_id(kill: &Value) -> Option<String> {
    let kind = text(kill, "/weapon/type").unwrap_or_default();
    if kind.eq_ignore_ascii_case("melee") {
        return weapon_id(MELEE);
    }
    if !kind.eq_ignore_ascii_case("weapon") {
        return None;
    }
    text(kill, "/weapon/id")
        .filter(|id| id.len() == 36)
        .map(str::to_lowercase)
        .or_else(|| text(kill, "/weapon/name").and_then(weapon_id))
}

pub fn held_weapon_id(stat: &Value) -> Option<String> {
    text(stat, "/economy/weapon/id")
        .filter(|id| id.len() == 36)
        .map(str::to_lowercase)
        .or_else(|| text(stat, "/economy/weapon/name").and_then(weapon_id))
}

fn part_key(kill: &Value, agent: Option<&str>) -> (String, String) {
    let named = text(kill, "/weapon/type").is_some_and(|kind| kind.eq_ignore_ascii_case("ability"));
    let name = if named { text(kill, "/weapon/name").map(str::trim).unwrap_or_default() } else { "" };
    (name.to_string(), agent.unwrap_or_default().to_lowercase())
}

fn parts(map: &HashMap<(String, String), i64>) -> Vec<AbilityPart> {
    let mut list: Vec<AbilityPart> = map
        .iter()
        .map(|((name, agent), count)| AbilityPart {
            name: (!name.is_empty()).then(|| name.clone()),
            agent_id: (!agent.is_empty()).then(|| agent.clone()),
            count: *count,
        })
        .collect();
    list.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)).then(a.agent_id.cmp(&b.agent_id)));
    list
}

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

fn average(total: f64, count: i64) -> Option<f64> {
    (count > 0).then(|| total / count as f64)
}

fn bucket(ranges: &mut RangeSplit, meters: f64) {
    if meters < SHORT_RANGE {
        ranges.short += 1;
    } else if meters <= LONG_RANGE {
        ranges.medium += 1;
    } else {
        ranges.long += 1;
    }
}

fn weapon_key(kill: &Value) -> String {
    let name = text(kill, "/weapon/name").map(str::trim).unwrap_or_default();
    let kind = text(kill, "/weapon/type").unwrap_or_default();
    if kind.eq_ignore_ascii_case("melee") {
        MELEE.to_string()
    } else if kind.eq_ignore_ascii_case("fall") {
        FALL.to_string()
    } else if kind.eq_ignore_ascii_case("bomb") {
        SPIKE.to_string()
    } else if name.is_empty() || kind.eq_ignore_ascii_case("ability") {
        ABILITIES.to_string()
    } else {
        name.to_string()
    }
}

fn kill_distance(kill: &Value, killer: &str) -> Option<f64> {
    let victim = point(kill, "/location")?;
    let shooter = kill
        .pointer("/player_locations")
        .and_then(Value::as_array)?
        .iter()
        .find(|entry| text(entry, "/player/puuid") == Some(killer))
        .and_then(|entry| point(entry, "/location"))?;
    Some(((victim.0 - shooter.0).powi(2) + (victim.1 - shooter.1).powi(2)).sqrt() / UNITS_PER_METER)
}

fn opposed(kill: &Value) -> bool {
    match (text(kill, "/killer/team"), text(kill, "/victim/team")) {
        (Some(a), Some(b)) if !a.is_empty() && !b.is_empty() => a != b,
        _ => true,
    }
}

fn collect(game: &Value, puuid: &str, tallies: &mut HashMap<String, Tally>) {
    let empty = Vec::new();
    let mut kills_by_round: HashMap<i64, i64> = HashMap::new();
    let agents: HashMap<&str, &str> = game
        .pointer("/players")
        .and_then(Value::as_array)
        .unwrap_or(&empty)
        .iter()
        .filter_map(|player| Some((text(player, "/puuid")?, text(player, "/agent/id")?)))
        .collect();

    for kill in game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty) {
        let killer = text(kill, "/killer/puuid").unwrap_or_default();
        let victim = text(kill, "/victim/puuid").unwrap_or_default();
        if killer.is_empty() || killer == victim || !opposed(kill) {
            continue;
        }
        if killer == puuid {
            *kills_by_round.entry(int(kill, "/round")).or_default() += 1;
            let key = weapon_key(kill);
            let tally = tallies.entry(key.clone()).or_default();
            tally.kills += 1;
            if key == ABILITIES {
                *tally.kill_parts.entry(part_key(kill, agents.get(killer).copied())).or_default() += 1;
            }
            if let Some(meters) = kill_distance(kill, killer) {
                tally.kill_distance += meters;
                tally.kill_measured += 1;
                bucket(&mut tally.kill_ranges, meters);
            }
        } else if victim == puuid {
            let key = weapon_key(kill);
            let tally = tallies.entry(key.clone()).or_default();
            tally.deaths += 1;
            if key == ABILITIES {
                *tally.death_parts.entry(part_key(kill, agents.get(killer).copied())).or_default() += 1;
            }
            if let Some(meters) = kill_distance(kill, killer) {
                tally.death_distance += meters;
                tally.death_measured += 1;
                bucket(&mut tally.death_ranges, meters);
            }
        }
    }

    for (index, round) in game.pointer("/rounds").and_then(Value::as_array).unwrap_or(&empty).iter().enumerate() {
        let Some(stat) = round
            .pointer("/stats")
            .and_then(Value::as_array)
            .and_then(|stats| stats.iter().find(|stat| text(stat, "/player/puuid") == Some(puuid)))
        else {
            continue;
        };
        let Some(weapon) = text(stat, "/economy/weapon/name").map(str::trim).filter(|name| !name.is_empty()) else {
            continue;
        };
        let tally = tallies.entry(weapon.to_string()).or_default();
        tally.rounds_held += 1;
        tally.kills_held += kills_by_round.get(&(index as i64)).copied().unwrap_or(0);
        tally.headshots += int(stat, "/stats/headshots");
        tally.bodyshots += int(stat, "/stats/bodyshots");
        tally.legshots += int(stat, "/stats/legshots");
    }
}

pub fn report(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<WeaponReport> {
    let (matches, headshots, bodyshots, legshots) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(p.headshots), 0), COALESCE(SUM(p.bodyshots), 0), COALESCE(SUM(p.legshots), 0)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
        params![puuid, COMPETITIVE, season],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?)),
    )?;

    let mut stmt = conn.prepare(
        "SELECT m.raw FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
    )?;
    let raws = stmt
        .query_map(params![puuid, COMPETITIVE, season], |row| Ok(row.get_ref(0)?.as_bytes()?.to_vec()))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut tallies: HashMap<String, Tally> = HashMap::new();
    let mut analyzed_matches = 0;
    for raw in raws {
        let Some(game) = storage::decode(&raw) else {
            continue;
        };
        analyzed_matches += 1;
        collect(&game, puuid, &mut tallies);
    }

    let kills: i64 = tallies.values().map(|tally| tally.kills).sum();
    let deaths: i64 = tallies.values().map(|tally| tally.deaths).sum();

    let mut weapons: Vec<WeaponLine> = tallies
        .iter()
        .filter(|(_, tally)| tally.kills > 0 || tally.rounds_held > 0)
        .map(|(name, tally)| {
            let shots = tally.headshots + tally.bodyshots + tally.legshots;
            WeaponLine {
                id: weapon_id(name),
                name: name.clone(),
                ability: name == ABILITIES,
                kills: tally.kills,
                kill_share: ratio(tally.kills as f64 * 100.0, kills as f64),
                avg_kill_distance: average(tally.kill_distance, tally.kill_measured),
                kill_ranges: tally.kill_ranges.clone(),
                deaths: tally.deaths,
                avg_death_distance: average(tally.death_distance, tally.death_measured),
                death_ranges: tally.death_ranges.clone(),
                rounds_held: tally.rounds_held,
                kills_held: tally.kills_held,
                kills_per_round_held: (tally.rounds_held > 0).then(|| tally.kills_held as f64 / tally.rounds_held as f64),
                headshots: tally.headshots,
                bodyshots: tally.bodyshots,
                legshots: tally.legshots,
                hs_pct: (shots > 0).then(|| tally.headshots as f64 * 100.0 / shots as f64),
                parts: parts(&tally.kill_parts),
            }
        })
        .collect();
    weapons.sort_by(|a, b| {
        b.kills.cmp(&a.kills).then(b.rounds_held.cmp(&a.rounds_held)).then(a.name.cmp(&b.name))
    });

    let mut killers: Vec<KillerLine> = tallies
        .iter()
        .filter(|(_, tally)| tally.deaths > 0)
        .map(|(name, tally)| KillerLine {
            id: weapon_id(name),
            name: name.clone(),
            ability: name == ABILITIES,
            deaths: tally.deaths,
            death_share: ratio(tally.deaths as f64 * 100.0, deaths as f64),
            avg_distance: average(tally.death_distance, tally.death_measured),
            ranges: tally.death_ranges.clone(),
            parts: parts(&tally.death_parts),
        })
        .collect();
    killers.sort_by(|a, b| b.deaths.cmp(&a.deaths).then(a.name.cmp(&b.name)));

    let shots = (headshots + bodyshots + legshots) as f64;
    Ok(WeaponReport {
        matches,
        analyzed_matches,
        kills,
        deaths,
        headshots,
        bodyshots,
        legshots,
        hs_pct: ratio(headshots as f64 * 100.0, shots),
        body_pct: ratio(bodyshots as f64 * 100.0, shots),
        leg_pct: ratio(legshots as f64 * 100.0, shots),
        weapons,
        killers,
    })
}

#[tauri::command(async)]
pub fn get_weapon_stats(state: tauri::State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::Weapons(season).serve(&state, &puuid)
}

const HISTORY_LIMIT: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponDuel {
    pub match_id: String,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub started_at: String,
    pub round_index: i64,
    pub time_ms: i64,
    pub opponent: String,
    pub opponent_agent_id: Option<String>,
    pub agent_id: Option<String>,
    pub ability: Option<String>,
    pub distance: Option<f64>,
    pub round_won: Option<bool>,
}

type Histories = HashMap<(String, bool), Vec<WeaponDuel>>;

fn duel(game: &Value, kill: &Value, match_id: &str, started_at: &str, puuid: &str, deaths: bool) -> Option<WeaponDuel> {
    let empty = Vec::new();
    let players = game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty);
    let player = |id: &str| players.iter().find(|player| text(player, "/puuid") == Some(id));
    let killer = text(kill, "/killer/puuid")?;
    let opponent = if deaths { killer } else { text(kill, "/victim/puuid")? };
    let my_team = player(puuid).and_then(|player| text(player, "/team_id"));
    let round_index = int(kill, "/round");
    let winner = game
        .pointer("/rounds")
        .and_then(Value::as_array)
        .and_then(|rounds| rounds.get(round_index as usize))
        .and_then(|round| text(round, "/winning_team"));
    let ability = text(kill, "/weapon/type")
        .filter(|kind| kind.eq_ignore_ascii_case("ability"))
        .and_then(|_| text(kill, "/weapon/name"))
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string);
    Some(WeaponDuel {
        match_id: match_id.to_string(),
        map_id: text(game, "/metadata/map/id").map(str::to_string),
        map_name: text(game, "/metadata/map/name").map(str::to_string),
        started_at: started_at.to_string(),
        round_index,
        time_ms: int(kill, "/time_in_round_in_ms"),
        opponent: player(opponent).and_then(|player| text(player, "/name")).unwrap_or(tr("Inconnu", "Unknown")).to_string(),
        opponent_agent_id: player(opponent).and_then(|player| text(player, "/agent/id")).map(str::to_string),
        agent_id: player(puuid).and_then(|player| text(player, "/agent/id")).map(str::to_string),
        ability,
        distance: kill_distance(kill, killer),
        round_won: my_team.zip(winner).map(|(mine, winner)| mine == winner),
    })
}

pub fn histories(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Histories> {
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.raw FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
         ORDER BY m.started_at DESC",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE, season], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get_ref(2)?.as_bytes()?.to_vec()))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let empty = Vec::new();
    let mut all: Histories = HashMap::new();
    for (match_id, started_at, raw) in rows {
        let Some(game) = storage::decode(&raw) else {
            continue;
        };
        let mut kills: Vec<&Value> = game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty).iter().collect();
        kills.sort_by_key(|kill| std::cmp::Reverse((int(kill, "/round"), int(kill, "/time_in_round_in_ms"))));
        for kill in kills {
            let killer = text(kill, "/killer/puuid").unwrap_or_default();
            let victim = text(kill, "/victim/puuid").unwrap_or_default();
            if killer.is_empty() || killer == victim || !opposed(kill) {
                continue;
            }
            let deaths = match (killer == puuid, victim == puuid) {
                (true, _) => false,
                (_, true) => true,
                _ => continue,
            };
            let list = all.entry((weapon_key(kill), deaths)).or_default();
            if list.len() >= HISTORY_LIMIT {
                continue;
            }
            if let Some(entry) = duel(&game, kill, &match_id, &started_at, puuid, deaths) {
                list.push(entry);
            }
        }
    }
    Ok(all)
}

fn history_key(puuid: &str, season: Option<&str>, weapon: &str, deaths: bool) -> String {
    format!("{}|{weapon:?}|{deaths}", ready_key(puuid, season))
}

fn ready_key(puuid: &str, season: Option<&str>) -> String {
    format!("{puuid}|WeaponHistories({season:?})")
}

fn store_histories(state: &AppState, puuid: &str, season: Option<&str>, all: &Histories, generation: u64) {
    for ((weapon, deaths), list) in all {
        if let Ok(json) = serde_json::to_string(list) {
            state.store_json(history_key(puuid, season, weapon, *deaths), json, generation);
        }
    }
    state.store_json(ready_key(puuid, season), "true".into(), generation);
}

pub fn warm_histories(state: &AppState, conn: &Connection, puuid: &str, season: Option<&str>) {
    if state.cached_json(&ready_key(puuid, season)).is_some() {
        return;
    }
    let generation = state.generation();
    if let Ok(all) = histories(conn, puuid, season) {
        store_histories(state, puuid, season, &all, generation);
    }
}

#[tauri::command(async)]
pub fn get_weapon_history(
    state: tauri::State<'_, AppState>,
    puuid: String,
    season: Option<String>,
    weapon: String,
    deaths: bool,
) -> AppResult<tauri::ipc::Response> {
    let season = season.as_deref();
    let key = history_key(&puuid, season, &weapon, deaths);
    if let Some(json) = state.cached_json(&key) {
        return Ok(tauri::ipc::Response::new(json));
    }
    let mut found = None;
    let generation = state.generation();
    state.cached(ready_key(&puuid, season), |conn| {
        let all = histories(conn, &puuid, season)?;
        store_histories(&state, &puuid, season, &all, generation);
        let list = all.get(&(weapon, deaths)).map(Vec::as_slice).unwrap_or_default();
        found = Some(serde_json::to_string(list).map_err(|err| AppError::Invalid(err.to_string()))?);
        Ok("true".into())
    })?;
    let json = found.or_else(|| state.cached_json(&key)).unwrap_or_else(|| String::from("[]"));
    Ok(tauri::ipc::Response::new(json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn game() -> Value {
        json!({
            "metadata": { "map": { "id": "map", "name": "Ascent" } },
            "players": [
                { "puuid": "me", "name": "Moi", "team_id": "Blue", "agent": { "id": "jett" } },
                { "puuid": "foe", "name": "Rival", "team_id": "Red", "agent": { "id": "raze" } }
            ],
            "rounds": [{ "winning_team": "Blue" }, { "winning_team": "Red" }],
            "kills": [
                { "round": 0, "time_in_round_in_ms": 1000, "killer": { "puuid": "me", "team": "Blue" }, "victim": { "puuid": "foe", "team": "Red" }, "weapon": { "type": "Ability", "name": "Blade Storm" } },
                { "round": 1, "time_in_round_in_ms": 2000, "killer": { "puuid": "foe", "team": "Red" }, "victim": { "puuid": "me", "team": "Blue" }, "weapon": { "type": "Ability", "name": "Showstopper" } },
                { "round": 1, "time_in_round_in_ms": 500, "killer": { "puuid": "foe", "team": "Red" }, "victim": { "puuid": "me", "team": "Blue" }, "weapon": { "type": "Weapon", "name": "Odin" } },
                { "round": 1, "time_in_round_in_ms": 800, "killer": { "puuid": "me", "team": "Blue" }, "victim": { "puuid": "foe", "team": "Red" }, "weapon": { "type": "Fall" } }
            ]
        })
    }

    #[test]
    fn ability_duels_keep_their_name() {
        let game = game();
        let kills = game.pointer("/kills").and_then(Value::as_array).unwrap();
        assert_eq!(weapon_key(&kills[0]), ABILITIES);
        assert_eq!(weapon_key(&kills[3]), FALL);
        let kill = duel(&game, &kills[0], "m", "2026-01-01", "me", false).unwrap();
        assert_eq!(kill.ability.as_deref(), Some("Blade Storm"));
        assert_eq!(kill.opponent, "Rival");
        assert_eq!(kill.round_won, Some(true));
        let death = duel(&game, &kills[1], "m", "2026-01-01", "me", true).unwrap();
        assert_eq!(death.ability.as_deref(), Some("Showstopper"));
        assert_eq!(death.opponent_agent_id.as_deref(), Some("raze"));
        assert_eq!(death.round_won, Some(false));
        assert_eq!(duel(&game, &kills[2], "m", "2026-01-01", "me", true).unwrap().ability, None);
    }
}

