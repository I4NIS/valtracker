use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::reports::Report;
use crate::state::AppState;

const KINDS: [&str; 3] = ["match", "round", "death"];
const WHOLE_MATCH: i64 = -1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub kind: String,
    pub match_id: String,
    pub round_index: Option<i64>,
    pub started_at: String,
    pub map_name: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub won: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub created_at: String,
}

fn key(kind: &str, round_index: Option<i64>) -> AppResult<i64> {
    if !KINDS.contains(&kind) {
        return Err(AppError::Invalid("Type de favori inconnu".into()));
    }
    match (kind, round_index) {
        ("match", _) => Ok(WHOLE_MATCH),
        (_, Some(index)) if index >= 0 => Ok(index),
        _ => Err(AppError::Invalid("Round manquant".into())),
    }
}

pub fn toggle(conn: &Connection, puuid: &str, match_id: &str, kind: &str, round_index: Option<i64>) -> AppResult<bool> {
    let round = key(kind, round_index)?;
    let known = conn
        .query_row(
            "SELECT 1 FROM match_players WHERE match_id = ?1 AND puuid = ?2",
            params![match_id, puuid],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !known {
        return Err(AppError::Invalid("Match introuvable".into()));
    }
    let removed = conn.execute(
        "DELETE FROM favorites WHERE puuid = ?1 AND match_id = ?2 AND kind = ?3 AND round_index = ?4",
        params![puuid, match_id, kind, round],
    )?;
    if removed > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO favorites (puuid, match_id, kind, round_index) VALUES (?1, ?2, ?3, ?4)",
        params![puuid, match_id, kind, round],
    )?;
    Ok(true)
}

pub fn entries(conn: &Connection, puuid: &str) -> AppResult<Vec<FavoriteEntry>> {
    let mut stmt = conn.prepare(
        "SELECT f.kind, f.match_id, f.round_index, m.started_at, m.map_name, p.agent_id, p.agent_name, p.won,
                p.rounds_won, p.rounds_lost, p.kills, p.deaths, p.assists, f.created_at
         FROM favorites f
         JOIN matches m ON m.match_id = f.match_id
         JOIN match_players p ON p.match_id = f.match_id AND p.puuid = f.puuid
         WHERE f.puuid = ?1
         ORDER BY f.created_at DESC, m.started_at DESC, f.round_index ASC",
    )?;
    let rows = stmt
        .query_map(params![puuid], |row| {
            let round: i64 = row.get(2)?;
            Ok(FavoriteEntry {
                kind: row.get(0)?,
                match_id: row.get(1)?,
                round_index: (round >= 0).then_some(round),
                started_at: row.get(3)?,
                map_name: row.get(4)?,
                agent_id: row.get(5)?,
                agent_name: row.get(6)?,
                won: row.get(7)?,
                rounds_won: row.get(8)?,
                rounds_lost: row.get(9)?,
                kills: row.get(10)?,
                deaths: row.get(11)?,
                assists: row.get(12)?,
                created_at: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command(async)]
pub fn toggle_favorite(
    state: State<'_, AppState>,
    puuid: String,
    match_id: String,
    kind: String,
    round_index: Option<i64>,
) -> AppResult<Vec<FavoriteEntry>> {
    let list = {
        let conn = state.conn()?;
        toggle(&conn, &puuid, &match_id, &kind, round_index)?;
        entries(&conn, &puuid)?
    };
    state.forget(Report::is_journal);
    Ok(list)
}

#[tauri::command(async)]
pub fn list_favorites(state: State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    Report::Favorites.serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute(
            "INSERT INTO matches (match_id, started_at, map_name, queue, rounds, raw) VALUES ('m1', '2026-01-01T20:00:00Z', 'Ascent', 'competitive', 22, '')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO match_players (match_id, puuid, kills, deaths, assists, won, rounds_won, rounds_lost) VALUES ('m1', 'me', 20, 15, 4, 1, 13, 9)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn toggles_each_kind_independently() {
        let conn = setup();
        assert!(toggle(&conn, "me", "m1", "match", None).unwrap());
        assert!(toggle(&conn, "me", "m1", "round", Some(4)).unwrap());
        assert!(toggle(&conn, "me", "m1", "death", Some(4)).unwrap());
        let list = entries(&conn, "me").unwrap();
        assert_eq!(list.len(), 3);
        assert!(list.iter().any(|entry| entry.kind == "match" && entry.round_index.is_none()));
        assert!(!toggle(&conn, "me", "m1", "round", Some(4)).unwrap());
        assert_eq!(entries(&conn, "me").unwrap().len(), 2);
    }

    #[test]
    fn rejects_invalid_favorites() {
        let conn = setup();
        assert!(toggle(&conn, "me", "m1", "round", None).is_err());
        assert!(toggle(&conn, "me", "m1", "clip", Some(1)).is_err());
        assert!(toggle(&conn, "me", "absent", "match", None).is_err());
    }
}
