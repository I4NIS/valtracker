use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::assets::MapData;
use crate::i18n::{english, tr};
use crate::thresholds::Thresholds;
use crate::weapon_stats::{held_weapon_id, kill_weapon_id};

const UNITS_PER_METER: f64 = 100.0;
const MIN_KILLS_FOR_HS_BADGE: i64 = 5;

#[derive(Debug, Clone, Serialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub x: f64,
    pub y: f64,
    pub ally: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerLine {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub role: Option<String>,
    pub tier: Option<i64>,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub adr: f64,
    pub hs_pct: f64,
    pub first_bloods: i64,
    pub score: i64,
    pub place: usize,
    pub badge: Option<String>,
    pub is_me: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBlock {
    pub mine: bool,
    pub won: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub avg_acs: f64,
    pub players: Vec<PlayerLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundEvent {
    pub time_s: f64,
    pub kind: &'static str,
    pub actor: String,
    pub actor_agent_id: Option<String>,
    pub actor_ally: bool,
    pub actor_me: bool,
    pub target: Option<String>,
    pub target_agent_id: Option<String>,
    pub target_ally: bool,
    pub target_me: bool,
    pub weapon: Option<String>,
    pub weapon_id: Option<String>,
    pub weapon_kind: Option<String>,
    pub site: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomyLine {
    pub name: String,
    pub agent_id: Option<String>,
    pub ally: bool,
    pub me: bool,
    pub loadout: i64,
    pub remaining: i64,
    pub weapon: Option<String>,
    pub weapon_id: Option<String>,
    pub armor: Option<String>,
    pub kills: i64,
    pub damage: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundLine {
    pub number: usize,
    pub won: bool,
    pub attack: bool,
    pub planted: bool,
    pub my_loadout: i64,
    pub team_loadout: i64,
    pub enemy_loadout: i64,
    pub my_kills: i64,
    pub died: bool,
    pub result: String,
    pub ceremony: Option<String>,
    pub events: Vec<RoundEvent>,
    pub economy: Vec<EconomyLine>,
}

fn result_label(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.is_empty() {
        tr("Temps écoulé", "Time ran out").into()
    } else if lower.contains("elim") {
        tr("Élimination", "Elimination").into()
    } else if lower.contains("detonat") || lower.contains("exploded") {
        tr("Spike explosé", "Spike detonated").into()
    } else if lower.contains("defus") {
        tr("Spike désamorcé", "Spike defused").into()
    } else if lower.contains("time") || lower.contains("expire") {
        tr("Temps écoulé", "Time ran out").into()
    } else if lower.contains("surrender") {
        tr("Abandon", "Surrender").into()
    } else {
        raw.to_string()
    }
}

fn ceremony_label(raw: &str) -> Option<String> {
    match raw {
        "CeremonyAce" => Some("Ace".into()),
        "CeremonyTeamAce" => Some(tr("Ace d'équipe", "Team Ace").into()),
        "CeremonyClutch" => Some("Clutch".into()),
        "CeremonyFlawless" => Some("Flawless".into()),
        "CeremonyThrifty" => Some(tr("Victoire en éco", "Thrifty").into()),
        "CeremonyCloser" => Some(tr("Round décisif", "Closer").into()),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Death {
    pub round: usize,
    pub time_s: f64,
    pub attack: bool,
    pub round_won: bool,
    pub killer_name: String,
    pub killer_agent: Option<String>,
    pub killer_agent_id: Option<String>,
    pub weapon: Option<String>,
    pub weapon_id: Option<String>,
    pub weapon_kind: Option<String>,
    pub distance_m: Option<f64>,
    pub nearest_ally_m: Option<f64>,
    pub traded: bool,
    pub first_death: bool,
    pub loadout: i64,
    pub zone: Option<String>,
    pub position: Option<Position>,
    pub killer_position: Option<Position>,
    pub others: Vec<Marker>,
    pub flaws: Vec<String>,
    pub positives: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Flaw {
    pub value: String,
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDetail {
    pub match_id: String,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub minimap: Option<String>,
    pub splash: Option<String>,
    pub rotation: i32,
    pub started_at: Option<String>,
    pub length_ms: Option<i64>,
    pub queue: Option<String>,
    pub season: Option<String>,
    pub won: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub score: i64,
    pub place: usize,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub adr: f64,
    pub team_level: String,
    pub team_acs: f64,
    pub enemy_acs: f64,
    pub rr_change: Option<i64>,
    pub rr_after: Option<i64>,
    pub teams: Vec<TeamBlock>,
    pub rounds: Vec<RoundLine>,
    pub death_reviews: Vec<Death>,
    pub flaws: Vec<Flaw>,
}

pub fn text<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

pub fn int(value: &Value, pointer: &str) -> i64 {
    value.pointer(pointer).and_then(Value::as_i64).unwrap_or(0)
}

pub fn point(value: &Value, pointer: &str) -> Option<(f64, f64)> {
    let location = value.pointer(pointer)?;
    Some((location["x"].as_f64()?, location["y"].as_f64()?))
}

pub fn weapon_kind(kill: &Value) -> Option<String> {
    text(kill, "/weapon/type").filter(|kind| !kind.is_empty()).map(str::to_lowercase)
}

fn distance(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt() / UNITS_PER_METER
}

fn ratio(value: f64, average: f64) -> f64 {
    if average > 0.0 { value / average } else { 1.0 }
}

fn round_list(rounds: &[usize]) -> String {
    let parts: Vec<String> = rounds.iter().map(ToString::to_string).collect();
    match parts.len() {
        0 => String::new(),
        1 => parts[0].clone(),
        n => format!("{} {} {}", parts[..n - 1].join(", "), tr("et", "and"), parts[n - 1]),
    }
}

fn plural(count: usize, word: &str) -> String {
    let many = if english() { count != 1 } else { count > 1 };
    if many { format!("{count} {word}s") } else { format!("{count} {word}") }
}

fn rounds_label(rounds: &[usize]) -> String {
    let word = if english() && rounds.len() == 1 { "Round" } else { "Rounds" };
    format!("{word} {}", round_list(rounds))
}

fn role_weights(role: Option<&str>) -> (f64, f64, f64, f64) {
    match role {
        Some("Duelist") => (0.5, 0.25, 0.05, 0.2),
        Some("Initiator") => (0.4, 0.2, 0.3, 0.1),
        Some("Controller") => (0.4, 0.25, 0.25, 0.1),
        Some("Sentinel") => (0.45, 0.3, 0.15, 0.1),
        _ => (0.45, 0.25, 0.15, 0.15),
    }
}

pub fn attack_side(round: usize, attack_first: bool) -> bool {
    match round {
        0..12 => attack_first,
        12..24 => !attack_first,
        _ => ((round - 24) % 2 == 0) == attack_first,
    }
}

pub fn attacks_first(game: &Value, team: &str) -> bool {
    let Some(first) = game.pointer("/rounds/0") else {
        return true;
    };
    let winner_is_mine = text(first, "/winning_team") == Some(team);
    let role_attacker = text(first, "/winning_team_role") == Some("Attacker");
    winner_is_mine == role_attacker
}

struct Projector<'a>(Option<&'a MapData>);

impl Projector<'_> {
    fn position(&self, location: (f64, f64)) -> Option<Position> {
        self.0.map(|map| {
            let (x, y) = map.project(location.0, location.1);
            Position { x, y }
        })
    }

    fn zone(&self, location: (f64, f64)) -> Option<String> {
        self.0.and_then(|map| map.zone(location.0, location.1))
    }
}

pub fn analyze(
    game: &Value,
    puuid: &str,
    map: Option<&MapData>,
    roles: &HashMap<String, String>,
    thresholds: &Thresholds,
) -> Option<MatchDetail> {
    let players = game.pointer("/players")?.as_array()?;
    let me = players.iter().find(|player| text(player, "/puuid") == Some(puuid))?;
    let my_team = text(me, "/team_id")?.to_string();
    let rounds = game.pointer("/rounds")?.as_array()?;
    let round_count = rounds.len();
    if round_count == 0 {
        return None;
    }
    let empty = Vec::new();
    let kills: Vec<&Value> = game.pointer("/kills").and_then(Value::as_array).unwrap_or(&empty).iter().collect();
    let projector = Projector(map);

    let mut first_kills: HashMap<i64, &Value> = HashMap::new();
    for kill in &kills {
        let round = int(kill, "/round");
        let time = int(kill, "/time_in_round_in_ms");
        let entry = first_kills.entry(round).or_insert(kill);
        if time < int(entry, "/time_in_round_in_ms") {
            *entry = kill;
        }
    }
    let mut first_bloods: HashMap<&str, i64> = HashMap::new();
    for kill in first_kills.values() {
        if let Some(killer) = text(kill, "/killer/puuid") {
            *first_bloods.entry(killer).or_default() += 1;
        }
    }

    let rounds_f = round_count as f64;
    let mut lines: Vec<PlayerLine> = players
        .iter()
        .map(|player| {
            let id = text(player, "/puuid").unwrap_or_default();
            let shots = int(player, "/stats/headshots") + int(player, "/stats/bodyshots") + int(player, "/stats/legshots");
            let agent_id = text(player, "/agent/id").map(str::to_string);
            PlayerLine {
                puuid: id.to_string(),
                name: text(player, "/name").unwrap_or_default().to_string(),
                tag: text(player, "/tag").unwrap_or_default().to_string(),
                role: agent_id.as_ref().and_then(|agent| roles.get(agent).cloned()),
                agent_id,
                agent_name: text(player, "/agent/name").map(str::to_string),
                tier: player.pointer("/tier/id").and_then(Value::as_i64),
                kills: int(player, "/stats/kills"),
                deaths: int(player, "/stats/deaths"),
                assists: int(player, "/stats/assists"),
                acs: int(player, "/stats/score") as f64 / rounds_f,
                adr: int(player, "/stats/damage/dealt") as f64 / rounds_f,
                hs_pct: if shots > 0 { int(player, "/stats/headshots") as f64 * 100.0 / shots as f64 } else { 0.0 },
                first_bloods: first_bloods.get(id).copied().unwrap_or(0),
                score: 0,
                place: 0,
                badge: None,
                is_me: id == puuid,
            }
        })
        .collect();

    let count = lines.len().max(1) as f64;
    let avg_acs = lines.iter().map(|line| line.acs).sum::<f64>() / count;
    let avg_kd = lines.iter().map(|line| line.kills as f64 / line.deaths.max(1) as f64).sum::<f64>() / count;
    let avg_assists = lines.iter().map(|line| line.assists as f64).sum::<f64>() / count;
    let avg_fb = lines.iter().map(|line| line.first_bloods as f64).sum::<f64>() / count;
    for line in &mut lines {
        let (w_acs, w_kd, w_assists, w_fb) = role_weights(line.role.as_deref());
        let weighted = w_acs * ratio(line.acs, avg_acs)
            + w_kd * ratio(line.kills as f64 / line.deaths.max(1) as f64, avg_kd)
            + w_assists * ratio(line.assists as f64, avg_assists)
            + w_fb * ratio(line.first_bloods as f64, avg_fb);
        line.score = (50.0 * weighted).round().clamp(0.0, 100.0) as i64;
    }
    let mut order: Vec<usize> = (0..lines.len()).collect();
    order.sort_by(|a, b| lines[*b].score.cmp(&lines[*a].score).then(lines[*b].acs.total_cmp(&lines[*a].acs)));
    for (place, index) in order.iter().enumerate() {
        lines[*index].place = place + 1;
    }

    let teams_json = game.pointer("/teams").and_then(Value::as_array).unwrap_or(&empty);
    let team_of = |id: &str| players.iter().find(|player| text(player, "/puuid") == Some(id)).and_then(|player| text(player, "/team_id"));
    let team_info = |team_id: &str| teams_json.iter().find(|team| text(team, "/team_id") == Some(team_id));
    let my_team_info = team_info(&my_team);
    let won = my_team_info.and_then(|team| team["won"].as_bool()).unwrap_or(false);
    let draw = teams_json.iter().all(|team| team["won"].as_bool() == Some(false));

    assign_badges(&mut lines, players, teams_json, draw);

    let attack_first = attacks_first(game, &my_team);

    let my_deaths: Vec<&Value> = {
        let mut list: Vec<&Value> = kills.iter().copied().filter(|kill| text(kill, "/victim/puuid") == Some(puuid)).collect();
        list.sort_by_key(|kill| (int(kill, "/round"), int(kill, "/time_in_round_in_ms")));
        list
    };

    let round_lines: Vec<RoundLine> = rounds
        .iter()
        .enumerate()
        .map(|(index, round)| {
            let stats = round.pointer("/stats").and_then(Value::as_array).unwrap_or(&empty);
            let mut team_total = (0, 0);
            let mut enemy_total = (0, 0);
            let mut mine = (0, 0);
            for stat in stats {
                let id = text(stat, "/player/puuid").unwrap_or_default();
                let loadout = int(stat, "/economy/loadout_value");
                if id == puuid {
                    mine = (loadout, int(stat, "/stats/kills"));
                }
                if team_of(id) == Some(my_team.as_str()) {
                    team_total = (team_total.0 + loadout, team_total.1 + 1);
                } else {
                    enemy_total = (enemy_total.0 + loadout, enemy_total.1 + 1);
                }
            }
            let person = |id: &str, fallback: Option<&str>| {
                let line = lines.iter().find(|line| line.puuid == id);
                (
                    line.map_or_else(|| fallback.unwrap_or(tr("Inconnu", "Unknown")).to_string(), |line| line.name.clone()),
                    line.and_then(|line| line.agent_id.clone()),
                    team_of(id) == Some(my_team.as_str()),
                    id == puuid,
                )
            };
            let mut events: Vec<RoundEvent> = kills
                .iter()
                .filter(|kill| int(kill, "/round") as usize == index)
                .map(|kill| {
                    let (actor, actor_agent_id, actor_ally, actor_me) =
                        person(text(kill, "/killer/puuid").unwrap_or_default(), text(kill, "/killer/name"));
                    let (target, target_agent_id, target_ally, target_me) =
                        person(text(kill, "/victim/puuid").unwrap_or_default(), text(kill, "/victim/name"));
                    RoundEvent {
                        time_s: int(kill, "/time_in_round_in_ms") as f64 / 1000.0,
                        kind: "kill",
                        actor,
                        actor_agent_id,
                        actor_ally,
                        actor_me,
                        target: Some(target),
                        target_agent_id,
                        target_ally,
                        target_me,
                        weapon: text(kill, "/weapon/name").map(str::to_string),
                        weapon_id: kill_weapon_id(kill),
                        weapon_kind: weapon_kind(kill),
                        site: None,
                    }
                })
                .collect();
            for (kind, pointer) in [("plant", "/plant"), ("defuse", "/defuse")] {
                let Some(action) = round.pointer(pointer).filter(|value| value.is_object()) else {
                    continue;
                };
                let (actor, actor_agent_id, actor_ally, actor_me) =
                    person(text(action, "/player/puuid").unwrap_or_default(), text(action, "/player/name"));
                events.push(RoundEvent {
                    time_s: int(action, "/round_time_in_ms") as f64 / 1000.0,
                    kind,
                    actor,
                    actor_agent_id,
                    actor_ally,
                    actor_me,
                    target: None,
                    target_agent_id: None,
                    target_ally: false,
                    target_me: false,
                    weapon: None,
                    weapon_id: None,
                    weapon_kind: None,
                    site: text(action, "/site").map(str::to_string),
                });
            }
            events.sort_by(|a, b| a.time_s.total_cmp(&b.time_s));
            let mut economy: Vec<EconomyLine> = stats
                .iter()
                .map(|stat| {
                    let id = text(stat, "/player/puuid").unwrap_or_default();
                    let (name, agent_id, ally, me) = person(id, text(stat, "/player/name"));
                    EconomyLine {
                        name,
                        agent_id,
                        ally,
                        me,
                        loadout: int(stat, "/economy/loadout_value"),
                        remaining: int(stat, "/economy/remaining"),
                        weapon: text(stat, "/economy/weapon/name").map(str::to_string),
                        weapon_id: held_weapon_id(stat),
                        armor: text(stat, "/economy/armor/name").map(str::to_string),
                        kills: int(stat, "/stats/kills"),
                        damage: stat
                            .pointer("/damage_events")
                            .and_then(Value::as_array)
                            .map_or(0, |events| events.iter().map(|event| int(event, "/damage")).sum()),
                    }
                })
                .collect();
            economy.sort_by(|a, b| b.ally.cmp(&a.ally).then(b.loadout.cmp(&a.loadout)));
            RoundLine {
                number: index + 1,
                won: text(round, "/winning_team") == Some(my_team.as_str()),
                attack: attack_side(index, attack_first),
                planted: round.pointer("/plant").is_some_and(Value::is_object),
                my_loadout: mine.0,
                team_loadout: if team_total.1 > 0 { team_total.0 / team_total.1 } else { 0 },
                enemy_loadout: if enemy_total.1 > 0 { enemy_total.0 / enemy_total.1 } else { 0 },
                my_kills: mine.1,
                died: my_deaths.iter().any(|kill| int(kill, "/round") as usize == index),
                result: result_label(text(round, "/result").unwrap_or_default()),
                ceremony: text(round, "/ceremony").and_then(ceremony_label),
                events,
                economy,
            }
        })
        .collect();

    let mut deaths: Vec<Death> = my_deaths
        .iter()
        .map(|kill| {
            let round = int(kill, "/round") as usize;
            let time = int(kill, "/time_in_round_in_ms");
            let killer_id = text(kill, "/killer/puuid").unwrap_or_default();
            let killer = lines.iter().find(|line| line.puuid == killer_id);
            let locations = kill.pointer("/player_locations").and_then(Value::as_array).unwrap_or(&empty);
            let location_of = |id: &str| {
                locations
                    .iter()
                    .find(|entry| text(entry, "/player/puuid") == Some(id))
                    .and_then(|entry| point(entry, "/location"))
            };
            let victim = point(kill, "/location");
            let killer_location = location_of(killer_id);
            let allies: Vec<(f64, f64)> = locations
                .iter()
                .filter(|entry| {
                    let id = text(entry, "/player/puuid").unwrap_or_default();
                    id != puuid && team_of(id) == Some(my_team.as_str())
                })
                .filter_map(|entry| point(entry, "/location"))
                .collect();
            let nearest_ally_m = victim.and_then(|spot| allies.iter().map(|ally| distance(spot, *ally)).min_by(f64::total_cmp));
            let traded = kills.iter().any(|other| {
                let delta = int(other, "/time_in_round_in_ms") - time;
                int(other, "/round") as usize == round
                    && text(other, "/victim/puuid") == Some(killer_id)
                    && (0..=thresholds.trade_window_ms).contains(&delta)
            });
            let first_death = first_kills
                .get(&(round as i64))
                .is_some_and(|first| text(first, "/victim/puuid") == Some(puuid));
            let others = locations
                .iter()
                .filter_map(|entry| {
                    let id = text(entry, "/player/puuid")?;
                    if id == puuid || id == killer_id {
                        return None;
                    }
                    let spot = projector.position(point(entry, "/location")?)?;
                    Some(Marker { x: spot.x, y: spot.y, ally: team_of(id) == Some(my_team.as_str()) })
                })
                .collect();
            let round_line = round_lines.get(round);
            Death {
                round: round + 1,
                time_s: time as f64 / 1000.0,
                attack: attack_side(round, attack_first),
                round_won: round_line.is_some_and(|line| line.won),
                killer_name: killer.map_or_else(|| tr("Inconnu", "Unknown").to_string(), |line| line.name.clone()),
                killer_agent: killer.and_then(|line| line.agent_name.clone()),
                killer_agent_id: killer.and_then(|line| line.agent_id.clone()),
                weapon: text(kill, "/weapon/name").map(str::to_string),
                weapon_id: kill_weapon_id(kill),
                weapon_kind: weapon_kind(kill),
                distance_m: victim.zip(killer_location).map(|(a, b)| distance(a, b)),
                nearest_ally_m,
                traded,
                first_death,
                loadout: round_line.map_or(0, |line| line.my_loadout),
                zone: victim.and_then(|spot| projector.zone(spot)),
                position: victim.and_then(|spot| projector.position(spot)),
                killer_position: killer_location.and_then(|spot| projector.position(spot)),
                others,
                flaws: Vec::new(),
                positives: Vec::new(),
            }
        })
        .collect();

    let mut zone_counts: HashMap<String, usize> = HashMap::new();
    for death in &deaths {
        if let Some(zone) = &death.zone {
            *zone_counts.entry(zone.clone()).or_default() += 1;
        }
    }
    let english = english();
    for death in &mut deaths {
        if !death.traded {
            death.flaws.push(if english {
                format!("Not traded: nobody killed {} {}", death.killer_name, thresholds.trade_window_text())
            } else {
                format!("Non tradée : personne n'a tué {} {}", death.killer_name, thresholds.trade_window_text())
            });
        } else {
            death.positives.push(tr("Tradée par un coéquipier", "Traded by a teammate").to_string());
        }
        match death.nearest_ally_m {
            Some(meters) if meters > thresholds.isolation_meters => {
                death.flaws.push(if english {
                    format!("Isolated: nearest teammate {} m away", meters.round())
                } else {
                    format!("Isolé : coéquipier le plus proche à {} m", meters.round())
                });
            }
            None => death.positives.push(tr("Dernier joueur en vie de ton équipe", "Last player alive on your team").to_string()),
            _ => {}
        }
        if death.first_death {
            death.flaws.push(tr("Premier mort du round", "First death of the round").to_string());
        }
        if let Some(zone) = &death.zone {
            let count = zone_counts.get(zone).copied().unwrap_or(0);
            if count >= thresholds.same_spot {
                death.flaws.push(if english {
                    format!("{count} deaths at {zone} this match")
                } else {
                    format!("{count} morts à {zone} dans ce match")
                });
            }
        }
        if death.loadout >= thresholds.full_buy {
            death.flaws.push(if english {
                format!("Full buy lost: {} credits", death.loadout)
            } else {
                format!("Full buy perdu : {} crédits", death.loadout)
            });
        }
    }

    let flaws = match_flaws(&deaths, &round_lines, &zone_counts, thresholds);

    let me_line = lines.iter().find(|line| line.is_me)?.clone();
    let teammates: Vec<&PlayerLine> = lines
        .iter()
        .filter(|line| !line.is_me && team_of(&line.puuid) == Some(my_team.as_str()))
        .collect();
    let enemies: Vec<&PlayerLine> = lines.iter().filter(|line| team_of(&line.puuid) != Some(my_team.as_str())).collect();
    let average = |list: &[&PlayerLine]| {
        if list.is_empty() { 0.0 } else { list.iter().map(|line| line.acs).sum::<f64>() / list.len() as f64 }
    };
    let team_acs = average(&teammates);
    let enemy_acs = average(&enemies);
    let level = ratio(team_acs, enemy_acs);
    let team_level = if level < 0.85 {
        tr("Faible", "Weak")
    } else if level > 1.15 {
        tr("Bonne", "Strong")
    } else {
        tr("Moyenne", "Average")
    };

    let mut teams: Vec<TeamBlock> = teams_json
        .iter()
        .filter_map(|team| {
            let team_id = text(team, "/team_id")?;
            let mut members: Vec<PlayerLine> = lines
                .iter()
                .filter(|line| team_of(&line.puuid) == Some(team_id))
                .cloned()
                .collect();
            members.sort_by(|a, b| b.score.cmp(&a.score));
            let avg = if members.is_empty() { 0.0 } else { members.iter().map(|line| line.acs).sum::<f64>() / members.len() as f64 };
            Some(TeamBlock {
                mine: team_id == my_team,
                won: team["won"].as_bool().unwrap_or(false),
                rounds_won: int(team, "/rounds/won"),
                rounds_lost: int(team, "/rounds/lost"),
                avg_acs: avg,
                players: members,
            })
        })
        .collect();
    teams.sort_by_key(|team| !team.mine);

    Some(MatchDetail {
        match_id: text(game, "/metadata/match_id").unwrap_or_default().to_string(),
        map_id: text(game, "/metadata/map/id").map(str::to_string),
        map_name: text(game, "/metadata/map/name").map(str::to_string),
        minimap: map.and_then(|data| data.display_icon.clone()),
        splash: map.and_then(|data| data.splash.clone()),
        rotation: map.map_or(0, MapData::rotation),
        started_at: text(game, "/metadata/started_at").map(str::to_string),
        length_ms: game.pointer("/metadata/game_length_in_ms").and_then(Value::as_i64),
        queue: text(game, "/metadata/queue/id").map(str::to_string),
        season: text(game, "/metadata/season/short").map(str::to_string),
        won,
        rounds_won: my_team_info.map_or(0, |team| int(team, "/rounds/won")),
        rounds_lost: my_team_info.map_or(0, |team| int(team, "/rounds/lost")),
        agent_id: me_line.agent_id.clone(),
        agent_name: me_line.agent_name.clone(),
        score: me_line.score,
        place: me_line.place,
        kills: me_line.kills,
        deaths: me_line.deaths,
        assists: me_line.assists,
        acs: me_line.acs,
        adr: me_line.adr,
        team_level: team_level.to_string(),
        team_acs,
        enemy_acs,
        rr_change: None,
        rr_after: None,
        teams,
        rounds: round_lines,
        death_reviews: deaths,
        flaws,
    })
}

fn assign_badges(lines: &mut [PlayerLine], players: &[Value], teams: &[Value], draw: bool) {
    let team_won = |puuid: &str| {
        let team_id = players
            .iter()
            .find(|player| text(player, "/puuid") == Some(puuid))
            .and_then(|player| text(player, "/team_id"));
        teams
            .iter()
            .find(|team| text(team, "/team_id") == team_id)
            .and_then(|team| team["won"].as_bool())
            .unwrap_or(false)
    };
    let best = |lines: &[PlayerLine], filter: &dyn Fn(&PlayerLine) -> bool, key: &dyn Fn(&PlayerLine) -> f64| {
        lines
            .iter()
            .enumerate()
            .filter(|(_, line)| line.badge.is_none() && filter(line))
            .max_by(|a, b| key(a.1).total_cmp(&key(b.1)))
            .map(|(index, _)| index)
    };
    if !draw {
        if let Some(index) = best(lines, &|line| team_won(&line.puuid), &|line| line.score as f64) {
            lines[index].badge = Some("MVP".into());
        }
        if let Some(index) = best(lines, &|line| !team_won(&line.puuid), &|line| line.score as f64) {
            lines[index].badge = Some(tr("MVP de l'équipe", "Team MVP").into());
        }
    }
    if let Some(index) = best(lines, &|_| true, &|line| line.adr) {
        lines[index].badge = Some(tr("plus de dégâts", "most damage").into());
    }
    let enough_kills = |line: &PlayerLine| line.kills >= MIN_KILLS_FOR_HS_BADGE;
    if let Some(index) = best(lines, &enough_kills, &|line| line.hs_pct) {
        lines[index].badge = Some(tr("meilleur HS", "best HS").into());
    }
    if let Some(index) = best(lines, &|_| true, &|line| -(line.deaths as f64)) {
        lines[index].badge = Some(tr("moins de morts", "fewest deaths").into());
    }
}

fn match_flaws(deaths: &[Death], rounds: &[RoundLine], zones: &HashMap<String, usize>, thresholds: &Thresholds) -> Vec<Flaw> {
    let mut flaws = Vec::new();
    let english = english();
    let total = deaths.len();
    if total == 0 {
        return flaws;
    }

    let untraded = deaths.iter().filter(|death| !death.traded).count();
    if untraded > 0 {
        let traded: Vec<usize> = deaths.iter().filter(|death| death.traded).map(|death| death.round).collect();
        let window = thresholds.trade_window_text();
        let detail = match (traded.is_empty(), english) {
            (true, false) => format!("Aucune de tes morts n'a été vengée {window}"),
            (true, true) => format!("None of your deaths were traded {window}"),
            (false, false) => format!("Seules tes morts des rounds {} ont été vengées {window}", round_list(&traded)),
            (false, true) => format!("Only your deaths in {} were traded {window}", rounds_label(&traded).to_lowercase()),
        };
        flaws.push(Flaw {
            value: format!("{untraded} / {total}"),
            title: tr("morts non tradées", "untraded deaths").into(),
            detail,
        });
    }

    let isolated: Vec<&Death> = deaths
        .iter()
        .filter(|death| death.nearest_ally_m.is_some_and(|meters| meters > thresholds.isolation_meters))
        .collect();
    if !isolated.is_empty() {
        let rounds_list: Vec<usize> = isolated.iter().map(|death| death.round).collect();
        let distances: Vec<f64> = isolated.iter().filter_map(|death| death.nearest_ally_m).collect();
        let min = distances.iter().copied().fold(f64::MAX, f64::min).round();
        let max = distances.iter().copied().fold(0.0, f64::max).round();
        let same = (max - min).abs() < 1.0;
        let detail = match (same, english) {
            (true, false) => format!("{} : coéquipier le plus proche {max} m", rounds_label(&rounds_list)),
            (false, false) => format!("{} : coéquipier le plus proche entre {min} et {max} m", rounds_label(&rounds_list)),
            (true, true) => format!("{}: nearest teammate {max} m away", rounds_label(&rounds_list)),
            (false, true) => format!("{}: nearest teammate {min} to {max} m away", rounds_label(&rounds_list)),
        };
        let title = if isolated.len() > 1 {
            tr("morts en étant isolé", "deaths while isolated")
        } else {
            tr("mort en étant isolé", "death while isolated")
        };
        flaws.push(Flaw { value: isolated.len().to_string(), title: title.into(), detail });
    }

    if let Some((zone, count)) = zones.iter().filter(|(_, count)| **count >= thresholds.same_spot).max_by_key(|(_, count)| **count) {
        let in_zone: Vec<&Death> = deaths.iter().filter(|death| death.zone.as_deref() == Some(zone.as_str())).collect();
        let rounds_list: Vec<usize> = in_zone.iter().map(|death| death.round).collect();
        let side = if in_zone.iter().all(|death| death.attack) {
            tr(", toutes en attaque", ", all on attack")
        } else if in_zone.iter().all(|death| !death.attack) {
            tr(", toutes en défense", ", all on defense")
        } else {
            ""
        };
        flaws.push(Flaw {
            value: count.to_string(),
            title: if english { format!("deaths at {zone}") } else { format!("morts à {zone}") },
            detail: format!("{}{side}", rounds_label(&rounds_list)),
        });
    }

    let first: Vec<&Death> = deaths.iter().filter(|death| death.first_death).collect();
    if !first.is_empty() {
        let rounds_list: Vec<usize> = first.iter().map(|death| death.round).collect();
        let lost = first.iter().filter(|death| !death.round_won).count();
        let detail = match (english, first.len()) {
            (false, _) => format!("{} : ton équipe en a perdu {}", rounds_label(&rounds_list), lost),
            (true, 1) if lost == 1 => format!("{}: your team lost it", rounds_label(&rounds_list)),
            (true, 1) => format!("{}: your team won it", rounds_label(&rounds_list)),
            (true, _) => format!("{}: your team lost {lost} of them", rounds_label(&rounds_list)),
        };
        flaws.push(Flaw {
            value: first.len().to_string(),
            title: if first.len() > 1 { "first deaths".into() } else { "first death".into() },
            detail,
        });
    }

    let wasted: Vec<&RoundLine> = rounds
        .iter()
        .filter(|round| round.died && round.my_loadout >= thresholds.full_buy && round.my_kills == 0)
        .collect();
    if !wasted.is_empty() {
        let rounds_list: Vec<usize> = wasted.iter().map(|round| round.number).collect();
        flaws.push(Flaw {
            value: wasted.len().to_string(),
            title: if wasted.len() > 1 {
                tr("full buys perdus sans kill", "full buys lost without a kill").into()
            } else {
                tr("full buy perdu sans kill", "full buy lost without a kill").into()
            },
            detail: rounds_label(&rounds_list),
        });
    }

    let attack_kills: i64 = rounds.iter().filter(|round| round.attack).map(|round| round.my_kills).sum();
    let defense_kills: i64 = rounds.iter().filter(|round| !round.attack).map(|round| round.my_kills).sum();
    let attack_rounds = rounds.iter().filter(|round| round.attack).count();
    let defense_rounds = rounds.len() - attack_rounds;
    let per_round = (attack_kills + defense_kills) as f64 / rounds.len().max(1) as f64;
    if per_round < 0.5 {
        flaws.push(Flaw {
            value: plural((attack_kills + defense_kills) as usize, "kill"),
            title: if english { format!("in {}", plural(rounds.len(), "round")) } else { format!("en {} rounds", rounds.len()) },
            detail: if english {
                format!(
                    "{attack_kills} in {}, {defense_kills} in {}",
                    plural(attack_rounds, "attack round"),
                    plural(defense_rounds, "defense round")
                )
            } else {
                format!("{attack_kills} en {attack_rounds} rounds d'attaque, {defense_kills} en {defense_rounds} rounds de défense")
            },
        });
    }

    flaws
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn player(puuid: &str, team: &str, kills: i64, deaths: i64) -> Value {
        json!({
            "puuid": puuid,
            "name": puuid,
            "tag": "0000",
            "team_id": team,
            "agent": { "id": "jett", "name": "Jett" },
            "stats": {
                "score": kills * 200,
                "kills": kills,
                "deaths": deaths,
                "assists": 0,
                "headshots": kills,
                "bodyshots": kills,
                "legshots": 0,
                "damage": { "dealt": kills * 150 },
            },
        })
    }

    fn sample() -> Value {
        json!({
            "metadata": { "match_id": "m1", "map": { "id": "ascent", "name": "Ascent" } },
            "players": [player("me", "Red", 0, 1), player("foe", "Blue", 1, 0)],
            "teams": [
                { "team_id": "Red", "won": false, "rounds": { "won": 0, "lost": 1 } },
                { "team_id": "Blue", "won": true, "rounds": { "won": 1, "lost": 0 } },
            ],
            "rounds": [{ "winning_team": "Blue", "winning_team_role": "Attacker", "result": "Elimination" }],
            "kills": [{
                "round": 0,
                "time_in_round_in_ms": 5000,
                "killer": { "puuid": "foe", "name": "foe" },
                "victim": { "puuid": "me", "name": "me" },
                "weapon": { "name": "Vandal", "type": "Weapon" },
            }],
        })
    }

    fn analyze_in(language: &str) -> MatchDetail {
        crate::i18n::set(language);
        let detail = analyze(&sample(), "me", None, &HashMap::new(), &Thresholds::default());
        crate::i18n::set("fr");
        detail.expect("sample match")
    }

    #[test]
    fn writes_texts_in_french() {
        let detail = analyze_in("fr");
        let flaws: Vec<(&str, &str, &str)> =
            detail.flaws.iter().map(|flaw| (flaw.value.as_str(), flaw.title.as_str(), flaw.detail.as_str())).collect();
        assert_eq!(
            flaws,
            [
                ("1 / 1", "morts non tradées", "Aucune de tes morts n'a été vengée dans les 3 secondes"),
                ("1", "first death", "Rounds 1 : ton équipe en a perdu 1"),
                ("0 kill", "en 1 rounds", "0 en 0 rounds d'attaque, 0 en 1 rounds de défense"),
            ]
        );
        let death = &detail.death_reviews[0];
        assert_eq!(death.flaws, ["Non tradée : personne n'a tué foe dans les 3 secondes", "Premier mort du round"]);
        assert_eq!(death.positives, ["Dernier joueur en vie de ton équipe"]);
        assert_eq!(detail.team_level, "Faible");
        assert_eq!(detail.rounds[0].result, "Élimination");
    }

    #[test]
    fn writes_texts_in_english() {
        let detail = analyze_in("en");
        let flaws: Vec<(&str, &str, &str)> =
            detail.flaws.iter().map(|flaw| (flaw.value.as_str(), flaw.title.as_str(), flaw.detail.as_str())).collect();
        assert_eq!(
            flaws,
            [
                ("1 / 1", "untraded deaths", "None of your deaths were traded within 3 seconds"),
                ("1", "first death", "Round 1: your team lost it"),
                ("0 kills", "in 1 round", "0 in 0 attack rounds, 0 in 1 defense round"),
            ]
        );
        let death = &detail.death_reviews[0];
        assert_eq!(death.flaws, ["Not traded: nobody killed foe within 3 seconds", "First death of the round"]);
        assert_eq!(death.positives, ["Last player alive on your team"]);
        assert_eq!(detail.team_level, "Weak");
        assert_eq!(detail.rounds[0].result, "Elimination");
        assert!(!crate::i18n::english());
    }
}
