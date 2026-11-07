use rusqlite::{Connection, params};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::extras;
use crate::henrik::Henrik;
use crate::reports::Report;
use crate::state::AppState;

const HOUR: i64 = 3_600;
const DEATHMATCH: &str = "deathmatch";
const TEAM_DEATHMATCH: &str = "teamdeathmatch";
const MODES: [&[&str]; 2] = [&[DEATHMATCH], &[TEAM_DEATHMATCH, "hurm"]];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupGame {
    pub match_id: String,
    pub started_at: String,
    pub mode: String,
    pub season: Option<String>,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub score: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub headshots: i64,
    pub bodyshots: i64,
    pub legshots: i64,
    pub damage_made: i64,
    pub damage_received: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedGame {
    pub started_at: String,
    pub won: bool,
    pub kills: i64,
    pub deaths: i64,
    pub headshots: i64,
    pub shots: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupReport {
    pub games: Vec<WarmupGame>,
    pub ranked: Vec<RankedGame>,
}

fn next_key(puuid: &str) -> String {
    format!("warmup_next|{puuid}")
}

pub fn is_report(key: &str) -> bool {
    key.contains("|Warmup(")
}

fn text(value: &Value, pointer: &str) -> Option<String> {
    value.pointer(pointer).and_then(Value::as_str).map(str::trim).filter(|text| !text.is_empty()).map(str::to_string)
}

fn int(value: &Value, pointer: &str) -> i64 {
    value.pointer(pointer).and_then(Value::as_i64).unwrap_or(0).max(0)
}

fn mode_of(raw: &str) -> Option<&'static str> {
    let compact: String = raw.chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_lowercase();
    match compact.as_str() {
        DEATHMATCH => Some(DEATHMATCH),
        TEAM_DEATHMATCH | "hurm" => Some(TEAM_DEATHMATCH),
        _ => None,
    }
}

pub fn parse(data: &Value, puuid: &str) -> Vec<WarmupGame> {
    let Some(items) = data.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            if !text(item, "/stats/puuid")?.eq_ignore_ascii_case(puuid) {
                return None;
            }
            Some(WarmupGame {
                match_id: text(item, "/meta/id")?,
                started_at: text(item, "/meta/started_at")?,
                mode: mode_of(&text(item, "/meta/mode")?)?.to_string(),
                season: text(item, "/meta/season/short"),
                map_id: text(item, "/meta/map/id"),
                map_name: text(item, "/meta/map/name"),
                agent_id: text(item, "/stats/character/id"),
                agent_name: text(item, "/stats/character/name"),
                score: int(item, "/stats/score"),
                kills: int(item, "/stats/kills"),
                deaths: int(item, "/stats/deaths"),
                assists: int(item, "/stats/assists"),
                headshots: int(item, "/stats/shots/head"),
                bodyshots: int(item, "/stats/shots/body"),
                legshots: int(item, "/stats/shots/leg"),
                damage_made: int(item, "/stats/damage/made"),
                damage_received: int(item, "/stats/damage/received"),
            })
        })
        .collect()
}

pub fn store(conn: &mut Connection, puuid: &str, games: &[WarmupGame]) -> AppResult<usize> {
    let tx = conn.transaction()?;
    let mut added = 0;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO warmup_matches (puuid, match_id, started_at, mode, season_short, map_id, map_name, agent_id, agent_name,
                score, kills, deaths, assists, headshots, bodyshots, legshots, damage_made, damage_received)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        )?;
        for game in games {
            added += stmt.execute(params![
                puuid,
                game.match_id,
                game.started_at,
                game.mode,
                game.season,
                game.map_id,
                game.map_name,
                game.agent_id,
                game.agent_name,
                game.score,
                game.kills,
                game.deaths,
                game.assists,
                game.headshots,
                game.bodyshots,
                game.legshots,
                game.damage_made,
                game.damage_received,
            ])?;
        }
    }
    tx.commit()?;
    Ok(added)
}

pub async fn refresh(state: &AppState, api: &Henrik, region: &str, puuid: &str) -> bool {
    if !state.conn().is_ok_and(|conn| extras::due(&conn, &next_key(puuid))) {
        return false;
    }
    let mut added = 0;
    for names in MODES {
        for name in names {
            extras::idle(state).await;
            match api.stored_matches(region, puuid, name).await {
                Ok(data) => {
                    let games = parse(&data, puuid);
                    if let Ok(mut conn) = state.conn() {
                        added += store(&mut conn, puuid, &games).unwrap_or(0);
                    }
                    break;
                }
                Err(AppError::Api(_)) => continue,
                Err(_) => break,
            }
        }
    }
    if let Ok(conn) = state.conn() {
        extras::next_in(&conn, &next_key(puuid), HOUR);
    }
    if added > 0 {
        state.forget(is_report);
    }
    added > 0
}

pub fn report(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<WarmupReport> {
    let mut stmt = conn.prepare(
        "SELECT match_id, started_at, mode, season_short, map_id, map_name, agent_id, agent_name, score, kills, deaths, assists,
                headshots, bodyshots, legshots, damage_made, damage_received
         FROM warmup_matches
         WHERE puuid = ?1 AND (?2 IS NULL OR lower(season_short) = lower(?2))
         ORDER BY started_at",
    )?;
    let games = stmt
        .query_map(params![puuid, season], |row| {
            Ok(WarmupGame {
                match_id: row.get(0)?,
                started_at: row.get(1)?,
                mode: row.get(2)?,
                season: row.get(3)?,
                map_id: row.get(4)?,
                map_name: row.get(5)?,
                agent_id: row.get(6)?,
                agent_name: row.get(7)?,
                score: row.get(8)?,
                kills: row.get(9)?,
                deaths: row.get(10)?,
                assists: row.get(11)?,
                headshots: row.get(12)?,
                bodyshots: row.get(13)?,
                legshots: row.get(14)?,
                damage_made: row.get(15)?,
                damage_received: row.get(16)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    if games.is_empty() {
        return Ok(WarmupReport { games, ranked: Vec::new() });
    }
    let mut stmt = conn.prepare(
        "SELECT m.started_at, p.won, p.kills, p.deaths, p.headshots, p.headshots + p.bodyshots + p.legshots
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = 'competitive' AND (?2 IS NULL OR lower(m.season_short) = lower(?2))
         ORDER BY m.started_at",
    )?;
    let ranked = stmt
        .query_map(params![puuid, season], |row| {
            Ok(RankedGame {
                started_at: row.get(0)?,
                won: row.get(1)?,
                kills: row.get(2)?,
                deaths: row.get(3)?,
                headshots: row.get(4)?,
                shots: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(WarmupReport { games, ranked })
}

#[tauri::command(async)]
pub fn get_warmup(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<tauri::ipc::Response> {
    Report::Warmup(season).serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Value {
        serde_json::json!([
            {
                "meta": { "id": "d1", "map": { "id": "m", "name": "Ascent" }, "version": "v", "mode": "Deathmatch", "started_at": "2026-07-10T12:34:56Z", "season": { "id": "s", "short": "E10A5" }, "region": "eu" },
                "stats": { "puuid": "ME", "team": "Blue", "level": 1, "character": { "id": "a", "name": "Jett" }, "tier": 0, "score": 900, "kills": 30, "deaths": 15, "assists": 0, "shots": { "head": 40, "body": 50, "leg": 10 }, "damage": { "made": 4000, "received": 2500 } },
                "teams": { "red": 0, "blue": 0 }
            },
            {
                "meta": { "id": "t1", "map": { "id": "m2", "name": "Piazza" }, "version": "v", "mode": "Team Deathmatch", "started_at": "2026-07-11T10:00:00Z", "season": { "id": "s", "short": "E10A5" }, "region": "eu" },
                "stats": { "puuid": "me", "team": "Red", "level": 1, "character": { "id": "b", "name": "Sova" }, "tier": 0, "score": 500, "kills": 20, "deaths": 18, "assists": 3, "shots": { "head": 10, "body": 30, "leg": 2 }, "damage": { "made": 3000, "received": 2900 } },
                "teams": { "red": 100, "blue": 80 }
            },
            {
                "meta": { "id": "c1", "map": { "id": "m", "name": "Ascent" }, "version": "v", "mode": "Competitive", "started_at": "2026-07-11T11:00:00Z", "season": { "id": "s", "short": "E10A5" }, "region": "eu" },
                "stats": { "puuid": "me", "team": "Red", "level": 1, "character": { "id": "b", "name": "Sova" }, "tier": 0, "score": 500, "kills": 20, "deaths": 18, "assists": 3, "shots": { "head": 10, "body": 30, "leg": 2 }, "damage": { "made": 3000, "received": 2900 } },
                "teams": { "red": 13, "blue": 8 }
            },
            {
                "meta": { "id": "o1", "map": { "id": "m", "name": "Ascent" }, "version": "v", "mode": "Deathmatch", "started_at": "2026-07-11T11:00:00Z", "season": { "id": "s", "short": "E10A5" }, "region": "eu" },
                "stats": { "puuid": "other", "team": "Red", "level": 1, "character": { "id": "b", "name": "Sova" }, "tier": 0, "score": 1, "kills": 1, "deaths": 1, "assists": 0, "shots": { "head": 0, "body": 0, "leg": 0 }, "damage": { "made": 0, "received": 0 } },
                "teams": { "red": 0, "blue": 0 }
            }
        ])
    }

    #[test]
    fn keeps_the_player_deathmatch_summaries_only() {
        let games = parse(&sample(), "me");
        assert_eq!(games.iter().map(|game| (game.match_id.as_str(), game.mode.as_str())).collect::<Vec<_>>(), [("d1", DEATHMATCH), ("t1", TEAM_DEATHMATCH)]);
        assert_eq!((games[0].headshots, games[0].bodyshots, games[0].legshots, games[0].damage_made), (40, 50, 10, 4000));
        assert_eq!(games[1].agent_name.as_deref(), Some("Sova"));
        assert!(parse(&Value::Null, "me").is_empty());
    }

    #[test]
    fn stores_each_summary_once_and_reports_by_season() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        let games = parse(&sample(), "me");
        assert_eq!(store(&mut conn, "me", &games).unwrap(), 2);
        assert_eq!(store(&mut conn, "me", &games).unwrap(), 0);
        conn.execute_batch(
            "INSERT INTO matches (match_id, started_at, queue, season_short, rounds, raw) VALUES ('r1', '2026-07-10T13:00:00.000Z', 'competitive', 'e10a5', 20, x'7b7d');
             INSERT INTO match_players (match_id, puuid, kills, deaths, headshots, bodyshots, legshots, won) VALUES ('r1', 'me', 20, 10, 5, 15, 0, 1);",
        )
        .unwrap();
        let report = report(&conn, "me", Some("e10a5")).unwrap();
        assert_eq!(report.games, games);
        assert_eq!(report.ranked.len(), 1);
        assert_eq!((report.ranked[0].won, report.ranked[0].shots), (true, 20));
        assert!(super::report(&conn, "me", Some("e9a1")).unwrap().games.is_empty());
        assert!(super::report(&conn, "nobody", None).unwrap().ranked.is_empty());
    }
}
