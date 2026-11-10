use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::reports::Report;
use crate::state::AppState;
use crate::storage;

const COMPETITIVE: &str = "competitive";
const RANKED_FROM: i64 = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PastGame {
    pub started_at: String,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub won: bool,
    pub draw: bool,
    pub tier: Option<i64>,
    pub allies: Option<f64>,
    pub enemies: Option<f64>,
    pub party: i64,
    pub ally_agents: Vec<String>,
    pub enemy_agents: Vec<String>,
}

#[derive(Deserialize)]
struct Lineup {
    #[serde(default)]
    players: Vec<Member>,
}

#[derive(Deserialize)]
struct Member {
    puuid: Option<String>,
    team_id: Option<String>,
    party_id: Option<String>,
}

fn party_size(raw: Option<&[u8]>, puuid: &str) -> i64 {
    let Some(lineup) = raw.and_then(storage::inflate).and_then(|json| serde_json::from_slice::<Lineup>(&json).ok()) else {
        return 1;
    };
    let Some(me) = lineup.players.iter().find(|player| player.puuid.as_deref() == Some(puuid)) else {
        return 1;
    };
    let Some(party) = me.party_id.as_deref().filter(|party| !party.is_empty()) else {
        return 1;
    };
    lineup.players.iter().filter(|player| player.team_id == me.team_id && player.party_id.as_deref() == Some(party)).count().max(1) as i64
}

fn agents(list: Option<String>) -> Vec<String> {
    list.map(|text| text.split(',').filter(|agent| !agent.is_empty()).map(str::to_string).collect()).unwrap_or_default()
}

pub fn history(conn: &Connection, puuid: &str) -> AppResult<Vec<PastGame>> {
    let mut stmt = conn.prepare(
        "SELECT m.started_at, m.map_id, m.map_name, p.agent_id, p.agent_name, p.won, p.rounds_won = p.rounds_lost, p.tier,
                (SELECT AVG(q.tier) FROM match_players q WHERE q.match_id = p.match_id AND q.team = p.team AND q.puuid <> p.puuid AND q.tier >= ?3),
                (SELECT AVG(q.tier) FROM match_players q WHERE q.match_id = p.match_id AND q.team <> p.team AND q.tier >= ?3),
                (SELECT GROUP_CONCAT(LOWER(q.agent_id)) FROM match_players q WHERE q.match_id = p.match_id AND q.team = p.team AND q.puuid <> p.puuid),
                (SELECT GROUP_CONCAT(LOWER(q.agent_id)) FROM match_players q WHERE q.match_id = p.match_id AND q.team <> p.team),
                m.raw
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2
         ORDER BY m.started_at",
    )?;
    let games = stmt
        .query_map(params![puuid, COMPETITIVE, RANKED_FROM], |row| {
            Ok(PastGame {
                started_at: row.get(0)?,
                map_id: row.get(1)?,
                map_name: row.get(2)?,
                agent_id: row.get(3)?,
                agent_name: row.get(4)?,
                won: row.get(5)?,
                draw: row.get(6)?,
                tier: row.get::<_, Option<i64>>(7)?.filter(|tier| *tier >= RANKED_FROM),
                allies: row.get(8)?,
                enemies: row.get(9)?,
                party: party_size(row.get_ref(12)?.as_bytes().ok(), puuid),
                ally_agents: agents(row.get(10)?),
                enemy_agents: agents(row.get(11)?),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(games)
}

#[tauri::command(async)]
pub fn get_next_game(state: State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    Report::NextGame.serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn averages_teammates_and_opponents_without_me() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE matches (match_id TEXT PRIMARY KEY, started_at TEXT, map_id TEXT, map_name TEXT, queue TEXT, raw BLOB);
             CREATE TABLE match_players (match_id TEXT, puuid TEXT, team TEXT, agent_id TEXT, agent_name TEXT, tier INTEGER, won INTEGER, rounds_won INTEGER, rounds_lost INTEGER);
             INSERT INTO matches VALUES ('b', '2026-01-02', 'bind', 'Bind', 'competitive', NULL),
               ('a', '2026-01-01', 'ascent', 'Ascent', 'competitive', '{\"players\":[{\"puuid\":\"me\",\"team_id\":\"Red\",\"party_id\":\"p\"},{\"puuid\":\"mate\",\"team_id\":\"Red\",\"party_id\":\"p\"},{\"puuid\":\"foe1\",\"team_id\":\"Blue\",\"party_id\":\"p\"}]}'),
               ('d', '2026-01-03', 'ascent', 'Ascent', 'deathmatch', NULL);
             INSERT INTO match_players VALUES
               ('a', 'me', 'Red', 'jett', 'Jett', 20, 1, 13, 7), ('a', 'mate', 'Red', 'sova', 'Sova', 22, 1, 13, 7), ('a', 'low', 'Red', 'omen', 'Omen', 0, 1, 13, 7),
               ('a', 'foe1', 'Blue', 'neon', 'Neon', 18, 0, 7, 13), ('a', 'foe2', 'Blue', 'kayo', 'KAY/O', 24, 0, 7, 13),
               ('b', 'me', 'Red', 'jett', 'Jett', 21, 0, 12, 12),
               ('d', 'me', 'Red', 'jett', 'Jett', 21, 1, 0, 0);",
        )
        .unwrap();
        let games = history(&conn, "me").unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].map_name.as_deref(), Some("Ascent"));
        assert_eq!((games[0].allies, games[0].enemies), (Some(22.0), Some(21.0)));
        assert!(games[1].draw && !games[1].won && games[1].allies.is_none());
        assert_eq!((games[0].party, games[1].party), (2, 1));
        assert_eq!(games[0].enemy_agents.len(), 2);
        assert!(games[0].ally_agents.contains(&"sova".to_string()) && !games[0].ally_agents.contains(&"jett".to_string()));
    }
}
