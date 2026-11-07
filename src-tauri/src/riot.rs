use serde::Serialize;
use serde_json::Value;

use crate::i18n::tr;

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
}
