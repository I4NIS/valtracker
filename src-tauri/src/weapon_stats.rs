use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::analysis::{int, point, text};
use crate::error::AppResult;
use crate::state::AppState;
use crate::storage;

const COMPETITIVE: &str = "competitive";
const ABILITIES: &str = "Capacités";
const MELEE: &str = "Couteau";
const SPIKE: &str = "Spike";
const UNITS_PER_METER: f64 = 100.0;
const SHORT_RANGE: f64 = 10.0;
const LONG_RANGE: f64 = 25.0;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeSplit {
    pub short: i64,
    pub medium: i64,
    pub long: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponLine {
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillerLine {
    pub name: String,
    pub ability: bool,
    pub deaths: i64,
    pub death_share: f64,
    pub avg_distance: Option<f64>,
    pub ranges: RangeSplit,
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

    for kill in game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty) {
        let killer = text(kill, "/killer/puuid").unwrap_or_default();
        let victim = text(kill, "/victim/puuid").unwrap_or_default();
        if killer.is_empty() || killer == victim || !opposed(kill) {
            continue;
        }
        if killer == puuid {
            *kills_by_round.entry(int(kill, "/round")).or_default() += 1;
            let tally = tallies.entry(weapon_key(kill)).or_default();
            tally.kills += 1;
            if let Some(meters) = kill_distance(kill, killer) {
                tally.kill_distance += meters;
                tally.kill_measured += 1;
                bucket(&mut tally.kill_ranges, meters);
            }
        } else if victim == puuid {
            let tally = tallies.entry(weapon_key(kill)).or_default();
            tally.deaths += 1;
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
            name: name.clone(),
            ability: name == ABILITIES,
            deaths: tally.deaths,
            death_share: ratio(tally.deaths as f64 * 100.0, deaths as f64),
            avg_distance: average(tally.death_distance, tally.death_measured),
            ranges: tally.death_ranges.clone(),
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
