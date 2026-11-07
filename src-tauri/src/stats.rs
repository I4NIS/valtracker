use rusqlite::{Connection, params};

use crate::error::AppResult;
use crate::models::{LobbyAverages, Overview, RecentMatch, Season};

const COMPETITIVE: &str = "competitive";

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

pub fn overview(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Overview> {
    let row = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(p.won), 0), COALESCE(SUM(m.rounds), 0),
                COALESCE(SUM(p.kills), 0), COALESCE(SUM(p.deaths), 0), COALESCE(SUM(p.assists), 0),
                COALESCE(SUM(p.score), 0), COALESCE(SUM(p.damage_dealt), 0),
                COALESCE(SUM(p.headshots), 0), COALESCE(SUM(p.headshots + p.bodyshots + p.legshots), 0)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
        params![puuid, COMPETITIVE, season],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
            ))
        },
    )?;
    let (matches, wins, rounds, kills, deaths, assists, score, damage, headshots, shots) = row;
    Ok(Overview {
        matches,
        wins,
        losses: matches - wins,
        rounds,
        kills,
        deaths,
        assists,
        acs: ratio(score as f64, rounds as f64),
        adr: ratio(damage as f64, rounds as f64),
        kd: ratio(kills as f64, deaths as f64),
        kad: ratio((kills + assists) as f64, deaths as f64),
        hs_pct: ratio(headshots as f64 * 100.0, shots as f64),
        win_pct: ratio(wins as f64 * 100.0, matches as f64),
        kills_per_round: ratio(kills as f64, rounds as f64),
        lobby: lobby(conn, puuid, season)?,
    })
}

fn lobby(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<LobbyAverages> {
    Ok(conn.query_row(
        "SELECT COALESCE(AVG(o.score * 1.0 / m.rounds), 0),
                COALESCE(AVG(o.damage_dealt * 1.0 / m.rounds), 0),
                COALESCE(SUM(o.kills) * 1.0 / NULLIF(SUM(o.deaths), 0), 0),
                COALESCE(SUM(o.headshots) * 100.0 / NULLIF(SUM(o.headshots + o.bodyshots + o.legshots), 0), 0)
         FROM match_players me
         JOIN matches m ON m.match_id = me.match_id
         JOIN match_players o ON o.match_id = me.match_id AND o.puuid <> me.puuid
         WHERE me.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
        params![puuid, COMPETITIVE, season],
        |row| Ok(LobbyAverages { acs: row.get(0)?, adr: row.get(1)?, kd: row.get(2)?, hs_pct: row.get(3)? }),
    )?)
}

pub fn recent_matches(conn: &Connection, puuid: &str, limit: i64, offset: i64) -> AppResult<Vec<RecentMatch>> {
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.map_name, m.queue, p.agent_id, p.agent_name,
                p.kills, p.deaths, p.assists, p.score * 1.0 / m.rounds, p.won, p.rounds_won, p.rounds_lost,
                (SELECT COUNT(*) + 1 FROM match_players q WHERE q.match_id = p.match_id AND q.score > p.score)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?4
         ORDER BY m.started_at DESC
         LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt
        .query_map(params![puuid, limit, offset, COMPETITIVE], |row| {
            Ok(RecentMatch {
                match_id: row.get(0)?,
                started_at: row.get(1)?,
                map_name: row.get(2)?,
                queue: row.get(3)?,
                agent_id: row.get(4)?,
                agent_name: row.get(5)?,
                kills: row.get(6)?,
                deaths: row.get(7)?,
                assists: row.get(8)?,
                acs: row.get(9)?,
                won: row.get(10)?,
                rounds_won: row.get(11)?,
                rounds_lost: row.get(12)?,
                place: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn seasons(conn: &Connection, puuid: &str) -> AppResult<Vec<Season>> {
    let mut stmt = conn.prepare(
        "SELECT m.season_short, COUNT(*)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND m.season_short IS NOT NULL
         GROUP BY m.season_short
         ORDER BY MAX(m.started_at) DESC",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE], |row| Ok(Season { short: row.get(0)?, matches: row.get(1)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
