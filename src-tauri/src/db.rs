use rusqlite::{Connection, OpenFlags, OptionalExtension, params};
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
", "
CREATE TABLE match_notes (
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (match_id, puuid)
);
", "
CREATE TABLE favorites (
    puuid TEXT NOT NULL,
    match_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('match', 'round', 'death')),
    round_index INTEGER NOT NULL DEFAULT -1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (puuid, match_id, kind, round_index)
);
", "
CREATE INDEX IF NOT EXISTS idx_match_summaries_puuid ON match_summaries(puuid);
CREATE INDEX IF NOT EXISTS idx_match_notes_puuid ON match_notes(puuid);
", "
CREATE TABLE match_players_compact (
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
) WITHOUT ROWID;
INSERT INTO match_players_compact
    SELECT match_id, puuid, name, tag, team, agent_id, agent_name, tier, score, kills, deaths, assists,
           headshots, bodyshots, legshots, damage_dealt, damage_received, won, rounds_won, rounds_lost
    FROM match_players WHERE match_id IN (SELECT match_id FROM matches);
DROP TABLE match_players;
ALTER TABLE match_players_compact RENAME TO match_players;
CREATE INDEX idx_match_players_puuid ON match_players(puuid);

CREATE TABLE mmr_history_compact (
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
) WITHOUT ROWID;
INSERT INTO mmr_history_compact
    SELECT puuid, match_id, date, season_short, map_name, tier, tier_name, rr, last_change, elo FROM mmr_history;
DROP TABLE mmr_history;
ALTER TABLE mmr_history_compact RENAME TO mmr_history;

CREATE TABLE match_summaries_compact (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    puuid TEXT NOT NULL,
    score INTEGER NOT NULL,
    place INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    traded INTEGER NOT NULL,
    first_deaths INTEGER NOT NULL,
    isolated INTEGER NOT NULL,
    PRIMARY KEY (match_id, puuid)
) WITHOUT ROWID;
INSERT INTO match_summaries_compact
    SELECT match_id, puuid, score, place, deaths, traded, first_deaths, isolated
    FROM match_summaries WHERE match_id IN (SELECT match_id FROM matches);
DROP TABLE match_summaries;
ALTER TABLE match_summaries_compact RENAME TO match_summaries;
CREATE INDEX idx_match_summaries_puuid ON match_summaries(puuid);

CREATE TABLE unavailable_matches_compact (
    match_id TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;
INSERT INTO unavailable_matches_compact
    SELECT match_id, checked_at FROM unavailable_matches WHERE match_id IS NOT NULL;
DROP TABLE unavailable_matches;
ALTER TABLE unavailable_matches_compact RENAME TO unavailable_matches;
", "
ALTER TABLE mmr_history ADD COLUMN rr_before_update INTEGER;
ALTER TABLE mmr_history ADD COLUMN tier_before_update INTEGER;
ALTER TABLE mmr_history ADD COLUMN tier_before_update_name TEXT;
ALTER TABLE mmr_history ADD COLUMN rr_performance_bonus INTEGER;
ALTER TABLE mmr_history ADD COLUMN rr_penalty REAL;
ALTER TABLE mmr_history ADD COLUMN afk_penalty INTEGER;
ALTER TABLE mmr_history ADD COLUMN refunded_rr INTEGER;
ALTER TABLE mmr_history ADD COLUMN was_derank_protected INTEGER;
ALTER TABLE mmr_history ADD COLUMN was_derank_protection_replenished INTEGER;
ALTER TABLE mmr_history ADD COLUMN new_map_incentive_rr_forgiven INTEGER;
ALTER TABLE mmr_history ADD COLUMN is_placement_match INTEGER;
ALTER TABLE mmr_history ADD COLUMN match_length INTEGER;
ALTER TABLE mmr_history ADD COLUMN competitive_movement TEXT;
ALTER TABLE mmr_history ADD COLUMN queue_id TEXT;
ALTER TABLE accounts ADD COLUMN rank_state TEXT;

CREATE TABLE account_seasons (
    puuid TEXT NOT NULL REFERENCES accounts(puuid) ON DELETE CASCADE,
    season_id TEXT NOT NULL,
    season_short TEXT,
    position INTEGER NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    end_tier INTEGER,
    end_tier_name TEXT,
    end_rr INTEGER,
    ranking_schema TEXT,
    act_rank_tier INTEGER,
    act_rank_name TEXT,
    act_wins TEXT NOT NULL DEFAULT '[]',
    leaderboard_rank INTEGER,
    prestige TEXT,
    PRIMARY KEY (puuid, season_id)
) WITHOUT ROWID;

CREATE TABLE career_cache (
    puuid TEXT NOT NULL REFERENCES accounts(puuid) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    body TEXT,
    PRIMARY KEY (puuid, kind)
) WITHOUT ROWID;

CREATE TABLE match_accolades (
    puuid TEXT NOT NULL REFERENCES accounts(puuid) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    accolade TEXT NOT NULL,
    kind TEXT,
    value REAL NOT NULL,
    act_record INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (puuid, match_id, accolade)
) WITHOUT ROWID;
"];

const REBUILT_AT: i64 = 10;

const WAL_LIMIT: &str = "PRAGMA journal_size_limit = 4194304;";

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(&format!("PRAGMA journal_mode = WAL; {WAL_LIMIT} PRAGMA foreign_keys = ON;"))?;
    let before = version(&conn)?;
    migrate(&conn)?;
    if before < REBUILT_AT && version(&conn)? >= REBUILT_AT {
        checkpoint(&conn)?;
    }
    Ok(conn)
}

fn version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

pub fn open_reader(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    conn.execute_batch(&format!("{WAL_LIMIT} PRAGMA foreign_keys = ON;"))?;
    Ok(conn)
}

pub fn checkpoint(conn: &Connection) -> AppResult<()> {
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
    Ok(())
}

pub fn schema_version() -> i64 {
    MIGRATIONS.len() as i64
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    migrate_to(conn, schema_version())
}

pub fn migrate_to(conn: &Connection, target: i64) -> AppResult<()> {
    let current = version(conn)?;
    for (index, sql) in MIGRATIONS.iter().enumerate().take(target.max(0) as usize).skip(current.max(0) as usize) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (index + 1) as i64)?;
        tx.commit()?;
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

#[cfg(test)]
pub mod tests {
    use super::*;

    const ROWS: &str = "
        SELECT 'p', (SELECT group_concat(match_id || puuid || coalesce(name, '-') || coalesce(tier, '-') || score || kills || deaths || won || rounds_lost, ',') FROM (SELECT * FROM match_players ORDER BY match_id, puuid))
        UNION ALL SELECT 'h', (SELECT group_concat(puuid || match_id || date || coalesce(season_short, '-') || coalesce(rr, '-') || coalesce(elo, '-'), ',') FROM (SELECT * FROM mmr_history ORDER BY puuid, match_id))
        UNION ALL SELECT 's', (SELECT group_concat(match_id || puuid || score || place || isolated, ',') FROM (SELECT * FROM match_summaries ORDER BY match_id, puuid))
        UNION ALL SELECT 'u', (SELECT group_concat(match_id || checked_at, ',') FROM (SELECT * FROM unavailable_matches ORDER BY match_id))";

    pub fn fill_version_9(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO matches (match_id, started_at, rounds, raw) VALUES ('m1', '2026-01-01', 20, x'7b7d'), ('m2', '2026-01-02', 22, x'7b7d');
             INSERT INTO match_players (match_id, puuid, name, tier, score, kills, deaths, won, rounds_won, rounds_lost)
                VALUES ('m1', 'me', 'Moi', 12, 4000, 20, 10, 1, 13, 7), ('m1', 'foe', NULL, NULL, 3000, 10, 20, 0, 7, 13), ('m2', 'me', 'Moi', 12, 3500, 15, 15, 0, 9, 13);
             INSERT INTO mmr_history (puuid, match_id, date, season_short, tier, rr, last_change, elo)
                VALUES ('me', 'm1', '2026-01-01', 'e1', 12, 40, 18, 1240), ('me', 'gone', '2025-12-31', NULL, NULL, NULL, NULL, NULL);
             INSERT INTO match_summaries (match_id, puuid, score, place, deaths, traded, first_deaths, isolated)
                VALUES ('m1', 'me', 70, 2, 10, 4, 1, 3), ('m2', 'me', 40, 6, 15, 2, 3, 5);
             INSERT INTO unavailable_matches (match_id, checked_at) VALUES ('gone', '2026-01-03 10:00:00');",
        )
        .unwrap();
    }

    fn rows(conn: &Connection) -> Vec<(String, Option<String>)> {
        let mut stmt = conn.prepare(ROWS).unwrap();
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap()
    }

    pub fn assert_compact(conn: &Connection) {
        for table in ["match_players", "mmr_history", "match_summaries", "unavailable_matches"] {
            let sql: String = conn.query_row("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1", [table], |row| row.get(0)).unwrap();
            assert!(sql.ends_with("WITHOUT ROWID"), "{table}: {sql}");
        }
        for index in ["idx_match_players_puuid", "idx_match_summaries_puuid"] {
            let found: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?1", [index], |row| row.get(0)).unwrap();
            assert_eq!(found, 1, "{index}");
        }
        let parent: String = conn.query_row("SELECT \"table\" FROM pragma_foreign_key_list('match_players')", [], |row| row.get(0)).unwrap();
        assert_eq!(parent, "matches");
        let filled = rows(conn).iter().filter(|(_, values)| values.is_some()).count();
        assert_eq!(filled, 4);
    }

    #[test]
    fn rebuilds_tables_without_rowid_and_keeps_every_row() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate_to(&conn, REBUILT_AT - 1).unwrap();
        fill_version_9(&conn);
        let before = rows(&conn);
        migrate(&conn).unwrap();
        assert_eq!(rows(&conn), before);
        assert_compact(&conn);
        conn.execute("DELETE FROM matches WHERE match_id = 'm1'", []).unwrap();
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM match_players", [], |row| row.get(0)).unwrap();
        assert_eq!(left, 1);
        let found: i64 = conn.query_row("SELECT COUNT(*) FROM match_players WHERE puuid = 'me'", [], |row| row.get(0)).unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn migrates_the_same_way_twice() {
        let schema = |conn: &Connection| -> Vec<String> {
            let mut stmt = conn.prepare("SELECT type || name || coalesce(sql, '') FROM sqlite_master ORDER BY name").unwrap();
            stmt.query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        let fresh = Connection::open_in_memory().unwrap();
        migrate(&fresh).unwrap();
        let upgraded = Connection::open_in_memory().unwrap();
        migrate_to(&upgraded, REBUILT_AT - 1).unwrap();
        fill_version_9(&upgraded);
        migrate(&upgraded).unwrap();
        assert_eq!(schema(&fresh), schema(&upgraded));
    }
}
