use rusqlite::{Connection, params};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use crate::analysis::attack_side;
use crate::assets;
use crate::error::AppResult;
use crate::game::{self, Game, Kill};
use crate::i18n::tr;

const COMPETITIVE: &str = "competitive";
const UNITS_PER_METER: f64 = 100.0;
const CLOSE_METERS: f64 = 10.0;
const MID_METERS: f64 = 25.0;
const CLUTCH_LIMIT: usize = 300;
const RIVAL_MIN: i64 = 3;
const RIVAL_LIMIT: usize = 8;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningSide {
    pub rounds: i64,
    pub first_kills: i64,
    pub first_deaths: i64,
    pub success_rate: f64,
    pub won_after_kill: i64,
    pub won_after_death: i64,
    pub win_rate_after_kill: f64,
    pub win_rate_after_death: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opening {
    pub all: OpeningSide,
    pub attack: OpeningSide,
    pub defense: OpeningSide,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClutchSize {
    pub enemies: usize,
    pub attempts: i64,
    pub won: i64,
    pub win_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClutchEntry {
    pub match_id: String,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub started_at: String,
    pub round: usize,
    pub round_index: usize,
    pub enemies: usize,
    pub won: bool,
    pub kills: i64,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clutches {
    pub attempts: i64,
    pub won: i64,
    pub win_rate: f64,
    pub by_size: Vec<ClutchSize>,
    pub recent: Vec<ClutchEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Matchup {
    pub agent_id: String,
    pub agent_name: String,
    pub role: Option<String>,
    pub kills: i64,
    pub deaths: i64,
    pub win_rate: f64,
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistanceBucket {
    pub key: &'static str,
    pub label: &'static str,
    pub kills: i64,
    pub deaths: i64,
    pub win_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rival {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub agent_id: Option<String>,
    pub card: Option<String>,
    pub killed_me: i64,
    pub killed_by_me: i64,
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuelReport {
    pub matches: i64,
    pub rounds: i64,
    pub kills: i64,
    pub deaths: i64,
    pub opening: Opening,
    pub clutches: Clutches,
    pub matchups: Vec<Matchup>,
    pub distances: Vec<DistanceBucket>,
    pub nemeses: Vec<Rival>,
    pub victims: Vec<Rival>,
}

#[tauri::command(async)]
pub fn get_duels(state: tauri::State<'_, crate::state::AppState>, puuid: String, season: Option<String>) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::Duels(season).serve(&state, &puuid)
}

fn rate(part: i64, total: i64) -> f64 {
    if total > 0 { part as f64 * 100.0 / total as f64 } else { 0.0 }
}

#[derive(Default)]
struct OpeningTally {
    rounds: i64,
    first_kills: i64,
    first_deaths: i64,
    won_after_kill: i64,
    won_after_death: i64,
}

impl OpeningTally {
    fn finish(&self) -> OpeningSide {
        OpeningSide {
            rounds: self.rounds,
            first_kills: self.first_kills,
            first_deaths: self.first_deaths,
            success_rate: rate(self.first_kills, self.first_kills + self.first_deaths),
            won_after_kill: self.won_after_kill,
            won_after_death: self.won_after_death,
            win_rate_after_kill: rate(self.won_after_kill, self.first_kills),
            win_rate_after_death: rate(self.won_after_death, self.first_deaths),
        }
    }
}

#[derive(Default)]
struct AgentTally {
    name: String,
    kills: i64,
    deaths: i64,
    matches: i64,
}

#[derive(Default)]
struct RivalTally {
    name: String,
    tag: String,
    agent_id: Option<String>,
    card: Option<String>,
    killed_me: i64,
    killed_by_me: i64,
    matches: i64,
}

#[derive(Default)]
struct Totals {
    matches: i64,
    rounds: i64,
    kills: i64,
    deaths: i64,
    opening: [OpeningTally; 2],
    clutch: [(i64, i64); 5],
    clutches: Vec<ClutchEntry>,
    agents: HashMap<String, AgentTally>,
    distance: [(i64, i64); 3],
    rivals: HashMap<String, RivalTally>,
}

struct Player<'a> {
    team: &'a str,
    agent_id: Option<&'a str>,
    agent_name: Option<&'a str>,
    name: &'a str,
    tag: &'a str,
    card: Option<&'a str>,
}

pub struct GameRow {
    pub match_id: String,
    pub started_at: String,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
}

#[derive(Default)]
pub struct DuelAcc {
    totals: Totals,
}

impl DuelAcc {
    pub fn add(&mut self, game: &Game, puuid: &str, row: &GameRow) {
        collect(game, puuid, row, &mut self.totals);
    }

    pub fn finish(self, roles: &HashMap<String, String>) -> DuelReport {
        report(self.totals, roles)
    }
}

pub fn duels(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<DuelReport> {
    let roles = assets::agent_roles(conn)?;
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.map_id, m.map_name, m.raw
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
         ORDER BY m.started_at DESC",
    )?;
    let mut rows = stmt.query(params![puuid, COMPETITIVE, season])?;
    let mut acc = DuelAcc::default();
    while let Some(row) = rows.next()? {
        let info = GameRow { match_id: row.get(0)?, started_at: row.get(1)?, map_id: row.get(2)?, map_name: row.get(3)? };
        let raw = row.get_ref(4)?.as_bytes().map_err(rusqlite::Error::from)?;
        game::with_game(raw, |game| acc.add(game, puuid, &info));
    }
    Ok(acc.finish(&roles))
}

fn distance(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt() / UNITS_PER_METER
}

fn killer_spot(kill: &Kill) -> Option<(f64, f64)> {
    kill.location_of(kill.killer.puuid.get()?)
}

fn bucket(meters: f64) -> usize {
    if meters < CLOSE_METERS {
        0
    } else if meters <= MID_METERS {
        1
    } else {
        2
    }
}

fn collect(game: &Game, puuid: &str, row: &GameRow, totals: &mut Totals) {
    let players: HashMap<&str, Player> = game
        .players
        .iter()
        .filter_map(|player| {
            Some((
                player.puuid.get()?,
                Player {
                    team: player.team_id.get()?,
                    agent_id: player.agent.id.get(),
                    agent_name: player.agent.name.get(),
                    name: player.name.get().unwrap_or_default(),
                    tag: player.tag.get().unwrap_or_default(),
                    card: player.customization.card.get().filter(|card| !card.is_empty()),
                },
            ))
        })
        .collect();
    let Some(me) = players.get(puuid) else {
        return;
    };
    let my_team = me.team;
    let rounds = &game.rounds;
    if rounds.is_empty() {
        return;
    }
    totals.matches += 1;
    totals.rounds += rounds.len() as i64;
    let attack_first = game.attacks_first(my_team);

    let mut seen_agents: HashSet<&str> = HashSet::new();
    let mut seen_rivals: HashSet<&str> = HashSet::new();
    for (id, player) in &players {
        if player.team == my_team {
            continue;
        }
        if let Some(agent) = player.agent_id {
            let entry = totals.agents.entry(agent.to_string()).or_default();
            if entry.name.is_empty() {
                entry.name = player.agent_name.unwrap_or_default().to_string();
            }
            if seen_agents.insert(agent) {
                entry.matches += 1;
            }
        }
        if seen_rivals.insert(*id) {
            let entry = totals.rivals.entry((*id).to_string()).or_default();
            if entry.name.is_empty() {
                entry.name = player.name.to_string();
                entry.tag = player.tag.to_string();
                entry.agent_id = player.agent_id.map(str::to_string);
            }
            if entry.card.is_none() {
                entry.card = player.card.map(str::to_string);
            }
            entry.matches += 1;
        }
    }

    let mut kills: Vec<&Kill> = game.kills.iter().collect();
    kills.sort_by_key(|kill| (kill.round(), kill.time()));

    let team_of = |id: Option<&str>| id.and_then(|id| players.get(id)).map(|player| player.team);

    for kill in &kills {
        let killer = kill.killer.puuid.get();
        let victim = kill.victim.puuid.get();
        let killer_team = team_of(killer);
        let victim_team = team_of(victim);
        let spot = kill.location.get();
        let range = spot.zip(killer_spot(kill)).map(|(a, b)| bucket(distance(a, b)));
        if killer == Some(puuid) && victim != Some(puuid) && victim_team.is_some_and(|team| team != my_team) {
            totals.kills += 1;
            if let Some(index) = range {
                totals.distance[index].0 += 1;
            }
            if let Some(agent) = victim.and_then(|id| players.get(id)).and_then(|player| player.agent_id) {
                totals.agents.entry(agent.to_string()).or_default().kills += 1;
            }
            if let Some(entry) = victim.and_then(|id| totals.rivals.get_mut(id)) {
                entry.killed_by_me += 1;
            }
        } else if victim == Some(puuid) && killer.is_some_and(|id| id != puuid) && killer_team.is_some_and(|team| team != my_team) {
            totals.deaths += 1;
            if let Some(index) = range {
                totals.distance[index].1 += 1;
            }
            if let Some(agent) = killer.and_then(|id| players.get(id)).and_then(|player| player.agent_id) {
                totals.agents.entry(agent.to_string()).or_default().deaths += 1;
            }
            if let Some(entry) = killer.and_then(|id| totals.rivals.get_mut(id)) {
                entry.killed_me += 1;
            }
        }
    }

    let mut by_round: HashMap<usize, Vec<&Kill>> = HashMap::new();
    for kill in &kills {
        by_round.entry(kill.round() as usize).or_default().push(kill);
    }
    let no_kills: Vec<&Kill> = Vec::new();
    for (index, round) in rounds.iter().enumerate() {
        let won = round.winning_team.get() == Some(my_team);
        let side = if attack_side(index, attack_first) { 0 } else { 1 };
        let round_kills = by_round.get(&index).unwrap_or(&no_kills);

        let tally = &mut totals.opening[side];
        tally.rounds += 1;
        if let Some(first) = round_kills.first() {
            let killer = first.killer.puuid.get();
            let victim = first.victim.puuid.get();
            if killer == Some(puuid) && victim != Some(puuid) && team_of(victim).is_some_and(|team| team != my_team) {
                tally.first_kills += 1;
                if won {
                    tally.won_after_kill += 1;
                }
            } else if victim == Some(puuid) {
                tally.first_deaths += 1;
                if won {
                    tally.won_after_death += 1;
                }
            }
        }

        let mut allies: HashSet<&str> = players.iter().filter(|(_, p)| p.team == my_team).map(|(id, _)| *id).collect();
        let mut enemies: HashSet<&str> = players.iter().filter(|(_, p)| p.team != my_team).map(|(id, _)| *id).collect();
        for kill in round_kills {
            let Some(victim) = kill.victim.puuid.get() else {
                continue;
            };
            allies.remove(victim);
            enemies.remove(victim);
            if !allies.contains(puuid) {
                break;
            }
            if allies.len() == 1 && !enemies.is_empty() && enemies.len() <= 5 {
                let size = enemies.len();
                totals.clutch[size - 1].0 += 1;
                if won {
                    totals.clutch[size - 1].1 += 1;
                }
                totals.clutches.push(ClutchEntry {
                    match_id: row.match_id.clone(),
                    map_id: row.map_id.clone(),
                    map_name: row.map_name.clone(),
                    started_at: row.started_at.clone(),
                    round: index + 1,
                    round_index: index,
                    enemies: size,
                    won,
                    kills: round_kills
                        .iter()
                        .filter(|kill| kill.killer.puuid.get() == Some(puuid) && kill.victim.puuid.get() != Some(puuid))
                        .count() as i64,
                    agent_id: me.agent_id.map(str::to_string),
                });
                break;
            }
        }
    }
}

fn rivals(tallies: &HashMap<String, RivalTally>, key: impl Fn(&RivalTally) -> (i64, i64)) -> Vec<Rival> {
    let mut list: Vec<(&String, &RivalTally)> = tallies.iter().filter(|(_, tally)| key(tally).0 >= RIVAL_MIN).collect();
    list.sort_by(|a, b| {
        let (left, right) = (key(a.1), key(b.1));
        right.0.cmp(&left.0).then(left.1.cmp(&right.1)).then(b.1.matches.cmp(&a.1.matches)).then(a.1.name.cmp(&b.1.name))
    });
    list.into_iter()
        .take(RIVAL_LIMIT)
        .map(|(puuid, tally)| Rival {
            puuid: puuid.clone(),
            name: tally.name.clone(),
            tag: tally.tag.clone(),
            agent_id: tally.agent_id.clone(),
            card: tally.card.clone(),
            killed_me: tally.killed_me,
            killed_by_me: tally.killed_by_me,
            matches: tally.matches,
        })
        .collect()
}

fn report(totals: Totals, roles: &HashMap<String, String>) -> DuelReport {
    let [attack, defense] = &totals.opening;
    let all = OpeningTally {
        rounds: attack.rounds + defense.rounds,
        first_kills: attack.first_kills + defense.first_kills,
        first_deaths: attack.first_deaths + defense.first_deaths,
        won_after_kill: attack.won_after_kill + defense.won_after_kill,
        won_after_death: attack.won_after_death + defense.won_after_death,
    };

    let attempts: i64 = totals.clutch.iter().map(|(attempts, _)| attempts).sum();
    let won: i64 = totals.clutch.iter().map(|(_, won)| won).sum();
    let by_size = totals
        .clutch
        .iter()
        .enumerate()
        .map(|(index, (attempts, won))| ClutchSize { enemies: index + 1, attempts: *attempts, won: *won, win_rate: rate(*won, *attempts) })
        .collect();
    let mut recent = totals.clutches;
    recent.sort_by(|a, b| b.started_at.cmp(&a.started_at).then(b.round.cmp(&a.round)));
    recent.truncate(CLUTCH_LIMIT);

    let mut matchups: Vec<Matchup> = totals
        .agents
        .iter()
        .filter(|(_, tally)| tally.matches > 0)
        .map(|(id, tally)| Matchup {
            agent_id: id.clone(),
            agent_name: if tally.name.is_empty() { tr("Inconnu", "Unknown").into() } else { tally.name.clone() },
            role: roles.get(id).or_else(|| roles.get(&id.to_lowercase())).cloned(),
            kills: tally.kills,
            deaths: tally.deaths,
            win_rate: rate(tally.kills, tally.kills + tally.deaths),
            matches: tally.matches,
        })
        .collect();
    matchups.sort_by(|a, b| b.matches.cmp(&a.matches).then(a.agent_name.cmp(&b.agent_name)));

    let labels = [
        ("close", tr("Moins de 10 m", "Under 10 m")),
        ("mid", tr("10 à 25 m", "10 to 25 m")),
        ("long", tr("Plus de 25 m", "Over 25 m")),
    ];
    let distances = labels
        .iter()
        .zip(totals.distance.iter())
        .map(|((key, label), (kills, deaths))| DistanceBucket {
            key: *key,
            label: *label,
            kills: *kills,
            deaths: *deaths,
            win_rate: rate(*kills, kills + deaths),
        })
        .collect();

    DuelReport {
        matches: totals.matches,
        rounds: totals.rounds,
        kills: totals.kills,
        deaths: totals.deaths,
        opening: Opening { all: all.finish(), attack: attack.finish(), defense: defense.finish() },
        clutches: Clutches { attempts, won, win_rate: rate(won, attempts), by_size, recent },
        matchups,
        nemeses: rivals(&totals.rivals, |tally| (tally.killed_me, tally.killed_by_me)),
        victims: rivals(&totals.rivals, |tally| (tally.killed_by_me, tally.killed_me)),
        distances,
    }
}
