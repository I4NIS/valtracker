use rusqlite::{Connection, Row, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::analysis::{int, point, text};
use crate::error::{AppError, AppResult};
use crate::i18n::tr;
use crate::progression;
use crate::state::AppState;
use crate::stats;
use crate::storage;

const COMPETITIVE: &str = "competitive";
const SESSION_GAP_SECS: i64 = 3600;
const UNITS_PER_METER: f64 = 100.0;
const FOLDER: &str = "Valtracker";
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankPoint {
    pub tier: Option<i64>,
    pub tier_name: Option<String>,
    pub rr: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapMatch {
    pub match_id: String,
    pub started_at: String,
    pub length_ms: i64,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub map_image: Option<String>,
    pub splash: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub tier: Option<i64>,
    pub won: bool,
    pub draw: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub adr: f64,
    pub hs_pct: f64,
    pub rr_change: Option<i64>,
    pub rr_after: Option<i64>,
    pub score: i64,
    pub place: i64,
    #[serde(skip)]
    epoch: i64,
    #[serde(skip)]
    rounds: i64,
    #[serde(skip)]
    raw: Totals,
    #[serde(skip)]
    rank_after: RankPoint,
}

#[derive(Debug, Clone, Default)]
struct Totals {
    score: i64,
    headshots: i64,
    bodyshots: i64,
    legshots: i64,
    damage_dealt: i64,
    damage_received: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCount {
    pub agent_id: String,
    pub agent_name: Option<String>,
    pub matches: i64,
    pub wins: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapCount {
    pub map_id: Option<String>,
    pub map_name: String,
    pub map_image: Option<String>,
    pub splash: Option<String>,
    pub matches: i64,
    pub wins: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponCount {
    pub name: String,
    pub kills: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rival {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub agent_id: Option<String>,
    pub killed_me: i64,
    pub killed_by_me: i64,
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LongestKill {
    pub meters: f64,
    pub weapon: Option<String>,
    pub map_name: Option<String>,
    pub match_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecap {
    pub matches: Vec<RecapMatch>,
    pub wins: i64,
    pub losses: i64,
    pub draws: i64,
    pub rr_net: i64,
    pub rr_known: i64,
    pub before: RankPoint,
    pub after: RankPoint,
    pub rounds: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub adr: f64,
    pub kd: f64,
    pub hs_pct: f64,
    pub played_ms: i64,
    pub started_at: String,
    pub ended_at: String,
    pub best_match_id: Option<String>,
    pub agents: Vec<AgentCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActRecap {
    pub season: Option<String>,
    pub matches: Vec<RecapMatch>,
    pub wins: i64,
    pub losses: i64,
    pub draws: i64,
    pub win_pct: f64,
    pub rounds: i64,
    pub rounds_won: i64,
    pub played_ms: i64,
    pub rr_net: i64,
    pub rr_known: i64,
    pub start: RankPoint,
    pub end: RankPoint,
    pub peak: RankPoint,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub kd: f64,
    pub acs: f64,
    pub adr: f64,
    pub headshots: i64,
    pub bodyshots: i64,
    pub legshots: i64,
    pub hs_pct: f64,
    pub body_pct: f64,
    pub leg_pct: f64,
    pub damage_dealt: i64,
    pub damage_received: i64,
    pub aces: i64,
    pub four_ks: i64,
    pub three_ks: i64,
    pub clutches_won: i64,
    pub clutch_attempts: i64,
    pub first_bloods: i64,
    pub first_deaths: i64,
    pub knife_kills: i64,
    pub plants: i64,
    pub defuses: i64,
    pub loadout_total: i64,
    pub longest_kill: Option<LongestKill>,
    pub nemesis: Option<Rival>,
    pub victim: Option<Rival>,
    pub agents: Vec<AgentCount>,
    pub maps: Vec<MapCount>,
    pub weapons: Vec<WeaponCount>,
    pub best_match_id: Option<String>,
    pub worst_match_id: Option<String>,
    pub longest_win_streak: i64,
    pub longest_loss_streak: i64,
}

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

fn json<T: Serialize>(value: AppResult<T>) -> AppResult<String> {
    serde_json::to_string(&value?).map_err(|err| AppError::Invalid(err.to_string()))
}

fn match_from_row(row: &Row) -> rusqlite::Result<RecapMatch> {
    let rounds: i64 = row.get(14)?;
    let rounds_f = rounds.max(1) as f64;
    let score: i64 = row.get(18)?;
    let headshots: i64 = row.get(19)?;
    let bodyshots: i64 = row.get(20)?;
    let legshots: i64 = row.get(21)?;
    let damage_dealt: i64 = row.get(22)?;
    let won: bool = row.get(11)?;
    let rounds_won: i64 = row.get(12)?;
    let rounds_lost: i64 = row.get(13)?;
    Ok(RecapMatch {
        match_id: row.get(0)?,
        started_at: row.get(1)?,
        epoch: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        length_ms: row.get(3)?,
        map_id: row.get(4)?,
        map_name: row.get(5)?,
        map_image: row.get(6)?,
        splash: row.get(7)?,
        agent_id: row.get(8)?,
        agent_name: row.get(9)?,
        tier: row.get(10)?,
        won,
        draw: !won && rounds_won == rounds_lost,
        rounds_won,
        rounds_lost,
        rounds,
        kills: row.get(15)?,
        deaths: row.get(16)?,
        assists: row.get(17)?,
        acs: score as f64 / rounds_f,
        adr: damage_dealt as f64 / rounds_f,
        hs_pct: ratio(headshots as f64 * 100.0, (headshots + bodyshots + legshots) as f64),
        rr_change: row.get(24)?,
        rr_after: row.get(25)?,
        score: 0,
        place: 0,
        raw: Totals { score, headshots, bodyshots, legshots, damage_dealt, damage_received: row.get(23)? },
        rank_after: RankPoint { tier: row.get(26)?, tier_name: row.get(27)?, rr: row.get(25)? },
    })
}

fn load_matches(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Vec<RecapMatch>> {
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, CAST(strftime('%s', m.started_at) AS INTEGER), COALESCE(m.game_length_ms, 0),
                m.map_id, m.map_name, mp.list_icon, mp.splash, p.agent_id, p.agent_name, p.tier,
                p.won, p.rounds_won, p.rounds_lost, m.rounds, p.kills, p.deaths, p.assists, p.score,
                p.headshots, p.bodyshots, p.legshots, p.damage_dealt, p.damage_received,
                h.last_change, h.rr, h.tier, h.tier_name
         FROM match_players p
         JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN maps mp ON mp.uuid = m.map_id
         LEFT JOIN mmr_history h ON h.puuid = p.puuid AND h.match_id = m.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
         ORDER BY m.started_at ASC",
    )?;
    let rows = stmt.query_map(params![puuid, COMPETITIVE, season], match_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn attach_scores(conn: &Connection, puuid: &str, season: Option<&str>, matches: &mut [RecapMatch], limit: Option<i64>) -> AppResult<()> {
    let scores: HashMap<String, (i64, i64)> = progression::games(conn, puuid, season, limit)?
        .into_iter()
        .map(|game| (game.match_id, (game.score, game.place)))
        .collect();
    for game in matches.iter_mut() {
        if let Some((score, place)) = scores.get(&game.match_id) {
            game.score = *score;
            game.place = *place;
        }
    }
    Ok(())
}

fn rank_before(first: &RecapMatch, previous: Option<&RecapMatch>) -> RankPoint {
    let derived = first
        .rr_after
        .zip(first.rr_change)
        .filter(|_| first.rank_after.tier == first.tier)
        .map(|(rr, change)| rr - change)
        .filter(|rr| *rr >= 0);
    let previous_rr = previous.filter(|game| game.rank_after.tier.is_some() && game.rank_after.tier == first.tier).and_then(|game| game.rr_after);
    RankPoint { tier: first.tier, tier_name: None, rr: derived.or(previous_rr) }
}

fn ranked(rank: &RankPoint) -> bool {
    rank.tier.is_some_and(|tier| tier > 2)
}

fn act_start(matches: &[RecapMatch]) -> RankPoint {
    for (index, game) in matches.iter().enumerate() {
        if game.tier.is_some_and(|tier| tier > 2) {
            return rank_before(game, index.checked_sub(1).map(|previous| &matches[previous]));
        }
        if ranked(&game.rank_after) {
            let rr = game.rr_after.zip(game.rr_change).map(|(rr, change)| rr - change).filter(|rr| (0..=100).contains(rr));
            return match rr {
                Some(rr) => RankPoint { tier: game.rank_after.tier, tier_name: game.rank_after.tier_name.clone(), rr: Some(rr) },
                None => game.rank_after.clone(),
            };
        }
    }
    RankPoint::default()
}

fn rank_after(last: &RecapMatch) -> RankPoint {
    if last.rank_after.tier.is_some() {
        last.rank_after.clone()
    } else {
        RankPoint { tier: last.tier, tier_name: None, rr: None }
    }
}

fn best_and_worst(matches: &[RecapMatch]) -> (Option<String>, Option<String>) {
    let key = |game: &&RecapMatch| (game.score, (game.acs * 100.0) as i64);
    let best = matches.iter().max_by_key(key).map(|game| game.match_id.clone());
    let worst = matches.iter().min_by_key(key).map(|game| game.match_id.clone());
    (best, worst)
}

fn agent_counts(matches: &[RecapMatch]) -> Vec<AgentCount> {
    let mut counts: Vec<AgentCount> = Vec::new();
    for game in matches {
        let Some(agent_id) = &game.agent_id else {
            continue;
        };
        match counts.iter_mut().find(|entry| &entry.agent_id == agent_id) {
            Some(entry) => {
                entry.matches += 1;
                entry.wins += i64::from(game.won);
            }
            None => counts.push(AgentCount {
                agent_id: agent_id.clone(),
                agent_name: game.agent_name.clone(),
                matches: 1,
                wins: i64::from(game.won),
            }),
        }
    }
    counts.sort_by(|a, b| b.matches.cmp(&a.matches).then(b.wins.cmp(&a.wins)));
    counts
}

fn map_counts(matches: &[RecapMatch]) -> Vec<MapCount> {
    let mut counts: Vec<MapCount> = Vec::new();
    for game in matches {
        let Some(name) = &game.map_name else {
            continue;
        };
        match counts.iter_mut().find(|entry| &entry.map_name == name) {
            Some(entry) => {
                entry.matches += 1;
                entry.wins += i64::from(game.won);
            }
            None => counts.push(MapCount {
                map_id: game.map_id.clone(),
                map_name: name.clone(),
                map_image: game.map_image.clone(),
                splash: game.splash.clone(),
                matches: 1,
                wins: i64::from(game.won),
            }),
        }
    }
    counts.sort_by(|a, b| b.matches.cmp(&a.matches).then(b.wins.cmp(&a.wins)));
    counts
}

fn streaks(matches: &[RecapMatch]) -> (i64, i64) {
    let (mut wins, mut losses, mut best_wins, mut best_losses) = (0, 0, 0, 0);
    for game in matches {
        if game.won {
            wins += 1;
            losses = 0;
        } else if game.draw {
            wins = 0;
            losses = 0;
        } else {
            losses += 1;
            wins = 0;
        }
        best_wins = best_wins.max(wins);
        best_losses = best_losses.max(losses);
    }
    (best_wins, best_losses)
}

struct Sums {
    rounds: i64,
    rounds_won: i64,
    kills: i64,
    deaths: i64,
    assists: i64,
    played_ms: i64,
    rr_net: i64,
    rr_known: i64,
    wins: i64,
    draws: i64,
    totals: Totals,
}

fn sums(matches: &[RecapMatch]) -> Sums {
    let mut sums = Sums {
        rounds: 0,
        rounds_won: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        played_ms: 0,
        rr_net: 0,
        rr_known: 0,
        wins: 0,
        draws: 0,
        totals: Totals::default(),
    };
    for game in matches {
        sums.rounds += game.rounds;
        sums.rounds_won += game.rounds_won;
        sums.kills += game.kills;
        sums.deaths += game.deaths;
        sums.assists += game.assists;
        sums.played_ms += game.length_ms;
        sums.wins += i64::from(game.won);
        sums.draws += i64::from(game.draw);
        if let Some(change) = game.rr_change {
            sums.rr_net += change;
            sums.rr_known += 1;
        }
        sums.totals.score += game.raw.score;
        sums.totals.headshots += game.raw.headshots;
        sums.totals.bodyshots += game.raw.bodyshots;
        sums.totals.legshots += game.raw.legshots;
        sums.totals.damage_dealt += game.raw.damage_dealt;
        sums.totals.damage_received += game.raw.damage_received;
    }
    sums
}

fn iso_end(game: &RecapMatch) -> String {
    let end = game.epoch + game.length_ms / 1000;
    let days = end.div_euclid(86_400);
    let secs = end.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", secs / 3600, secs % 3600 / 60, secs % 60)
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

pub fn session(conn: &Connection, puuid: &str) -> AppResult<SessionRecap> {
    let all = load_matches(conn, puuid, None)?;
    if all.is_empty() {
        return Err(AppError::Invalid(tr("Aucune partie compétitive à récapituler", "No competitive match to recap").into()));
    }
    let mut start = all.len() - 1;
    while start > 0 {
        let previous = &all[start - 1];
        let gap = all[start].epoch - (previous.epoch + previous.length_ms / 1000);
        if gap >= SESSION_GAP_SECS {
            break;
        }
        start -= 1;
    }
    let previous = start.checked_sub(1).map(|index| all[index].clone());
    let mut matches: Vec<RecapMatch> = all.into_iter().skip(start).collect();
    let limit = matches.len() as i64;
    attach_scores(conn, puuid, None, &mut matches, Some(limit))?;
    let first = &matches[0];
    let last = &matches[matches.len() - 1];
    let sums = sums(&matches);
    let shots = sums.totals.headshots + sums.totals.bodyshots + sums.totals.legshots;
    let count = matches.len() as i64;
    Ok(SessionRecap {
        wins: sums.wins,
        losses: count - sums.wins - sums.draws,
        draws: sums.draws,
        rr_net: sums.rr_net,
        rr_known: sums.rr_known,
        before: rank_before(first, previous.as_ref()),
        after: rank_after(last),
        rounds: sums.rounds,
        kills: sums.kills,
        deaths: sums.deaths,
        assists: sums.assists,
        acs: ratio(sums.totals.score as f64, sums.rounds as f64),
        adr: ratio(sums.totals.damage_dealt as f64, sums.rounds as f64),
        kd: ratio(sums.kills as f64, sums.deaths as f64),
        hs_pct: ratio(sums.totals.headshots as f64 * 100.0, shots as f64),
        played_ms: sums.played_ms,
        started_at: first.started_at.clone(),
        ended_at: iso_end(last),
        best_match_id: best_and_worst(&matches).0,
        agents: agent_counts(&matches),
        matches,
    })
}

#[derive(Default)]
struct RivalTally {
    name: String,
    tag: String,
    agent_id: Option<String>,
    killed_me: i64,
    killed_by_me: i64,
    matches: i64,
}

#[derive(Default)]
struct GameFacts {
    aces: i64,
    four_ks: i64,
    three_ks: i64,
    clutches_won: i64,
    clutch_attempts: i64,
    first_bloods: i64,
    first_deaths: i64,
    knife_kills: i64,
    plants: i64,
    defuses: i64,
    loadout_total: i64,
    longest_kill: Option<LongestKill>,
    rivals: HashMap<String, RivalTally>,
    weapons: HashMap<String, i64>,
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

fn collect(game: &Value, puuid: &str, row: &RecapMatch, facts: &mut GameFacts) {
    let empty = Vec::new();
    let players = game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty);
    let teams: HashMap<&str, &str> = players
        .iter()
        .filter_map(|player| Some((text(player, "/puuid")?, text(player, "/team_id")?)))
        .collect();
    let Some(my_team) = teams.get(puuid).copied() else {
        return;
    };
    let rounds = game.pointer("/rounds").and_then(Value::as_array).unwrap_or(&empty);

    for player in players {
        let Some(id) = text(player, "/puuid") else {
            continue;
        };
        if teams.get(id) == Some(&my_team) {
            continue;
        }
        let entry = facts.rivals.entry(id.to_string()).or_default();
        entry.name = text(player, "/name").unwrap_or_default().to_string();
        entry.tag = text(player, "/tag").unwrap_or_default().to_string();
        entry.agent_id = text(player, "/agent/id").map(str::to_string);
        entry.matches += 1;
    }

    let mut kills: Vec<&Value> = game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty).iter().collect();
    kills.sort_by_key(|kill| (int(kill, "/round"), int(kill, "/time_in_round_in_ms")));
    let enemy = |id: Option<&str>| id.and_then(|id| teams.get(id)).is_some_and(|team| *team != my_team);

    for kill in &kills {
        let killer = text(kill, "/killer/puuid");
        let victim = text(kill, "/victim/puuid");
        if killer == Some(puuid) && enemy(victim) {
            let kind = text(kill, "/weapon/type").unwrap_or_default();
            let name = text(kill, "/weapon/name").map(str::trim).filter(|name| !name.is_empty());
            if kind.eq_ignore_ascii_case("melee") {
                facts.knife_kills += 1;
            } else if kind.eq_ignore_ascii_case("weapon")
                && let Some(name) = name
            {
                *facts.weapons.entry(name.to_string()).or_default() += 1;
            }
            if let Some(meters) = kill_distance(kill, puuid)
                && facts.longest_kill.as_ref().is_none_or(|longest| meters > longest.meters)
            {
                facts.longest_kill = Some(LongestKill {
                    meters,
                    weapon: name.map(str::to_string),
                    map_name: row.map_name.clone(),
                    match_id: row.match_id.clone(),
                });
            }
            if let Some(entry) = victim.and_then(|id| facts.rivals.get_mut(id)) {
                entry.killed_by_me += 1;
            }
        } else if victim == Some(puuid)
            && enemy(killer)
            && let Some(entry) = killer.and_then(|id| facts.rivals.get_mut(id))
        {
            entry.killed_me += 1;
        }
    }

    for (index, round) in rounds.iter().enumerate() {
        let won = text(round, "/winning_team") == Some(my_team);
        if text(round, "/plant/player/puuid") == Some(puuid) {
            facts.plants += 1;
        }
        if text(round, "/defuse/player/puuid") == Some(puuid) {
            facts.defuses += 1;
        }
        if let Some(stat) = round
            .pointer("/stats")
            .and_then(Value::as_array)
            .and_then(|stats| stats.iter().find(|stat| text(stat, "/player/puuid") == Some(puuid)))
        {
            facts.loadout_total += int(stat, "/economy/loadout_value");
        }
        let round_kills: Vec<&Value> = kills.iter().copied().filter(|kill| int(kill, "/round") as usize == index).collect();
        let mine = round_kills
            .iter()
            .filter(|kill| text(kill, "/killer/puuid") == Some(puuid) && enemy(text(kill, "/victim/puuid")))
            .count();
        match mine {
            0..=2 => {}
            3 => facts.three_ks += 1,
            4 => facts.four_ks += 1,
            _ => facts.aces += 1,
        }
        if let Some(first) = round_kills.first() {
            if text(first, "/killer/puuid") == Some(puuid) && enemy(text(first, "/victim/puuid")) {
                facts.first_bloods += 1;
            } else if text(first, "/victim/puuid") == Some(puuid) {
                facts.first_deaths += 1;
            }
        }
        let mut allies: HashSet<&str> = teams.iter().filter(|(_, team)| **team == my_team).map(|(id, _)| *id).collect();
        let mut enemies: HashSet<&str> = teams.iter().filter(|(_, team)| **team != my_team).map(|(id, _)| *id).collect();
        for kill in &round_kills {
            let Some(victim) = text(kill, "/victim/puuid") else {
                continue;
            };
            allies.remove(victim);
            enemies.remove(victim);
            if !allies.contains(puuid) {
                break;
            }
            if allies.len() == 1 && !enemies.is_empty() {
                facts.clutch_attempts += 1;
                facts.clutches_won += i64::from(won);
                break;
            }
        }
    }
}

fn rival(facts: &GameFacts, key: impl Fn(&RivalTally) -> (i64, i64)) -> Option<Rival> {
    facts
        .rivals
        .iter()
        .filter(|(_, tally)| key(tally).0 > 0)
        .max_by(|a, b| {
            let (left, right) = (key(a.1), key(b.1));
            left.0.cmp(&right.0).then(right.1.cmp(&left.1)).then(b.1.name.cmp(&a.1.name))
        })
        .map(|(puuid, tally)| Rival {
            puuid: puuid.clone(),
            name: tally.name.clone(),
            tag: tally.tag.clone(),
            agent_id: tally.agent_id.clone(),
            killed_me: tally.killed_me,
            killed_by_me: tally.killed_by_me,
            matches: tally.matches,
        })
}

pub fn act(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<ActRecap> {
    let season = match season {
        Some(short) => Some(short.to_string()),
        None => stats::seasons(conn, puuid)?.into_iter().next().map(|entry| entry.short),
    };
    let mut matches = load_matches(conn, puuid, season.as_deref())?;
    if matches.is_empty() {
        return Err(AppError::Invalid(tr("Aucune partie compétitive sur cet acte", "No competitive match in this Act").into()));
    }
    attach_scores(conn, puuid, season.as_deref(), &mut matches, None)?;

    let mut facts = GameFacts::default();
    for game in &matches {
        if let Some(raw) = storage::load_game(conn, &game.match_id)? {
            collect(&raw, puuid, game, &mut facts);
        }
    }

    let sums = sums(&matches);
    let shots = (sums.totals.headshots + sums.totals.bodyshots + sums.totals.legshots) as f64;
    let count = matches.len() as i64;
    let last = &matches[matches.len() - 1];
    let start = act_start(&matches);
    let peak = matches
        .iter()
        .enumerate()
        .flat_map(|(index, game)| [rank_before(game, index.checked_sub(1).map(|previous| &matches[previous])), game.rank_after.clone()])
        .chain([start.clone()])
        .filter(ranked)
        .max_by_key(|rank| (rank.tier, rank.rr.unwrap_or(-1)))
        .unwrap_or_default();
    let mut weapons: Vec<WeaponCount> = facts.weapons.iter().map(|(name, kills)| WeaponCount { name: name.clone(), kills: *kills }).collect();
    weapons.sort_by(|a, b| b.kills.cmp(&a.kills).then(a.name.cmp(&b.name)));
    weapons.truncate(5);
    let (best_match_id, worst_match_id) = best_and_worst(&matches);
    let (longest_win_streak, longest_loss_streak) = streaks(&matches);
    Ok(ActRecap {
        season,
        wins: sums.wins,
        losses: count - sums.wins - sums.draws,
        draws: sums.draws,
        win_pct: ratio(sums.wins as f64 * 100.0, count as f64),
        rounds: sums.rounds,
        rounds_won: sums.rounds_won,
        played_ms: sums.played_ms,
        rr_net: sums.rr_net,
        rr_known: sums.rr_known,
        start,
        end: rank_after(last),
        peak,
        kills: sums.kills,
        deaths: sums.deaths,
        assists: sums.assists,
        kd: ratio(sums.kills as f64, sums.deaths as f64),
        acs: ratio(sums.totals.score as f64, sums.rounds as f64),
        adr: ratio(sums.totals.damage_dealt as f64, sums.rounds as f64),
        headshots: sums.totals.headshots,
        bodyshots: sums.totals.bodyshots,
        legshots: sums.totals.legshots,
        hs_pct: ratio(sums.totals.headshots as f64 * 100.0, shots),
        body_pct: ratio(sums.totals.bodyshots as f64 * 100.0, shots),
        leg_pct: ratio(sums.totals.legshots as f64 * 100.0, shots),
        damage_dealt: sums.totals.damage_dealt,
        damage_received: sums.totals.damage_received,
        aces: facts.aces,
        four_ks: facts.four_ks,
        three_ks: facts.three_ks,
        clutches_won: facts.clutches_won,
        clutch_attempts: facts.clutch_attempts,
        first_bloods: facts.first_bloods,
        first_deaths: facts.first_deaths,
        knife_kills: facts.knife_kills,
        plants: facts.plants,
        defuses: facts.defuses,
        loadout_total: facts.loadout_total,
        longest_kill: facts.longest_kill.take(),
        nemesis: rival(&facts, |tally| (tally.killed_me, tally.killed_by_me)),
        victim: rival(&facts, |tally| (tally.killed_by_me, tally.killed_me)),
        agents: agent_counts(&matches),
        maps: map_counts(&matches),
        weapons,
        best_match_id,
        worst_match_id,
        longest_win_streak,
        longest_loss_streak,
        matches,
    })
}

#[tauri::command(async)]
pub fn get_session_recap(state: State<'_, AppState>, puuid: String) -> AppResult<Response> {
    state.cached(format!("{puuid}|SessionRecap"), |conn| json(session(conn, &puuid)))
}

#[tauri::command(async)]
pub fn get_act_recap(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Response> {
    state.cached(format!("{puuid}|ActRecap({season:?})"), |conn| json(act(conn, &puuid, season.as_deref())))
}

fn recap_folder(app: &AppHandle) -> AppResult<PathBuf> {
    let pictures = app.path().picture_dir().map_err(|err| AppError::Invalid(err.to_string()))?;
    Ok(pictures.join(FOLDER))
}

fn safe_name(raw: &str) -> String {
    let stem: String = raw
        .trim_end_matches(".png")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .take(80)
        .collect();
    if stem.trim_matches('-').is_empty() { "valtracker".into() } else { stem }
}

fn free_path(folder: &Path, stem: &str) -> PathBuf {
    let mut path = folder.join(format!("{stem}.png"));
    let mut index = 2;
    while path.exists() {
        path = folder.join(format!("{stem}-{index}.png"));
        index += 1;
    }
    path
}

#[tauri::command(async)]
pub fn save_recap_image(app: AppHandle, request: Request<'_>) -> AppResult<SavedImage> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::Invalid(tr("Image invalide", "Invalid image").into()));
    };
    if !bytes.starts_with(PNG_SIGNATURE) || bytes.len() > MAX_IMAGE_BYTES {
        return Err(AppError::Invalid(tr("Image invalide", "Invalid image").into()));
    }
    let name = request.headers().get("x-file-name").and_then(|value| value.to_str().ok()).unwrap_or_default();
    let folder = recap_folder(&app)?;
    std::fs::create_dir_all(&folder)?;
    let path = free_path(&folder, &safe_name(name));
    std::fs::write(&path, bytes)?;
    let copied = tauri::image::Image::from_bytes(bytes).is_ok_and(|image| app.clipboard().write_image(&image).is_ok());
    Ok(SavedImage { path: path.to_string_lossy().into_owned(), copied })
}

#[derive(Serialize)]
pub struct SavedImage {
    path: String,
    copied: bool,
}

#[tauri::command]
pub fn reveal_recap(app: AppHandle, path: String) -> AppResult<()> {
    let folder = recap_folder(&app)?;
    let target = PathBuf::from(&path);
    if target.parent() != Some(folder.as_path()) || !target.is_file() {
        return Err(AppError::Invalid(tr("Fichier introuvable", "File not found").into()));
    }
    app.opener().reveal_item_in_dir(&target).map_err(|err| AppError::Invalid(err.to_string()))
}
