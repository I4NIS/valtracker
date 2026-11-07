use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::collections::HashMap;

use crate::analysis;
use crate::assets;
use crate::error::AppResult;
use crate::stats;
use crate::storage;
use crate::thresholds::Thresholds;

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
    pub rr_change: Option<i64>,
    pub length_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub riot_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub riot_grade: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progression {
    pub rr: Vec<RrPoint>,
    pub games: Vec<GameSummary>,
    pub lobby_acs: f64,
    pub lobby_hs_pct: f64,
    pub rr_breakdown: crate::ranked::RrBreakdown,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conduct: Option<Conduct>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conduct {
    pub matches: i64,
    pub with_afk_ally: i64,
    pub losses_with_afk_ally: i64,
    pub with_afk_enemy: i64,
    pub wins_with_afk_enemy: i64,
    pub my_afk_rounds: f64,
    pub friendly_fire_received: f64,
    pub friendly_fire_dealt: f64,
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

fn summary(
    conn: &Connection,
    roles: &HashMap<String, String>,
    thresholds: &Thresholds,
    puuid: &str,
    match_id: &str,
) -> AppResult<Option<Summary>> {
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
    let Some(game) = storage::load_game(conn, match_id)? else {
        return Ok(None);
    };
    let Some(detail) = analysis::analyze(&game, puuid, None, roles, thresholds) else {
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
            .filter(|death| death.nearest_ally_m.is_some_and(|meters| meters > thresholds.isolation_meters))
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
    let thresholds = Thresholds::load(conn)?;
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.map_name, p.agent_id, p.won, m.rounds, p.kills, p.deaths, p.assists,
                p.score, p.headshots, p.headshots + p.bodyshots + p.legshots, h.last_change, m.game_length_ms,
                p.riot_score, p.riot_grade
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN mmr_history h ON h.puuid = p.puuid AND h.match_id = p.match_id
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
                row.get::<_, Option<i64>>(12)?,
                row.get::<_, Option<i64>>(13)?,
                row.get::<_, Option<f64>>(14)?,
                row.get::<_, Option<String>>(15)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut games = Vec::with_capacity(rows.len());
    for (match_id, started_at, map_name, agent_id, won, rounds, kills, deaths, assists, score, headshots, shots, rr_change, length_ms, riot_score, riot_grade) in rows {
        let analysis = summary(conn, &roles, &thresholds, puuid, &match_id)?;
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
            rr_change,
            length_ms,
            riot_score,
            riot_grade,
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
    let overview = stats::overview(conn, puuid, &stats::Filters::season(season))?;
    Ok(Progression {
        rr: rr_history(conn, puuid, season)?,
        games: games(conn, puuid, season, None)?,
        lobby_acs: overview.lobby.acs,
        lobby_hs_pct: overview.lobby.hs_pct,
        rr_breakdown: crate::ranked::breakdown(conn, puuid, season)?,
        conduct: conduct(conn, puuid, season)?,
    })
}

pub fn conduct(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Option<Conduct>> {
    let mut stmt = conn.prepare(
        "SELECT p.won,
                EXISTS (SELECT 1 FROM match_players o WHERE o.match_id = p.match_id AND o.puuid <> p.puuid AND o.team = p.team AND o.afk_rounds > 0),
                EXISTS (SELECT 1 FROM match_players o WHERE o.match_id = p.match_id AND o.team <> p.team AND o.afk_rounds > 0),
                p.afk_rounds, COALESCE(p.friendly_fire_in, 0), COALESCE(p.friendly_fire_out, 0)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3) AND p.afk_rounds IS NOT NULL",
    )?;
    let mut rows = stmt.query(params![puuid, COMPETITIVE, season])?;
    let mut acc = Conduct::default();
    while let Some(row) = rows.next()? {
        let won: bool = row.get(0)?;
        let afk_ally: bool = row.get(1)?;
        let afk_enemy: bool = row.get(2)?;
        acc.matches += 1;
        acc.with_afk_ally += i64::from(afk_ally);
        acc.losses_with_afk_ally += i64::from(afk_ally && !won);
        acc.with_afk_enemy += i64::from(afk_enemy);
        acc.wins_with_afk_enemy += i64::from(afk_enemy && won);
        acc.my_afk_rounds += row.get::<_, f64>(3)?;
        acc.friendly_fire_received += row.get::<_, f64>(4)?;
        acc.friendly_fire_dealt += row.get::<_, f64>(5)?;
    }
    Ok((acc.matches > 0).then_some(acc))
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
