use flate2::read::DeflateDecoder;
use rusqlite::{Connection, params};
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;

use crate::error::AppResult;
use crate::progression;
use crate::state::AppState;

const COMPETITIVE: &str = "competitive";
const BEST_MAP_MIN_MATCHES: i64 = 2;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BestMap {
    pub name: String,
    pub matches: i64,
    pub win_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMap {
    pub map_id: Option<String>,
    pub map_name: String,
    pub image: Option<String>,
    pub matches: i64,
    pub wins: i64,
    pub win_pct: f64,
    pub acs: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStat {
    pub agent_id: String,
    pub name: String,
    pub role: Option<String>,
    pub matches: i64,
    pub wins: i64,
    pub losses: i64,
    pub win_pct: f64,
    pub rounds: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub kd: f64,
    pub acs: f64,
    pub adr: f64,
    pub hs_pct: f64,
    pub avg_score: Option<f64>,
    pub first_bloods: i64,
    pub first_deaths: i64,
    pub first_bloods_per_round: f64,
    pub first_deaths_per_round: f64,
    pub best_map: Option<BestMap>,
    pub maps: Vec<AgentMap>,
    pub lobby_acs: Option<f64>,
    pub lobby_samples: i64,
}

struct Row {
    match_id: String,
    agent_id: String,
    agent_name: Option<String>,
    map_id: Option<String>,
    map_name: Option<String>,
    won: bool,
    rounds: i64,
    kills: i64,
    deaths: i64,
    assists: i64,
    score: i64,
    damage: i64,
    headshots: i64,
    shots: i64,
}

#[derive(Default)]
struct MapAcc {
    map_id: Option<String>,
    matches: i64,
    wins: i64,
    score: i64,
    rounds: i64,
}

#[derive(Default)]
struct Acc {
    name: Option<String>,
    matches: i64,
    wins: i64,
    rounds: i64,
    kills: i64,
    deaths: i64,
    assists: i64,
    score: i64,
    damage: i64,
    headshots: i64,
    shots: i64,
    summary_total: i64,
    summary_count: i64,
    first_bloods: i64,
    first_deaths: i64,
    first_rounds: i64,
    maps: HashMap<String, MapAcc>,
}

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

#[derive(Deserialize)]
struct Person {
    #[serde(default)]
    puuid: Option<String>,
}

#[derive(Deserialize)]
struct Kill {
    #[serde(default)]
    round: i64,
    #[serde(default)]
    time_in_round_in_ms: i64,
    #[serde(default)]
    killer: Option<Person>,
    #[serde(default)]
    victim: Option<Person>,
}

#[derive(Deserialize)]
struct Game {
    #[serde(default)]
    rounds: Vec<IgnoredAny>,
    #[serde(default)]
    kills: Vec<Kill>,
}

fn parse(bytes: &[u8]) -> Option<Game> {
    if bytes.first() == Some(&b'{') {
        return serde_json::from_slice(bytes).ok();
    }
    let mut json = Vec::new();
    DeflateDecoder::new(bytes).read_to_end(&mut json).ok()?;
    serde_json::from_slice(&json).ok()
}

fn raw_game(conn: &Connection, match_id: &str) -> AppResult<Option<Game>> {
    let mut stmt = conn.prepare_cached("SELECT raw FROM matches WHERE match_id = ?1")?;
    let mut rows = stmt.query(params![match_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(parse(row.get_ref(0)?.as_bytes().map_err(rusqlite::Error::from)?))
}

fn first_kills(game: &Game, puuid: &str) -> (i64, i64, i64) {
    let mut first: HashMap<i64, &Kill> = HashMap::new();
    for kill in &game.kills {
        let entry = first.entry(kill.round).or_insert(kill);
        if kill.time_in_round_in_ms < entry.time_in_round_in_ms {
            *entry = kill;
        }
    }
    let is_me = |person: &Option<Person>| person.as_ref().and_then(|p| p.puuid.as_deref()) == Some(puuid);
    let bloods = first.values().filter(|kill| is_me(&kill.killer)).count() as i64;
    let deaths = first.values().filter(|kill| is_me(&kill.victim)).count() as i64;
    (bloods, deaths, game.rounds.len() as i64)
}

pub fn agent_stats(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Vec<AgentStat>> {
    let mut stmt = conn.prepare(
        "SELECT m.match_id, LOWER(p.agent_id), p.agent_name, m.map_id, m.map_name, p.won, m.rounds, p.kills, p.deaths,
                p.assists, p.score, p.damage_dealt, p.headshots, p.headshots + p.bodyshots + p.legshots
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3) AND p.agent_id IS NOT NULL",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE, season], |row| {
            Ok(Row {
                match_id: row.get(0)?,
                agent_id: row.get(1)?,
                agent_name: row.get(2)?,
                map_id: row.get(3)?,
                map_name: row.get(4)?,
                won: row.get(5)?,
                rounds: row.get(6)?,
                kills: row.get(7)?,
                deaths: row.get(8)?,
                assists: row.get(9)?,
                score: row.get(10)?,
                damage: row.get(11)?,
                headshots: row.get(12)?,
                shots: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let missing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
           AND NOT EXISTS (SELECT 1 FROM match_summaries s WHERE s.match_id = p.match_id AND s.puuid = p.puuid)",
        params![puuid, COMPETITIVE, season],
        |row| row.get(0),
    )?;
    if missing > 0 {
        progression::games(conn, puuid, season, None)?;
    }
    let mut stmt = conn.prepare("SELECT match_id, score FROM match_summaries WHERE puuid = ?1")?;
    let summaries = stmt
        .query_map(params![puuid], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT LOWER(uuid), name, role FROM agents")?;
    let agents = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, (row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    drop(stmt);

    let mut stmt = conn.prepare("SELECT uuid, COALESCE(list_icon, splash) FROM maps")?;
    let map_images = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    drop(stmt);

    let mut stmt = conn.prepare(
        "SELECT LOWER(o.agent_id), SUM(o.score) * 1.0 / NULLIF(SUM(m.rounds), 0), COUNT(*)
         FROM match_players me
         JOIN matches m ON m.match_id = me.match_id
         JOIN match_players o ON o.match_id = me.match_id AND o.puuid <> me.puuid
         WHERE me.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3) AND o.agent_id IS NOT NULL
         GROUP BY LOWER(o.agent_id)",
    )?;
    let lobby = stmt
        .query_map(params![puuid, COMPETITIVE, season], |row| {
            Ok((row.get::<_, String>(0)?, (row.get::<_, Option<f64>>(1)?, row.get::<_, i64>(2)?)))
        })?
        .collect::<Result<HashMap<_, _>, _>>()?;
    drop(stmt);

    let mut totals: HashMap<String, Acc> = HashMap::new();
    for row in rows {
        let acc = totals.entry(row.agent_id.clone()).or_default();
        if acc.name.is_none() {
            acc.name = row.agent_name.clone();
        }
        acc.matches += 1;
        acc.wins += row.won as i64;
        acc.rounds += row.rounds;
        acc.kills += row.kills;
        acc.deaths += row.deaths;
        acc.assists += row.assists;
        acc.score += row.score;
        acc.damage += row.damage;
        acc.headshots += row.headshots;
        acc.shots += row.shots;
        if let Some(score) = summaries.get(&row.match_id) {
            acc.summary_total += score;
            acc.summary_count += 1;
        }
        if let Some((bloods, deaths, rounds)) = raw_game(conn, &row.match_id)?.map(|game| first_kills(&game, puuid)) {
            acc.first_bloods += bloods;
            acc.first_deaths += deaths;
            acc.first_rounds += rounds;
        }
        let map = acc.maps.entry(row.map_name.clone().unwrap_or_else(|| "Inconnue".into())).or_default();
        if map.map_id.is_none() {
            map.map_id = row.map_id.clone();
        }
        map.matches += 1;
        map.wins += row.won as i64;
        map.score += row.score;
        map.rounds += row.rounds;
    }

    let mut list: Vec<AgentStat> = totals
        .into_iter()
        .map(|(agent_id, acc)| {
            let mut maps: Vec<AgentMap> = acc
                .maps
                .into_iter()
                .map(|(map_name, map)| AgentMap {
                    image: map.map_id.as_ref().and_then(|id| map_images.get(id).cloned().flatten()),
                    map_id: map.map_id,
                    map_name,
                    matches: map.matches,
                    wins: map.wins,
                    win_pct: ratio(map.wins as f64 * 100.0, map.matches as f64),
                    acs: ratio(map.score as f64, map.rounds as f64),
                })
                .collect();
            maps.sort_by(|a, b| b.matches.cmp(&a.matches).then(b.win_pct.total_cmp(&a.win_pct)).then(a.map_name.cmp(&b.map_name)));
            let best_map = maps
                .iter()
                .filter(|map| map.matches >= BEST_MAP_MIN_MATCHES)
                .max_by(|a, b| a.win_pct.total_cmp(&b.win_pct).then(a.matches.cmp(&b.matches)).then(a.acs.total_cmp(&b.acs)))
                .map(|map| BestMap { name: map.map_name.clone(), matches: map.matches, win_pct: map.win_pct });
            let (name, role) = agents
                .get(&agent_id)
                .map(|(name, role)| (name.clone(), role.clone()))
                .unwrap_or_else(|| (acc.name.clone().unwrap_or_else(|| "Agent inconnu".into()), None));
            let (lobby_acs, lobby_samples) = lobby.get(&agent_id).copied().unwrap_or((None, 0));
            AgentStat {
                name,
                role,
                matches: acc.matches,
                wins: acc.wins,
                losses: acc.matches - acc.wins,
                win_pct: ratio(acc.wins as f64 * 100.0, acc.matches as f64),
                rounds: acc.rounds,
                kills: acc.kills,
                deaths: acc.deaths,
                assists: acc.assists,
                kd: ratio(acc.kills as f64, acc.deaths as f64),
                acs: ratio(acc.score as f64, acc.rounds as f64),
                adr: ratio(acc.damage as f64, acc.rounds as f64),
                hs_pct: ratio(acc.headshots as f64 * 100.0, acc.shots as f64),
                avg_score: (acc.summary_count > 0).then(|| acc.summary_total as f64 / acc.summary_count as f64),
                first_bloods: acc.first_bloods,
                first_deaths: acc.first_deaths,
                first_bloods_per_round: ratio(acc.first_bloods as f64, acc.first_rounds as f64),
                first_deaths_per_round: ratio(acc.first_deaths as f64, acc.first_rounds as f64),
                best_map,
                maps,
                lobby_acs: lobby_acs.filter(|_| lobby_samples > 0),
                lobby_samples,
                agent_id,
            }
        })
        .collect();
    list.sort_by(|a, b| b.matches.cmp(&a.matches).then(b.win_pct.total_cmp(&a.win_pct)).then(a.name.cmp(&b.name)));
    Ok(list)
}

#[tauri::command(async)]
pub fn get_agent_stats(state: tauri::State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Vec<AgentStat>> {
    agent_stats(&*state.conn()?, &puuid, season.as_deref())
}
