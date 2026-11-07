use rusqlite::{Connection, OptionalExtension, params};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db;
use crate::error::AppResult;
use crate::i18n::{decimal, english, tr};

pub const NOTIFY_SETTING: &str = "notify_matches";

pub fn enabled(conn: &Connection) -> AppResult<bool> {
    Ok(db::get_setting(conn, NOTIFY_SETTING)?.as_deref() != Some("false"))
}

pub fn has_matches(conn: &Connection, puuid: &str) -> AppResult<bool> {
    Ok(conn
        .query_row("SELECT 1 FROM match_players WHERE puuid = ?1 LIMIT 1", params![puuid], |_| Ok(()))
        .optional()?
        .is_some())
}

struct Latest {
    map: Option<String>,
    won: bool,
    rounds_won: i64,
    rounds_lost: i64,
    kills: i64,
    deaths: i64,
}

fn latest(conn: &Connection, puuid: &str) -> AppResult<Option<Latest>> {
    Ok(conn
        .query_row(
            "SELECT m.map_name, p.won, p.rounds_won, p.rounds_lost, p.kills, p.deaths
             FROM match_players p
             JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid = ?1 AND m.queue = 'competitive'
             ORDER BY m.started_at DESC
             LIMIT 1",
            params![puuid],
            |row| {
                Ok(Latest {
                    map: row.get(0)?,
                    won: row.get(1)?,
                    rounds_won: row.get(2)?,
                    rounds_lost: row.get(3)?,
                    kills: row.get(4)?,
                    deaths: row.get(5)?,
                })
            },
        )
        .optional()?)
}

fn describe(game: &Latest) -> String {
    let result = if game.won {
        tr("victoire", "win")
    } else if game.rounds_won == game.rounds_lost {
        tr("égalité", "draw")
    } else {
        tr("défaite", "loss")
    };
    let kd = game.kills as f64 / game.deaths.max(1) as f64;
    format!(
        "{}, {result} {}-{}, K/D {}",
        game.map.as_deref().unwrap_or(tr("Map inconnue", "Unknown map")),
        game.rounds_won,
        game.rounds_lost,
        decimal(kd, 2)
    )
}

fn message(count: usize, game: &Latest) -> (String, String) {
    match (count > 1, english()) {
        (true, false) => (format!("{count} nouveaux matchs analysés"), format!("Dernier match : {}", describe(game))),
        (true, true) => (format!("{count} new matches analyzed"), format!("Last match: {}", describe(game))),
        (false, _) => (tr("Nouveau match analysé", "New match analyzed").to_string(), describe(game)),
    }
}

pub fn new_matches(app: &AppHandle, conn: &Connection, puuid: &str, count: usize) -> AppResult<()> {
    if count == 0 || !enabled(conn)? {
        return Ok(());
    }
    let Some(game) = latest(conn, puuid)? else {
        return Ok(());
    };
    let (title, body) = message(count, &game);
    let _ = app.notification().builder().title(title).body(body).show();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(won: bool, rounds_won: i64, rounds_lost: i64, kills: i64, deaths: i64) -> Latest {
        Latest { map: Some("Ascent".into()), won, rounds_won, rounds_lost, kills, deaths }
    }

    #[test]
    fn single_match_message() {
        let (title, body) = message(1, &game(true, 13, 9, 21, 14));
        assert_eq!(title, "Nouveau match analysé");
        assert_eq!(body, "Ascent, victoire 13-9, K/D 1,50");
    }

    #[test]
    fn several_matches_message() {
        let (title, body) = message(3, &game(false, 7, 13, 10, 0));
        assert_eq!(title, "3 nouveaux matchs analysés");
        assert_eq!(body, "Dernier match : Ascent, défaite 7-13, K/D 10,00");
    }

    #[test]
    fn english_messages() {
        crate::i18n::set("en");
        let (title, body) = message(1, &game(true, 13, 9, 21, 14));
        let (several, last) = message(3, &game(false, 7, 13, 10, 0));
        crate::i18n::set("fr");
        assert_eq!(title, "New match analyzed");
        assert_eq!(body, "Ascent, win 13-9, K/D 1.50");
        assert_eq!(several, "3 new matches analyzed");
        assert_eq!(last, "Last match: Ascent, loss 7-13, K/D 10.00");
    }
}
