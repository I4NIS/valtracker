use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use crate::error::AppResult;
use crate::models::{LobbyAverages, Overview, RecentMatch, Season};
use crate::storage;

const COMPETITIVE: &str = "competitive";
pub const ALL_ACCOUNTS: &str = "all";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Party {
    Solo,
    Group,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filters {
    pub season: Option<String>,
    pub map_id: Option<String>,
    pub agent_id: Option<String>,
    pub role: Option<String>,
    pub days: Option<i64>,
    pub party: Option<Party>,
}

impl Filters {
    pub fn season(season: Option<&str>) -> Self {
        Self { season: season.map(str::to_string), ..Self::default() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterOption {
    pub id: String,
    pub name: String,
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterOptions {
    pub maps: Vec<FilterOption>,
    pub agents: Vec<FilterOption>,
    pub roles: Vec<FilterOption>,
}

#[derive(Deserialize)]
struct PartyGame {
    #[serde(default)]
    players: Vec<PartyPlayer>,
}

#[derive(Deserialize)]
struct PartyPlayer {
    puuid: Option<String>,
    team_id: Option<String>,
    party_id: Option<String>,
}

static GROUPED: LazyLock<Mutex<HashMap<(String, String), bool>>> = LazyLock::new(Mutex::default);

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

fn played_in_group(players: &[PartyPlayer], puuid: &str) -> bool {
    let Some(me) = players.iter().find(|player| player.puuid.as_deref() == Some(puuid)) else {
        return false;
    };
    let Some(party) = me.party_id.as_deref().filter(|party| !party.is_empty()) else {
        return false;
    };
    players.iter().any(|player| {
        player.puuid.as_deref() != Some(puuid) && player.party_id.as_deref() == Some(party) && player.team_id == me.team_id
    })
}

pub fn in_group(conn: &Connection, match_id: &str, puuid: &str) -> bool {
    let key = (match_id.to_string(), puuid.to_string());
    if let Some(known) = GROUPED.lock().ok().and_then(|cache| cache.get(&key).copied()) {
        return known;
    }
    let raw: Option<Vec<u8>> = conn
        .query_row("SELECT raw FROM matches WHERE match_id = ?1", params![match_id], |row| {
            Ok(row.get_ref(0)?.as_bytes().ok().map(<[u8]>::to_vec))
        })
        .unwrap_or(None);
    let grouped = raw
        .and_then(|bytes| storage::inflate(&bytes))
        .and_then(|json| serde_json::from_slice::<PartyGame>(&json).ok())
        .is_some_and(|game| played_in_group(&game.players, puuid));
    if let Ok(mut cache) = GROUPED.lock() {
        cache.insert(key, grouped);
    }
    grouped
}

struct Line {
    match_id: String,
    puuid: String,
    won: bool,
    rounds: i64,
    kills: i64,
    deaths: i64,
    assists: i64,
    score: i64,
    damage: i64,
    headshots: i64,
    shots: i64,
    others: i64,
    others_acs: f64,
    others_adr: f64,
    others_kills: i64,
    others_deaths: i64,
    others_headshots: i64,
    others_shots: i64,
}

fn lines(conn: &Connection, puuid: &str, filters: &Filters) -> AppResult<Vec<Line>> {
    let mut stmt = conn.prepare(
        "SELECT p.match_id, p.won, m.rounds, p.kills, p.deaths, p.assists, p.score, p.damage_dealt,
                p.headshots, p.headshots + p.bodyshots + p.legshots,
                COUNT(o.puuid),
                COALESCE(SUM(o.score * 1.0 / m.rounds), 0),
                COALESCE(SUM(o.damage_dealt * 1.0 / m.rounds), 0),
                COALESCE(SUM(o.kills), 0), COALESCE(SUM(o.deaths), 0),
                COALESCE(SUM(o.headshots), 0), COALESCE(SUM(o.headshots + o.bodyshots + o.legshots), 0),
                p.puuid
         FROM match_players p
         JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN match_players o ON o.match_id = p.match_id AND o.puuid <> p.puuid
         WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?2
           AND (?3 IS NULL OR m.season_short = ?3)
           AND (?4 IS NULL OR m.map_id = ?4)
           AND (?5 IS NULL OR p.agent_id = ?5)
           AND (?6 IS NULL OR p.agent_id IN (SELECT uuid FROM agents WHERE role = ?6))
           AND (?7 IS NULL OR julianday(m.started_at) >= julianday('now', printf('-%d days', ?7)))
         GROUP BY p.match_id, p.puuid",
    )?;
    let rows = stmt
        .query_map(
            params![puuid, COMPETITIVE, filters.season, filters.map_id, filters.agent_id, filters.role, filters.days],
            |row| {
                Ok(Line {
                    match_id: row.get(0)?,
                    puuid: row.get(17)?,
                    won: row.get(1)?,
                    rounds: row.get(2)?,
                    kills: row.get(3)?,
                    deaths: row.get(4)?,
                    assists: row.get(5)?,
                    score: row.get(6)?,
                    damage: row.get(7)?,
                    headshots: row.get(8)?,
                    shots: row.get(9)?,
                    others: row.get(10)?,
                    others_acs: row.get(11)?,
                    others_adr: row.get(12)?,
                    others_kills: row.get(13)?,
                    others_deaths: row.get(14)?,
                    others_headshots: row.get(15)?,
                    others_shots: row.get(16)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let Some(party) = filters.party else {
        return Ok(rows);
    };
    let mut kept = Vec::with_capacity(rows.len());
    for line in rows {
        if in_group(conn, &line.match_id, &line.puuid) == (party == Party::Group) {
            kept.push(line);
        }
    }
    Ok(kept)
}

fn summarize(lines: &[Line]) -> Overview {
    let sum = |field: fn(&Line) -> i64| lines.iter().map(field).sum::<i64>();
    let matches = lines.len() as i64;
    let wins = lines.iter().filter(|line| line.won).count() as i64;
    let rounds = sum(|line| line.rounds);
    let kills = sum(|line| line.kills);
    let deaths = sum(|line| line.deaths);
    let assists = sum(|line| line.assists);
    let others = sum(|line| line.others) as f64;
    let others_shots = sum(|line| line.others_shots) as f64;
    Overview {
        matches,
        wins,
        losses: matches - wins,
        rounds,
        kills,
        deaths,
        assists,
        acs: ratio(sum(|line| line.score) as f64, rounds as f64),
        adr: ratio(sum(|line| line.damage) as f64, rounds as f64),
        kd: ratio(kills as f64, deaths as f64),
        kad: ratio((kills + assists) as f64, deaths as f64),
        hs_pct: ratio(sum(|line| line.headshots) as f64 * 100.0, sum(|line| line.shots) as f64),
        win_pct: ratio(wins as f64 * 100.0, matches as f64),
        kills_per_round: ratio(kills as f64, rounds as f64),
        lobby: LobbyAverages {
            acs: ratio(lines.iter().map(|line| line.others_acs).sum(), others),
            adr: ratio(lines.iter().map(|line| line.others_adr).sum(), others),
            kd: ratio(sum(|line| line.others_kills) as f64, sum(|line| line.others_deaths) as f64),
            hs_pct: ratio(sum(|line| line.others_headshots) as f64 * 100.0, others_shots),
        },
    }
}

pub fn overview(conn: &Connection, puuid: &str, filters: &Filters) -> AppResult<Overview> {
    Ok(summarize(&lines(conn, puuid, filters)?))
}

fn options(conn: &Connection, sql: &str, puuid: &str) -> AppResult<Vec<FilterOption>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE], |row| {
            Ok(FilterOption { id: row.get(0)?, name: row.get(1)?, matches: row.get(2)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn filter_options(conn: &Connection, puuid: &str) -> AppResult<FilterOptions> {
    Ok(FilterOptions {
        maps: options(
            conn,
            "SELECT m.map_id, COALESCE(MAX(m.map_name), m.map_id), COUNT(*)
             FROM match_players p JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?2 AND m.map_id IS NOT NULL
             GROUP BY m.map_id ORDER BY 2",
            puuid,
        )?,
        agents: options(
            conn,
            "SELECT p.agent_id, COALESCE(MAX(p.agent_name), p.agent_id), COUNT(*)
             FROM match_players p JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?2 AND p.agent_id IS NOT NULL
             GROUP BY p.agent_id ORDER BY 3 DESC, 2",
            puuid,
        )?,
        roles: options(
            conn,
            "SELECT a.role, a.role, COUNT(*)
             FROM match_players p JOIN matches m ON m.match_id = p.match_id JOIN agents a ON a.uuid = p.agent_id
             WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?2 AND a.role IS NOT NULL
             GROUP BY a.role ORDER BY 3 DESC",
            puuid,
        )?,
    })
}

pub fn recent_matches(conn: &Connection, puuid: &str, filters: &Filters, limit: i64, offset: i64) -> AppResult<Vec<RecentMatch>> {
    let (sql_limit, sql_offset) = if filters.party.is_some() { (-1, 0) } else { (limit, offset) };
    let mut stmt = conn.prepare(
        "SELECT m.match_id, m.started_at, m.map_name, m.queue, p.agent_id, p.agent_name,
                p.kills, p.deaths, p.assists, p.score * 1.0 / m.rounds, p.won, p.rounds_won, p.rounds_lost,
                (SELECT COUNT(*) + 1 FROM match_players q WHERE q.match_id = p.match_id AND q.score > p.score),
                p.puuid, p.tier, h.last_change
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN mmr_history h ON h.puuid = p.puuid AND h.match_id = p.match_id
         WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?4
           AND (?5 IS NULL OR m.season_short = ?5)
           AND (?6 IS NULL OR m.map_id = ?6)
           AND (?7 IS NULL OR p.agent_id = ?7)
           AND (?8 IS NULL OR p.agent_id IN (SELECT uuid FROM agents WHERE role = ?8))
           AND (?9 IS NULL OR julianday(m.started_at) >= julianday('now', printf('-%d days', ?9)))
         ORDER BY m.started_at DESC
         LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt
        .query_map(
            params![
                puuid,
                sql_limit,
                sql_offset,
                COMPETITIVE,
                filters.season,
                filters.map_id,
                filters.agent_id,
                filters.role,
                filters.days
            ],
            |row| {
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
                    puuid: row.get(14)?,
                    tier: row.get(15)?,
                    rr_change: row.get(16)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let Some(party) = filters.party else {
        return Ok(rows);
    };
    let grouped = party == Party::Group;
    Ok(rows
        .into_iter()
        .filter(|game| in_group(conn, &game.match_id, &game.puuid) == grouped)
        .skip(offset.max(0) as usize)
        .take(limit.max(0) as usize)
        .collect())
}

pub fn seasons(conn: &Connection, puuid: &str) -> AppResult<Vec<Season>> {
    let mut stmt = conn.prepare(
        "SELECT m.season_short, COUNT(*)
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid IN (SELECT ?1 UNION ALL SELECT puuid FROM accounts WHERE ?1 = 'all') AND m.queue = ?2 AND m.season_short IS NOT NULL
         GROUP BY m.season_short
         ORDER BY MAX(m.started_at) DESC",
    )?;
    let rows = stmt
        .query_map(params![puuid, COMPETITIVE], |row| Ok(Season { short: row.get(0)?, matches: row.get(1)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use std::sync::atomic::{AtomicUsize, Ordering};

    const ME: &str = "me";
    static NEXT: AtomicUsize = AtomicUsize::new(0);

    struct Game {
        id: &'static str,
        started_at: String,
        map: &'static str,
        season: &'static str,
        agent: &'static str,
        grouped: bool,
        won: bool,
        kills: i64,
        deaths: i64,
    }

    fn player(puuid: &str, team: &str, party: &str, agent: &str, kills: i64, deaths: i64) -> Value {
        json!({
            "puuid": puuid,
            "name": puuid,
            "tag": "0000",
            "team_id": team,
            "party_id": party,
            "agent": { "id": agent, "name": agent },
            "stats": {
                "score": kills * 200,
                "kills": kills,
                "deaths": deaths,
                "assists": 2,
                "headshots": kills,
                "bodyshots": kills * 3,
                "legshots": 0,
                "damage": { "dealt": kills * 150, "received": deaths * 150 },
            },
        })
    }

    fn insert(conn: &mut Connection, game: &Game) {
        let mut players = vec![player(ME, "Red", "party-me", game.agent, game.kills, game.deaths)];
        let mate_party = if game.grouped { "party-me".to_string() } else { format!("{}-mate", game.id) };
        players.push(player(&format!("{}-mate", game.id), "Red", &mate_party, "sova", 10, 10));
        for index in 0..3 {
            players.push(player(&format!("{}-red{index}", game.id), "Red", &format!("{}-red{index}", game.id), "sova", 10, 10));
        }
        for index in 0..5 {
            players.push(player(&format!("{}-blue{index}", game.id), "Blue", &format!("{}-blue{index}", game.id), "sova", 20, 10));
        }
        let rounds: Vec<Value> = (0..20).map(|_| json!({ "winning_team": "Red" })).collect();
        let value = json!({
            "metadata": {
                "match_id": game.id,
                "started_at": game.started_at,
                "map": { "id": game.map, "name": game.map.to_uppercase() },
                "queue": { "id": "competitive" },
                "season": { "short": game.season },
            },
            "players": players,
            "teams": [
                { "team_id": "Red", "won": game.won, "rounds": { "won": 13, "lost": 7 } },
                { "team_id": "Blue", "won": !game.won, "rounds": { "won": 7, "lost": 13 } },
            ],
            "rounds": rounds,
        });
        assert!(crate::repo::insert_match(conn, &value).unwrap());
    }

    fn database() -> (Connection, std::path::PathBuf) {
        let index = NEXT.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("valtracker-stats-{}-{index}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut conn = crate::db::open(&path).unwrap();
        conn.execute_batch(
            "INSERT INTO agents (uuid, name, role) VALUES ('jett', 'Jett', 'Duelist'), ('sova', 'Sova', 'Initiator'),
             ('omen', 'Omen', 'Controller');",
        )
        .unwrap();
        let recent: String = conn
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')", [], |row| row.get(0))
            .unwrap();
        let games = [
            Game { id: "a", started_at: recent, map: "ascent", season: "e9a3", agent: "jett", grouped: true, won: true, kills: 20, deaths: 10 },
            Game { id: "b", started_at: "2024-01-10T20:00:00.000Z".into(), map: "bind", season: "e9a3", agent: "jett", grouped: false, won: false, kills: 10, deaths: 20 },
            Game { id: "c", started_at: "2024-01-05T20:00:00.000Z".into(), map: "ascent", season: "e9a2", agent: "omen", grouped: false, won: true, kills: 15, deaths: 15 },
        ];
        for game in &games {
            insert(&mut conn, game);
        }
        (conn, path)
    }

    fn count(conn: &Connection, filters: Filters) -> i64 {
        count_for(conn, ME, filters)
    }

    fn count_for(conn: &Connection, puuid: &str, filters: Filters) -> i64 {
        overview(conn, puuid, &filters).unwrap().matches
    }

    #[test]
    fn filters_overview() {
        let (conn, path) = database();
        assert_eq!(count(&conn, Filters::default()), 3);
        assert_eq!(count(&conn, Filters::season(Some("e9a3"))), 2);
        assert_eq!(count(&conn, Filters { map_id: Some("ascent".into()), ..Filters::default() }), 2);
        assert_eq!(count(&conn, Filters { agent_id: Some("omen".into()), ..Filters::default() }), 1);
        assert_eq!(count(&conn, Filters { role: Some("Duelist".into()), ..Filters::default() }), 2);
        assert_eq!(count(&conn, Filters { role: Some("Sentinel".into()), ..Filters::default() }), 0);
        assert_eq!(count(&conn, Filters { days: Some(7), ..Filters::default() }), 1);
        assert_eq!(count(&conn, Filters { days: Some(30), ..Filters::default() }), 1);
        assert_eq!(count(&conn, Filters { party: Some(Party::Group), ..Filters::default() }), 1);
        assert_eq!(count(&conn, Filters { party: Some(Party::Solo), ..Filters::default() }), 2);
        let combined = Filters {
            season: Some("e9a3".into()),
            map_id: Some("bind".into()),
            party: Some(Party::Solo),
            role: Some("Duelist".into()),
            ..Filters::default()
        };
        assert_eq!(count(&conn, combined), 1);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sums_stats_and_lobby() {
        let (conn, path) = database();
        let all = overview(&conn, ME, &Filters::default()).unwrap();
        assert_eq!((all.wins, all.losses, all.kills, all.deaths, all.rounds), (2, 1, 45, 45, 60));
        assert!((all.acs - 150.0).abs() < 1e-9);
        assert!((all.hs_pct - 25.0).abs() < 1e-9);
        assert!((all.lobby.acs - 1400.0 / 9.0).abs() < 1e-9);
        assert!((all.lobby.kd - 140.0 / 90.0).abs() < 1e-9);
        let group = overview(&conn, ME, &Filters { party: Some(Party::Group), ..Filters::default() }).unwrap();
        assert_eq!((group.matches, group.kills, group.deaths), (1, 20, 10));
        assert!((group.kd - 2.0).abs() < 1e-9);
        let none = overview(&conn, ME, &Filters { map_id: Some("haven".into()), ..Filters::default() }).unwrap();
        assert_eq!(none.matches, 0);
        assert_eq!(none.acs, 0.0);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn combines_accounts() {
        let (conn, path) = database();
        assert_eq!(count_for(&conn, ALL_ACCOUNTS, Filters::default()), 0);
        conn.execute_batch(
            "INSERT INTO accounts (puuid, name, tag, region) VALUES ('me', 'me', '0000', 'eu'), ('b-mate', 'alt', '0000', 'eu');",
        )
        .unwrap();
        let all = overview(&conn, ALL_ACCOUNTS, &Filters::default()).unwrap();
        assert_eq!((all.matches, all.wins, all.kills), (4, 2, 55));
        assert_eq!(count_for(&conn, ME, Filters::default()), 3);
        assert_eq!(count_for(&conn, ALL_ACCOUNTS, Filters { party: Some(Party::Group), ..Filters::default() }), 1);
        assert_eq!(count_for(&conn, ALL_ACCOUNTS, Filters { party: Some(Party::Solo), ..Filters::default() }), 3);
        assert_eq!(count_for(&conn, ALL_ACCOUNTS, Filters { agent_id: Some("sova".into()), ..Filters::default() }), 1);
        let recent = recent_matches(&conn, ALL_ACCOUNTS, &Filters::default(), 10, 0).unwrap();
        assert_eq!(recent.len(), 4);
        assert_eq!(recent[0].puuid, ME);
        assert_eq!(recent.iter().filter(|game| game.puuid == "b-mate").count(), 1);
        let seasons = seasons(&conn, ALL_ACCOUNTS).unwrap();
        assert_eq!(seasons.iter().map(|season| season.matches).collect::<Vec<_>>(), [3, 1]);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn filters_recent_matches() {
        let (conn, path) = database();
        let ids = |filters: Filters, limit: i64, offset: i64| {
            recent_matches(&conn, ME, &filters, limit, offset)
                .unwrap()
                .into_iter()
                .map(|game| game.match_id)
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(Filters::default(), 10, 0), ["a", "b", "c"]);
        assert_eq!(ids(Filters::default(), 1, 1), ["b"]);
        assert_eq!(ids(Filters::season(Some("e9a2")), 10, 0), ["c"]);
        assert_eq!(ids(Filters { map_id: Some("ascent".into()), ..Filters::default() }, 10, 0), ["a", "c"]);
        assert_eq!(ids(Filters { role: Some("Controller".into()), ..Filters::default() }, 10, 0), ["c"]);
        assert_eq!(ids(Filters { days: Some(7), ..Filters::default() }, 10, 0), ["a"]);
        assert_eq!(ids(Filters { party: Some(Party::Solo), ..Filters::default() }, 10, 0), ["b", "c"]);
        assert_eq!(ids(Filters { party: Some(Party::Solo), ..Filters::default() }, 1, 1), ["c"]);
        assert_eq!(ids(Filters { party: Some(Party::Group), ..Filters::default() }, 10, 0), ["a"]);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn recent_matches_carry_rank_and_rr() {
        let (conn, path) = database();
        conn.execute_batch(
            "UPDATE match_players SET tier = 17 WHERE match_id = 'a' AND puuid = 'me';
             INSERT INTO mmr_history (puuid, match_id, date, tier, last_change) VALUES ('me', 'a', 'x', 17, 18), ('me', 'b', 'x', 17, -24);",
        )
        .unwrap();
        let recent = recent_matches(&conn, ME, &Filters::default(), 10, 0).unwrap();
        let found = recent.iter().map(|game| (game.tier, game.rr_change)).collect::<Vec<_>>();
        assert_eq!(found, [(Some(17), Some(18)), (None, Some(-24)), (None, None)]);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn lists_only_played_options() {
        let (conn, path) = database();
        let options = filter_options(&conn, ME).unwrap();
        let ids = |list: &[FilterOption]| list.iter().map(|item| item.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&options.maps), ["ascent", "bind"]);
        assert_eq!(ids(&options.agents), ["jett", "omen"]);
        assert_eq!(ids(&options.roles), ["Duelist", "Controller"]);
        assert_eq!(options.maps[0].name, "ASCENT");
        drop(conn);
        let _ = std::fs::remove_file(path);
    }
}
