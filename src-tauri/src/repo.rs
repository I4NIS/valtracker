use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter};
use serde_json::Value;

use crate::error::AppResult;
use crate::models::Account;
use crate::storage;

const ACCOUNT_COLUMNS: &str = "puuid, name, tag, region, platform, account_level, card_id, tier, tier_name, rr, peak_tier, peak_tier_name, peak_season, last_sync_at, rank_state";

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
        rank_state: row.get::<_, Option<String>>(14)?.and_then(|json| serde_json::from_str(&json).ok()),
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
            peak_tier = ?6, peak_tier_name = ?7, peak_season = ?8, rank_state = ?9
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
            crate::ranked::RankState::from_mmr(mmr).and_then(|state| serde_json::to_string(&state).ok()),
        ],
    )?;
    Ok(())
}

pub fn set_last_sync(conn: &Connection, puuid: &str, at: &str) -> AppResult<()> {
    conn.execute("UPDATE accounts SET last_sync_at = ?2 WHERE puuid = ?1", params![puuid, at])?;
    Ok(())
}

const HISTORY_BASE: [&str; 8] = ["date", "season_short", "map_name", "tier", "tier_name", "rr", "last_change", "elo"];

const HISTORY_DETAIL: [&str; 14] = [
    "rr_before_update",
    "tier_before_update",
    "tier_before_update_name",
    "rr_performance_bonus",
    "rr_penalty",
    "afk_penalty",
    "refunded_rr",
    "was_derank_protected",
    "was_derank_protection_replenished",
    "new_map_incentive_rr_forgiven",
    "is_placement_match",
    "match_length",
    "competitive_movement",
    "queue_id",
];

fn history_upsert_sql() -> String {
    let columns: Vec<&str> = HISTORY_BASE.iter().chain(HISTORY_DETAIL.iter()).copied().collect();
    let placeholders: Vec<String> = (1..=columns.len() + 2).map(|index| format!("?{index}")).collect();
    let updates: Vec<String> = HISTORY_BASE
        .iter()
        .map(|column| format!("{column} = excluded.{column}"))
        .chain(HISTORY_DETAIL.iter().map(|column| format!("{column} = COALESCE(excluded.{column}, mmr_history.{column})")))
        .collect();
    let changed: Vec<String> = HISTORY_BASE
        .iter()
        .map(|column| format!("mmr_history.{column} IS NOT excluded.{column}"))
        .chain(
            HISTORY_DETAIL
                .iter()
                .map(|column| format!("(excluded.{column} IS NOT NULL AND mmr_history.{column} IS NOT excluded.{column})")),
        )
        .collect();
    format!(
        "INSERT INTO mmr_history (puuid, match_id, {}) VALUES ({})
         ON CONFLICT(puuid, match_id) DO UPDATE SET {} WHERE {}",
        columns.join(", "),
        placeholders.join(", "),
        updates.join(", "),
        changed.join(" OR "),
    )
}

fn sql_int(value: &Value, pointer: &str) -> SqlValue {
    value.pointer(pointer).and_then(Value::as_i64).map_or(SqlValue::Null, SqlValue::Integer)
}

fn sql_real(value: &Value, pointer: &str) -> SqlValue {
    value.pointer(pointer).and_then(Value::as_f64).map_or(SqlValue::Null, SqlValue::Real)
}

fn sql_text(value: &Value, pointer: &str) -> SqlValue {
    text(value, pointer).map_or(SqlValue::Null, |found| SqlValue::Text(found.to_string()))
}

fn sql_bool(value: &Value, pointer: &str) -> SqlValue {
    value.pointer(pointer).and_then(Value::as_bool).map_or(SqlValue::Null, |flag| SqlValue::Integer(i64::from(flag)))
}

fn history_values(puuid: &str, match_id: &str, entry: &Value) -> Vec<SqlValue> {
    vec![
        SqlValue::Text(puuid.to_string()),
        SqlValue::Text(match_id.to_string()),
        SqlValue::Text(text(entry, "/date").unwrap_or_default().to_string()),
        sql_text(entry, "/season/short"),
        sql_text(entry, "/map/name"),
        sql_int(entry, "/tier/id"),
        sql_text(entry, "/tier/name"),
        sql_int(entry, "/rr"),
        sql_int(entry, "/last_change"),
        sql_int(entry, "/elo"),
        sql_int(entry, "/rr_before_update"),
        sql_int(entry, "/tier_before_update/id"),
        sql_text(entry, "/tier_before_update/name"),
        sql_int(entry, "/rr_performance_bonus"),
        sql_real(entry, "/rr_penalty"),
        sql_int(entry, "/afk_penalty"),
        sql_int(entry, "/refunded_rr"),
        sql_bool(entry, "/was_derank_protected"),
        sql_bool(entry, "/was_derank_protection_replenished"),
        sql_int(entry, "/new_map_incentive_rr_forgiven"),
        sql_bool(entry, "/is_placement_match"),
        sql_int(entry, "/match_length"),
        sql_text(entry, "/competitive_movement"),
        sql_text(entry, "/queue_id"),
    ]
}

pub fn upsert_mmr_history(conn: &mut Connection, puuid: &str, history: &Value) -> AppResult<usize> {
    let Some(entries) = history.as_array() else {
        return Ok(0);
    };
    let tx = conn.transaction()?;
    let mut count = 0;
    {
        let mut stmt = tx.prepare(&history_upsert_sql())?;
        for entry in entries {
            let Some(match_id) = text(entry, "/match_id") else {
                continue;
            };
            count += stmt.execute(params_from_iter(history_values(puuid, match_id, entry)))?;
        }
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

struct PlayerRow {
    puuid: String,
    name: Option<String>,
    tag: Option<String>,
    team: String,
    agent_id: Option<String>,
    agent_name: Option<String>,
    tier: Option<i64>,
    stats: [i64; 9],
    won: bool,
    rounds_won: i64,
    rounds_lost: i64,
}

pub struct PreparedMatch {
    match_id: String,
    started_at: String,
    map_id: Option<String>,
    map_name: Option<String>,
    queue: Option<String>,
    season_id: Option<String>,
    season_short: Option<String>,
    rounds: i64,
    game_length_ms: Option<i64>,
    raw: Vec<u8>,
    players: Vec<PlayerRow>,
}

fn owned(value: &Value, pointer: &str) -> Option<String> {
    text(value, pointer).map(str::to_string)
}

pub fn match_id(game: &Value) -> Option<&str> {
    text(game, "/metadata/match_id")
}

pub fn has_match(conn: &Connection, match_id: &str) -> AppResult<bool> {
    Ok(conn.query_row("SELECT 1 FROM matches WHERE match_id = ?1", params![match_id], |_| Ok(())).optional()?.is_some())
}

pub fn prepare_match(game: Value) -> AppResult<Option<PreparedMatch>> {
    let Some(match_id) = owned(&game, "/metadata/match_id") else {
        return Ok(None);
    };
    let rounds = game.pointer("/rounds").and_then(Value::as_array).map_or(0, Vec::len) as i64;
    if rounds == 0 || text(&game, "/metadata/queue/id") != Some("competitive") {
        return Ok(None);
    }
    let empty = Vec::new();
    let teams = game.pointer("/teams").and_then(Value::as_array).unwrap_or(&empty);
    let players = game
        .pointer("/players")
        .and_then(Value::as_array)
        .unwrap_or(&empty)
        .iter()
        .map(|player| {
            let team_id = text(player, "/team_id").unwrap_or_default();
            let team = teams.iter().find(|team| text(team, "/team_id") == Some(team_id));
            PlayerRow {
                puuid: text(player, "/puuid").unwrap_or_default().to_string(),
                name: owned(player, "/name"),
                tag: owned(player, "/tag"),
                team: team_id.to_string(),
                agent_id: owned(player, "/agent/id"),
                agent_name: owned(player, "/agent/name"),
                tier: player.pointer("/tier/id").and_then(Value::as_i64),
                stats: [
                    int(player, "/stats/score"),
                    int(player, "/stats/kills"),
                    int(player, "/stats/deaths"),
                    int(player, "/stats/assists"),
                    int(player, "/stats/headshots"),
                    int(player, "/stats/bodyshots"),
                    int(player, "/stats/legshots"),
                    int(player, "/stats/damage/dealt"),
                    int(player, "/stats/damage/received"),
                ],
                won: team.and_then(|team| team.pointer("/won")).and_then(Value::as_bool).unwrap_or(false),
                rounds_won: team.map_or(0, |team| int(team, "/rounds/won")),
                rounds_lost: team.map_or(0, |team| int(team, "/rounds/lost")),
            }
        })
        .collect();
    let started_at = text(&game, "/metadata/started_at").unwrap_or_default().to_string();
    let map_id = owned(&game, "/metadata/map/id");
    let map_name = owned(&game, "/metadata/map/name");
    let queue = owned(&game, "/metadata/queue/id");
    let season_id = owned(&game, "/metadata/season/id");
    let season_short = owned(&game, "/metadata/season/short");
    let game_length_ms = game.pointer("/metadata/game_length_in_ms").and_then(Value::as_i64);
    Ok(Some(PreparedMatch {
        match_id,
        started_at,
        map_id,
        map_name,
        queue,
        season_id,
        season_short,
        rounds,
        game_length_ms,
        raw: storage::encode(game)?,
        players,
    }))
}

pub fn insert_prepared(conn: &Connection, game: &PreparedMatch) -> AppResult<bool> {
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO matches
            (match_id, started_at, map_id, map_name, queue, season_id, season_short, rounds, game_length_ms, raw)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            game.match_id,
            game.started_at,
            game.map_id,
            game.map_name,
            game.queue,
            game.season_id,
            game.season_short,
            game.rounds,
            game.game_length_ms,
            game.raw,
        ],
    )?;
    if inserted == 0 {
        return Ok(false);
    }
    let mut stmt = conn.prepare_cached(
        "INSERT OR REPLACE INTO match_players
            (match_id, puuid, name, tag, team, agent_id, agent_name, tier, score, kills, deaths, assists,
             headshots, bodyshots, legshots, damage_dealt, damage_received, won, rounds_won, rounds_lost)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
    )?;
    for player in &game.players {
        let [score, kills, deaths, assists, headshots, bodyshots, legshots, dealt, received] = player.stats;
        stmt.execute(params![
            game.match_id,
            player.puuid,
            player.name,
            player.tag,
            player.team,
            player.agent_id,
            player.agent_name,
            player.tier,
            score,
            kills,
            deaths,
            assists,
            headshots,
            bodyshots,
            legshots,
            dealt,
            received,
            player.won,
            player.rounds_won,
            player.rounds_lost,
        ])?;
    }
    Ok(true)
}

pub fn insert_all(conn: &mut Connection, games: &[PreparedMatch]) -> AppResult<usize> {
    let tx = conn.transaction()?;
    let mut added = 0;
    for game in games {
        if insert_prepared(&tx, game)? {
            added += 1;
        }
    }
    tx.commit()?;
    Ok(added)
}

#[cfg(test)]
pub fn insert_match(conn: &mut Connection, game: Value) -> AppResult<bool> {
    let Some(game) = prepare_match(game)? else {
        return Ok(false);
    };
    Ok(insert_all(conn, std::slice::from_ref(&game))? == 1)
}
