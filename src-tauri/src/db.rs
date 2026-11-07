use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &["
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE accounts (
    puuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    region TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'pc',
    account_level INTEGER,
    card_id TEXT,
    tier INTEGER,
    tier_name TEXT,
    rr INTEGER,
    elo INTEGER,
    peak_tier INTEGER,
    peak_tier_name TEXT,
    peak_season TEXT,
    last_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE matches (
    match_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    map_id TEXT,
    map_name TEXT,
    queue TEXT,
    season_id TEXT,
    season_short TEXT,
    rounds INTEGER NOT NULL,
    game_length_ms INTEGER,
    raw TEXT NOT NULL
);

CREATE TABLE match_players (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    puuid TEXT NOT NULL,
    name TEXT,
    tag TEXT,
    team TEXT,
    agent_id TEXT,
    agent_name TEXT,
    tier INTEGER,
    score INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    headshots INTEGER NOT NULL DEFAULT 0,
    bodyshots INTEGER NOT NULL DEFAULT 0,
    legshots INTEGER NOT NULL DEFAULT 0,
    damage_dealt INTEGER NOT NULL DEFAULT 0,
    damage_received INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL DEFAULT 0,
    rounds_won INTEGER NOT NULL DEFAULT 0,
    rounds_lost INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, puuid)
);

CREATE INDEX idx_match_players_puuid ON match_players(puuid);
CREATE INDEX idx_matches_started_at ON matches(started_at);

CREATE TABLE mmr_history (
    puuid TEXT NOT NULL,
    match_id TEXT NOT NULL,
    date TEXT NOT NULL,
    season_short TEXT,
    map_name TEXT,
    tier INTEGER,
    tier_name TEXT,
    rr INTEGER,
    last_change INTEGER,
    elo INTEGER,
    PRIMARY KEY (puuid, match_id)
);
", "
CREATE TABLE maps (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    display_icon TEXT,
    x_multiplier REAL NOT NULL,
    y_multiplier REAL NOT NULL,
    x_scalar REAL NOT NULL,
    y_scalar REAL NOT NULL,
    callouts TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE agents (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    icon TEXT
);
", "
CREATE TABLE match_summaries (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    puuid TEXT NOT NULL,
    score INTEGER NOT NULL,
    place INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    traded INTEGER NOT NULL,
    first_deaths INTEGER NOT NULL,
    isolated INTEGER NOT NULL,
    PRIMARY KEY (match_id, puuid)
);
", "
ALTER TABLE maps ADD COLUMN splash TEXT;
ALTER TABLE maps ADD COLUMN list_icon TEXT;
", "
CREATE TABLE unavailable_matches (
    match_id TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
", "
DELETE FROM matches WHERE queue IS NOT 'competitive';
"];

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        conn.execute_batch(sql)?;
        conn.pragma_update(None, "user_version", (index + 1) as i64)?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
