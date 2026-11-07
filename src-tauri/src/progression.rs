use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::analysis::{self, ISOLATION_METERS};
use crate::assets;
use crate::error::AppResult;
use crate::stats;

const COMPETITIVE: &str = "competitive";
const RECENT_MATCHES: i64 = 20;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RrPoint {
    pub date: String,
    pub tier: Option<i64>,
    pub tier_name: Option<String>,
    pub rr: Option<i64>,
    pub change: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub match_id: String,
    pub started_at: String,
    pub map_name: Option<String>,
    pub agent_id: Option<String>,
    pub won: bool,
    pub rounds: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub hs_pct: f64,
    pub score: i64,
    pub place: i64,
    pub traded: i64,
    pub first_deaths: i64,
    pub isolated: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progression {
    pub rr: Vec<RrPoint>,
    pub games: Vec<GameSummary>,
    pub lobby_acs: f64,
    pub lobby_hs_pct: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFlaws {
    pub matches: i64,
    pub rounds: i64,
    pub deaths: i64,
    pub untraded: i64,
    pub isolated: i64,
    pub first_deaths: i64,
}

struct Summary {
    score: i64,
    place: i64,
    traded: i64,
    first_deaths: i64,
    isolated: i64,
}

fn summary(conn: &Connection, roles: &HashMap<String, String>, puuid: &str, match_id: &str) -> AppResult<Option<Summary>> {
    let cached = conn
        .query_row(
            "SELECT score, place, traded, first_deaths, isolated FROM match_summaries WHERE match_id = ?1 AND puuid = ?2",
            params![match_id, puuid],
            |row| {
                Ok(Summary {
                    score: row.get(0)?,
                    place: row.get(1)?,
                    traded: row.get(2)?,
                    first_deaths: row.get(3)?,
                    isolated: row.get(4)?,
                })
            },
        )
        .optional()?;
    if cached.is_some() {
        return Ok(cached);
    }
    let raw: Option<String> = conn
        .query_row("SELECT raw FROM matches WHERE match_id = ?1", params![match_id], |row| row.get(0))
        .optional()?;
    let Some(game) = raw.and_then(|raw| serde_json::from_str::<Value>(&raw).ok()) else {
        return Ok(None);
    };
    let Some(detail) = analysis::analyze(&game, puuid, None, roles) else {
        return Ok(None);
    };
    let deaths = &detail.death_reviews;
    let result = Summary {
        score: detail.score,
        place: detail.place as i64,
        traded: deaths.iter().filter(|death| death.traded).count() as i64,
        first_deaths: deaths.iter().filter(|death| death.first_death).count() as i64,
        isolated: deaths
            .iter()
            .filter(|death| death.nearest_ally_m.is_some_and(|meters| meters > ISOLATION_METERS))
            .count() as i64,
    };
    if !roles.is_empty() {
        conn.execute(
            "INSERT OR REPLACE INTO match_summaries (match_id, puuid, score, place, deaths, traded, first_deaths, isolated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                match_id,
                puuid,
                result.score,
                result.place,
                deaths.len() as i64,
                result.traded,
                result.first_deaths,
                result.isolated
            ],
        )?;
    }
    Ok(Some(result))
}

pub fn games(conn: &Connection, puuid: &str, season: Option<&str>, limit: Option<i64>) -> AppResult<Vec<GameSummary>> {
    let roles = assets::agent_roles(conn)?;
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.map_name, p.agent_id, p.won, m.rounds, p.kills, p.deaths, p.assists,
                p.score, p.headshots, p.headshots + p.bodyshots + p.legshots
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
         ORDER BY m.started_at DESC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE, season, limit.unwrap_or(-1)], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, bool>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, i64>(11)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut games = Vec::with_capacity(rows.len());
    for (match_id, started_at, map_name, agent_id, won, rounds, kills, deaths, assists, score, headshots, shots) in rows {
        let analysis = summary(conn, &roles, puuid, &match_id)?;
        games.push(GameSummary {
            started_at,
            map_name,
            agent_id,
            won,
            rounds,
            kills,
            deaths,
            assists,
            acs: if rounds > 0 { score as f64 / rounds as f64 } else { 0.0 },
            hs_pct: if shots > 0 { headshots as f64 * 100.0 / shots as f64 } else { 0.0 },
            score: analysis.as_ref().map_or(0, |s| s.score),
            place: analysis.as_ref().map_or(0, |s| s.place),
            traded: analysis.as_ref().map_or(0, |s| s.traded),
            first_deaths: analysis.as_ref().map_or(0, |s| s.first_deaths),
            isolated: analysis.as_ref().map_or(0, |s| s.isolated),
            match_id,
        });
    }
    games.reverse();
    Ok(games)
}

pub fn rr_history(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Vec<RrPoint>> {
    let mut stmt = conn.prepare(
        "SELECT date, tier, tier_name, rr, last_change FROM mmr_history
         WHERE puuid = ?1 AND (?2 IS NULL OR season_short = ?2)
         ORDER BY date ASC",
    )?;
    let points = stmt
        .query_map(params![puuid, season], |row| {
            Ok(RrPoint { date: row.get(0)?, tier: row.get(1)?, tier_name: row.get(2)?, rr: row.get(3)?, change: row.get(4)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(points)
}

pub fn progression(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Progression> {
    let overview = stats::overview(conn, puuid, season)?;
    Ok(Progression {
        rr: rr_history(conn, puuid, season)?,
        games: games(conn, puuid, season, None)?,
        lobby_acs: overview.lobby.acs,
        lobby_hs_pct: overview.lobby.hs_pct,
    })
}

pub fn recent_flaws(conn: &Connection, puuid: &str) -> AppResult<RecentFlaws> {
    let recent = games(conn, puuid, None, Some(RECENT_MATCHES))?;
    Ok(recent.iter().fold(RecentFlaws::default(), |mut acc, game| {
        acc.matches += 1;
        acc.rounds += game.rounds;
        acc.deaths += game.deaths;
        acc.untraded += game.deaths - game.traded;
        acc.isolated += game.isolated;
        acc.first_deaths += game.first_deaths;
        acc
    }))
}
