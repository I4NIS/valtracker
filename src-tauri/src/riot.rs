use serde::Serialize;
use serde_json::Value;

use crate::i18n::{english, tr};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiotFigure {
    pub key: &'static str,
    pub label: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiotRating {
    pub key: &'static str,
    pub group: &'static str,
    pub label: String,
    pub trend: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiotPerformance {
    pub score: Option<f64>,
    pub grade: Option<String>,
    pub breakdown: Vec<RiotFigure>,
    pub ratings: Vec<RiotRating>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSpot {
    pub x: f64,
    pub y: f64,
    pub name: String,
    pub agent_id: Option<String>,
    pub ally: bool,
    pub me: bool,
}

const BREAKDOWN: [(&str, &str, &str); 8] = [
    ("adjusted_kills", "Kills ajustés", "Adjusted kills"),
    ("adjusted_deaths", "Morts ajustées", "Adjusted deaths"),
    ("damage", "Dégâts", "Damage"),
    ("trades", "Trades", "Trades"),
    ("assists", "Assistances", "Assists"),
    ("utility_usage", "Utilitaires", "Utility usage"),
    ("plants", "Poses du spike", "Plants"),
    ("defuses", "Désamorçages", "Defuses"),
];

const RATINGS: [(&str, &str, &str, &str); 8] = [
    ("combat", "kill_impact", "Impact des kills", "Kill impact"),
    ("combat", "death_impact", "Impact des morts", "Death impact"),
    ("combat", "damage", "Dégâts", "Damage"),
    ("combat", "trades", "Trades", "Trades"),
    ("utility", "utility_usage", "Utilitaires", "Utility usage"),
    ("utility", "assists", "Assistances", "Assists"),
    ("utility", "plants", "Poses du spike", "Plants"),
    ("utility", "defuses", "Désamorçages", "Defuses"),
];

pub fn score(player: &Value) -> Option<f64> {
    player.pointer("/performance/score").and_then(Value::as_f64)
}

pub fn grade(player: &Value) -> Option<String> {
    player.pointer("/performance/ratings/grade").and_then(Value::as_str).filter(|grade| !grade.is_empty()).map(str::to_string)
}

pub fn performance(player: &Value) -> Option<RiotPerformance> {
    let performance = player.get("performance").filter(|value| value.is_object())?;
    let breakdown = BREAKDOWN
        .iter()
        .filter_map(|(key, fr, en)| {
            let value = performance.get("breakdown")?.get(*key)?.as_f64()?;
            Some(RiotFigure { key: *key, label: tr(*fr, *en).to_string(), value })
        })
        .collect();
    let ratings = RATINGS
        .iter()
        .filter_map(|(group, key, fr, en)| {
            let trend = performance.get("ratings")?.get(*group)?.get(*key)?.as_str().filter(|trend| !trend.is_empty())?;
            Some(RiotRating { key: *key, group: *group, label: tr(*fr, *en).to_string(), trend: trend.to_string() })
        })
        .collect();
    let found = RiotPerformance { score: score(player), grade: grade(player), breakdown, ratings };
    let empty = found.score.is_none() && found.grade.is_none() && found.breakdown.is_empty() && found.ratings.is_empty();
    (!empty).then_some(found)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub tone: &'static str,
    pub text: String,
}

fn rounds_word(count: i64) -> &'static str {
    let many = if english() { count != 1 } else { count > 1 };
    if many { "rounds" } else { "round" }
}

fn joined(rounds: &[usize]) -> String {
    let parts: Vec<String> = rounds.iter().map(ToString::to_string).collect();
    match parts.len() {
        0 => String::new(),
        1 => parts[0].clone(),
        n => format!("{} {} {}", parts[..n - 1].join(", "), tr("et", "and"), parts[n - 1]),
    }
}

fn listed(rounds: &[usize]) -> String {
    if rounds.is_empty() {
        return String::new();
    }
    format!(" ({} {})", rounds_word(rounds.len() as i64), joined(rounds))
}

fn amount(player: &Value, pointer: &str) -> f64 {
    player.pointer(pointer).and_then(Value::as_f64).unwrap_or(0.0)
}

fn has_round_flags(rounds: &[Value]) -> bool {
    rounds.iter().any(|round| {
        round.get("stats").and_then(Value::as_array).is_some_and(|stats| stats.iter().any(|stat| stat.get("was_afk").is_some_and(Value::is_boolean)))
    })
}

pub fn behavior(game: &Value, puuid: &str) -> Option<Vec<Fact>> {
    let players = game.get("players")?.as_array()?;
    let empty = Vec::new();
    let rounds = game.get("rounds").and_then(Value::as_array).unwrap_or(&empty);
    let known = players.iter().any(|player| player.get("behavior").is_some_and(Value::is_object)) || has_round_flags(rounds);
    if !known {
        return None;
    }
    let my_team = players.iter().find(|player| player["puuid"].as_str() == Some(puuid)).and_then(|player| player["team_id"].as_str());
    let flagged = |id: &str, flag: &str| -> Vec<usize> {
        rounds
            .iter()
            .enumerate()
            .filter(|(_, round)| {
                round.get("stats").and_then(Value::as_array).is_some_and(|stats| {
                    stats.iter().any(|stat| stat.pointer("/player/puuid").and_then(Value::as_str) == Some(id) && stat[flag] == Value::Bool(true))
                })
            })
            .map(|(index, _)| index + 1)
            .collect()
    };
    let english = english();
    let mut facts: Vec<(u8, Fact)> = Vec::new();
    for player in players {
        let Some(id) = player["puuid"].as_str() else {
            continue;
        };
        let me = id == puuid;
        let ally = !me && my_team.is_some() && player["team_id"].as_str() == my_team;
        let group = if me { 0 } else if ally { 1 } else { 2 };
        let tone = if group < 2 { "bad" } else { "neutral" };
        let name = player["name"].as_str().filter(|name| !name.is_empty()).unwrap_or(tr("Inconnu", "Unknown"));
        let who = format!("{name}, {}", if ally { tr("coéquipier", "teammate") } else { tr("adversaire", "opponent") });
        let mut push = |text: String| facts.push((group, Fact { tone, text }));

        let afk_list = flagged(id, "was_afk");
        let afk = amount(player, "/behavior/afk_rounds").round().max(afk_list.len() as f64) as i64;
        if afk > 0 {
            let (word, list) = (rounds_word(afk), listed(&afk_list));
            push(match (me, english) {
                (true, false) => format!("Tu as été AFK pendant {afk} {word}{list}"),
                (true, true) => format!("You were AFK for {afk} {word}{list}"),
                (false, false) => format!("{who}, AFK pendant {afk} {word}{list}"),
                (false, true) => format!("{who}, AFK for {afk} {word}{list}"),
            });
        }
        let spawn_list = flagged(id, "stayed_in_spawn");
        let spawn = amount(player, "/behavior/rounds_in_spawn").round().max(spawn_list.len() as f64) as i64;
        if spawn > afk {
            let (word, list) = (rounds_word(spawn), listed(&spawn_list));
            push(match (me, english) {
                (true, false) => format!("Tu es resté dans le spawn pendant {spawn} {word}{list}"),
                (true, true) => format!("You stayed in spawn for {spawn} {word}{list}"),
                (false, false) => format!("{who}, resté dans le spawn pendant {spawn} {word}{list}"),
                (false, true) => format!("{who}, stayed in spawn for {spawn} {word}{list}"),
            });
        }
        let penalties = flagged(id, "received_penalty");
        if !penalties.is_empty() {
            let at = match (penalties.len() > 1, english) {
                (false, false) => format!("au round {}", joined(&penalties)),
                (true, false) => format!("aux rounds {}", joined(&penalties)),
                (false, true) => format!("in round {}", joined(&penalties)),
                (true, true) => format!("in rounds {}", joined(&penalties)),
            };
            push(match (me, english) {
                (true, false) => format!("Pénalité reçue {at}"),
                (true, true) => format!("Penalty received {at}"),
                (false, false) => format!("{who}, pénalité reçue {at}"),
                (false, true) => format!("{who}, penalty received {at}"),
            });
        }
        let incoming = amount(player, "/behavior/friendly_fire/incoming").round() as i64;
        let outgoing = amount(player, "/behavior/friendly_fire/outgoing").round() as i64;
        if me && incoming > 0 {
            push(if english { format!("Friendly fire: {incoming} damage taken") } else { format!("Tirs alliés : {incoming} dégâts reçus") });
        }
        if me && outgoing > 0 {
            push(if english {
                format!("Friendly fire: {outgoing} damage dealt to your teammates")
            } else {
                format!("Tirs alliés : {outgoing} dégâts infligés à tes coéquipiers")
            });
        }
        if ally && outgoing > 0 {
            push(if english { format!("{who}, friendly fire: {outgoing} damage dealt") } else { format!("{who}, tirs alliés : {outgoing} dégâts infligés") });
        }
    }
    facts.sort_by_key(|(group, _)| *group);
    Some(facts.into_iter().map(|(_, fact)| fact).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_the_riot_performance_of_a_player() {
        let player = json!({ "performance": {
            "score": 812.5,
            "breakdown": { "adjusted_kills": 14.2, "adjusted_deaths": -1.5, "damage": null },
            "ratings": { "grade": "merit", "combat": { "kill_impact": "up", "trades": null }, "utility": null },
        }});
        let found = performance(&player).unwrap();
        assert_eq!(found.score, Some(812.5));
        assert_eq!(found.grade.as_deref(), Some("merit"));
        assert_eq!(found.breakdown.iter().map(|figure| figure.key).collect::<Vec<_>>(), ["adjusted_kills", "adjusted_deaths"]);
        assert_eq!(found.ratings.len(), 1);
        assert_eq!(found.ratings[0].trend, "up");
        assert!(performance(&json!({ "performance": null })).is_none());
        assert!(performance(&json!({})).is_none());
        assert!(performance(&json!({ "performance": { "breakdown": {} } })).is_none());
    }

    pub fn stored(players: Value) -> rusqlite::Connection {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        let game = json!({
            "metadata": { "match_id": "m", "queue": { "id": "competitive" }, "started_at": "2026-01-01T20:00:00.000Z" },
            "players": players,
            "teams": [{ "team_id": "Red", "won": true }, { "team_id": "Blue", "won": false }],
            "rounds": [{ "winning_team": "Red" }],
        });
        assert!(crate::repo::insert_match(&mut conn, game).unwrap());
        conn
    }

    #[test]
    fn stores_the_riot_grade_of_each_player() {
        let conn = stored(json!([
            { "puuid": "p", "team_id": "Red", "performance": { "score": 700.0, "ratings": { "grade": "distinction" } } },
            { "puuid": "q", "team_id": "Blue" },
        ]));
        let mut stmt = conn.prepare("SELECT puuid, riot_score, riot_grade FROM match_players ORDER BY puuid").unwrap();
        let rows: Vec<(String, Option<f64>, Option<String>)> =
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(rows, [("p".into(), Some(700.0), Some("distinction".into())), ("q".into(), None, None)]);
    }

    fn conduct(afk: f64, incoming: f64, outgoing: f64) -> Value {
        json!({ "afk_rounds": afk, "friendly_fire": { "incoming": incoming, "outgoing": outgoing }, "rounds_in_spawn": afk })
    }

    #[test]
    fn lists_behavior_facts_only_when_they_are_not_zero() {
        let game = json!({
            "players": [
                { "puuid": "me", "name": "Moi", "team_id": "Red", "behavior": conduct(0.0, 120.0, 0.0) },
                { "puuid": "a", "name": "Ally", "team_id": "Red", "behavior": conduct(2.0, 0.0, 120.0) },
                { "puuid": "e", "name": "Foe", "team_id": "Blue", "behavior": conduct(0.0, 0.0, 0.0) },
            ],
            "rounds": [
                { "stats": [
                    { "player": { "puuid": "a" }, "was_afk": true, "stayed_in_spawn": true, "received_penalty": false },
                    { "player": { "puuid": "e" }, "was_afk": false, "stayed_in_spawn": false, "received_penalty": true },
                ] },
                { "stats": [{ "player": { "puuid": "a" }, "was_afk": true, "stayed_in_spawn": true, "received_penalty": false }] },
            ],
        });
        crate::i18n::set("fr");
        let facts: Vec<(&str, String)> = behavior(&game, "me").unwrap().into_iter().map(|fact| (fact.tone, fact.text)).collect();
        assert_eq!(
            facts,
            [
                ("bad", "Tirs alliés : 120 dégâts reçus".to_string()),
                ("bad", "Ally, coéquipier, AFK pendant 2 rounds (rounds 1 et 2)".to_string()),
                ("bad", "Ally, coéquipier, tirs alliés : 120 dégâts infligés".to_string()),
                ("neutral", "Foe, adversaire, pénalité reçue au round 1".to_string()),
            ]
        );
        crate::i18n::set("en");
        let english: Vec<String> = behavior(&game, "me").unwrap().into_iter().map(|fact| fact.text).collect();
        crate::i18n::set("fr");
        assert_eq!(english[1], "Ally, teammate, AFK for 2 rounds (rounds 1 and 2)");
        assert!(behavior(&json!({ "players": [{ "puuid": "me" }], "rounds": [{ "stats": [{ "player": { "puuid": "me" } }] }] }), "me").is_none());
        assert!(behavior(&json!({ "players": [{ "puuid": "me", "behavior": conduct(0.0, 0.0, 0.0) }] }), "me").unwrap().is_empty());
    }

    #[test]
    fn counts_matches_played_with_an_afk_teammate() {
        let conn = stored(json!([
            { "puuid": "me", "team_id": "Blue", "behavior": conduct(0.0, 40.0, 0.0) },
            { "puuid": "a", "team_id": "Blue", "behavior": conduct(3.0, 0.0, 40.0) },
            { "puuid": "e", "team_id": "Red", "behavior": conduct(0.0, 0.0, 0.0) },
        ]));
        let found = crate::progression::conduct(&conn, "me", None).unwrap().unwrap();
        assert_eq!((found.matches, found.with_afk_ally, found.losses_with_afk_ally, found.with_afk_enemy), (1, 1, 1, 0));
        assert_eq!((found.friendly_fire_received, found.friendly_fire_dealt), (40.0, 0.0));
        let found = crate::progression::conduct(&conn, "e", None).unwrap().unwrap();
        assert_eq!((found.with_afk_ally, found.with_afk_enemy, found.wins_with_afk_enemy), (0, 1, 1));
        assert!(crate::progression::conduct(&conn, "nobody", None).unwrap().is_none());
    }
}
