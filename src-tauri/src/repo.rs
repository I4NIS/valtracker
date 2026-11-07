use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::Value;

use crate::error::AppResult;
use crate::models::Account;
use crate::storage;

const ACCOUNT_COLUMNS: &str = "puuid, name, tag, region, platform, account_level, card_id, tier, tier_name, rr, peak_tier, peak_tier_name, peak_season, last_sync_at";

fn text<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn int(value: &Value, pointer: &str) -> i64 {
    value.pointer(pointer).and_then(Value::as_i64).unwrap_or(0)
}

fn account_from_row(row: &Row) -> rusqlite::Result<Account> {
    Ok(Account {
        puuid: row.get(0)?,
        name: row.get(1)?,
        tag: row.get(2)?,
        region: row.get(3)?,
        platform: row.get(4)?,
        account_level: row.get(5)?,
        card_id: row.get(6)?,
        tier: row.get(7)?,
        tier_name: row.get(8)?,
        rr: row.get(9)?,
        peak_tier: row.get(10)?,
        peak_tier_name: row.get(11)?,
        peak_season: row.get(12)?,
        last_sync_at: row.get(13)?,
    })
}

pub fn list_accounts(conn: &Connection) -> AppResult<Vec<Account>> {
    let mut stmt = conn.prepare(&format!("SELECT {ACCOUNT_COLUMNS} FROM accounts ORDER BY created_at"))?;
    let accounts = stmt.query_map([], account_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(accounts)
}

pub fn get_account(conn: &Connection, puuid: &str) -> AppResult<Option<Account>> {
    Ok(conn
        .query_row(
            &format!("SELECT {ACCOUNT_COLUMNS} FROM accounts WHERE puuid = ?1"),
            params![puuid],
            account_from_row,
        )
        .optional()?)
}

pub fn upsert_account(conn: &Connection, data: &Value, region: &str) -> AppResult<Option<String>> {
    let Some(puuid) = text(data, "/puuid") else {
        return Ok(None);
    };
    conn.execute(
        "INSERT INTO accounts (puuid, name, tag, region, account_level, card_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(puuid) DO UPDATE SET
            name = excluded.name,
            tag = excluded.tag,
            region = excluded.region,
            account_level = excluded.account_level,
            card_id = excluded.card_id",
        params![
            puuid,
            text(data, "/name").unwrap_or_default(),
            text(data, "/tag").unwrap_or_default(),
            region,
            data.pointer("/account_level").and_then(Value::as_i64),
            text(data, "/card"),
        ],
    )?;
    Ok(Some(puuid.to_string()))
}

pub fn delete_account(conn: &Connection, puuid: &str) -> AppResult<()> {
    conn.execute("DELETE FROM accounts WHERE puuid = ?1", params![puuid])?;
    Ok(())
}

pub fn update_rank(conn: &Connection, puuid: &str, mmr: &Value) -> AppResult<()> {
    conn.execute(
        "UPDATE accounts SET tier = ?2, tier_name = ?3, rr = ?4, elo = ?5,
            peak_tier = ?6, peak_tier_name = ?7, peak_season = ?8
         WHERE puuid = ?1",
        params![
            puuid,
            mmr.pointer("/current/tier/id").and_then(Value::as_i64),
            text(mmr, "/current/tier/name"),
            mmr.pointer("/current/rr").and_then(Value::as_i64),
            mmr.pointer("/current/elo").and_then(Value::as_i64),
            mmr.pointer("/peak/tier/id").and_then(Value::as_i64),
            text(mmr, "/peak/tier/name"),
            text(mmr, "/peak/season/short"),
        ],
    )?;
    Ok(())
}

pub fn set_last_sync(conn: &Connection, puuid: &str, at: &str) -> AppResult<()> {
    conn.execute("UPDATE accounts SET last_sync_at = ?2 WHERE puuid = ?1", params![puuid, at])?;
    Ok(())
}

pub fn upsert_mmr_history(conn: &mut Connection, puuid: &str, history: &Value) -> AppResult<usize> {
    let Some(entries) = history.as_array() else {
        return Ok(0);
    };
    let tx = conn.transaction()?;
    let mut count = 0;
    for entry in entries {
        let Some(match_id) = text(entry, "/match_id") else {
            continue;
        };
        count += tx.execute(
            "INSERT OR REPLACE INTO mmr_history
                (puuid, match_id, date, season_short, map_name, tier, tier_name, rr, last_change, elo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                puuid,
                match_id,
                text(entry, "/date").unwrap_or_default(),
                text(entry, "/season/short"),
                text(entry, "/map/name"),
                entry.pointer("/tier/id").and_then(Value::as_i64),
                text(entry, "/tier/name"),
                entry.pointer("/rr").and_then(Value::as_i64),
                entry.pointer("/last_change").and_then(Value::as_i64),
                entry.pointer("/elo").and_then(Value::as_i64),
            ],
        )?;
    }
    tx.commit()?;
    Ok(count)
}

pub fn missing_history_matches(conn: &Connection, puuid: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT h.match_id FROM mmr_history h
         WHERE h.puuid = ?1
           AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.match_id = h.match_id)
           AND NOT EXISTS (SELECT 1 FROM unavailable_matches u WHERE u.match_id = h.match_id)
         ORDER BY h.date DESC",
    )?;
    let ids = stmt.query_map(params![puuid], |row| row.get(0))?.collect::<Result<Vec<String>, _>>()?;
    Ok(ids)
}

pub fn mark_unavailable(conn: &Connection, match_id: &str) -> AppResult<()> {
    conn.execute("INSERT OR IGNORE INTO unavailable_matches (match_id) VALUES (?1)", params![match_id])?;
    Ok(())
}

pub fn insert_match(conn: &mut Connection, game: &Value) -> AppResult<bool> {
    let Some(match_id) = text(game, "/metadata/match_id") else {
        return Ok(false);
    };
    let rounds = game.pointer("/rounds").and_then(Value::as_array).map_or(0, Vec::len) as i64;
    if rounds == 0 {
        return Ok(false);
    }
    let tx = conn.transaction()?;
    let inserted = tx.execute(
        "INSERT OR IGNORE INTO matches
            (match_id, started_at, map_id, map_name, queue, season_id, season_short, rounds, game_length_ms, raw)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            match_id,
            text(game, "/metadata/started_at").unwrap_or_default(),
            text(game, "/metadata/map/id"),
            text(game, "/metadata/map/name"),
            text(game, "/metadata/queue/id"),
            text(game, "/metadata/season/id"),
            text(game, "/metadata/season/short"),
            rounds,
            game.pointer("/metadata/game_length_in_ms").and_then(Value::as_i64),
            storage::encode(game)?,
        ],
    )?;
    if inserted == 0 {
        return Ok(false);
    }
    let empty = Vec::new();
    let teams = game.pointer("/teams").and_then(Value::as_array).unwrap_or(&empty);
    for player in game.pointer("/players").and_then(Value::as_array).unwrap_or(&empty) {
        let team_id = text(player, "/team_id").unwrap_or_default();
        let team = teams.iter().find(|team| text(team, "/team_id") == Some(team_id));
        tx.execute(
            "INSERT OR REPLACE INTO match_players
                (match_id, puuid, name, tag, team, agent_id, agent_name, tier, score, kills, deaths, assists,
                 headshots, bodyshots, legshots, damage_dealt, damage_received, won, rounds_won, rounds_lost)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                match_id,
                text(player, "/puuid").unwrap_or_default(),
                text(player, "/name"),
                text(player, "/tag"),
                team_id,
                text(player, "/agent/id"),
                text(player, "/agent/name"),
                player.pointer("/tier/id").and_then(Value::as_i64),
                int(player, "/stats/score"),
                int(player, "/stats/kills"),
                int(player, "/stats/deaths"),
                int(player, "/stats/assists"),
                int(player, "/stats/headshots"),
                int(player, "/stats/bodyshots"),
                int(player, "/stats/legshots"),
                int(player, "/stats/damage/dealt"),
                int(player, "/stats/damage/received"),
                team.and_then(|team| team.pointer("/won")).and_then(Value::as_bool).unwrap_or(false),
                team.map_or(0, |team| int(team, "/rounds/won")),
                team.map_or(0, |team| int(team, "/rounds/lost")),
            ],
        )?;
    }
    tx.commit()?;
    Ok(true)
}
