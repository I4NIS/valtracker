use rusqlite::Connection;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::stats::Filters;
use crate::thresholds::Thresholds;
use crate::{
    agent_stats, analysis, assets, db, duels, favorites, heatmap, journal, map_detail, map_stats, progression, recap, stats, storage,
    weapon_stats,
};

pub struct Setup {
    pub conn: Connection,
    pub path: PathBuf,
    pub reference: PathBuf,
    pub write: bool,
}

impl Drop for Setup {
    fn drop(&mut self) {
        if let Ok(memory) = Connection::open_in_memory() {
            drop(std::mem::replace(&mut self.conn, memory));
        }
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", self.path.display()));
        }
    }
}

pub fn setup(name: &str) -> Option<Setup> {
    let source = std::env::var_os("VALTRACKER_EQUIV_DB")?;
    let reference = PathBuf::from(std::env::var_os("VALTRACKER_EQUIV_DIR")?);
    let path = std::env::temp_dir().join(format!("valtracker-equiv-{name}-{}.db", std::process::id()));
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
    std::fs::copy(&source, &path).expect("copy of the reference database");
    let conn = db::open(&path).expect("reference database");
    let write = std::env::var_os("VALTRACKER_EQUIV_WRITE").is_some();
    Some(Setup { conn, path, reference, write })
}

pub fn json<T: Serialize>(value: crate::error::AppResult<T>) -> String {
    match value {
        Ok(value) => serde_json::to_string(&value).expect("json"),
        Err(err) => format!("ERR {err}"),
    }
}

pub fn puuids(conn: &Connection) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT puuid FROM accounts ORDER BY created_at").unwrap();
    stmt.query_map([], |row| row.get(0)).unwrap().filter_map(Result::ok).collect()
}

pub fn seasons(conn: &Connection, puuid: &str) -> Vec<Option<String>> {
    let mut list: Vec<Option<String>> = stats::seasons(conn, puuid).unwrap().into_iter().map(|season| Some(season.short)).collect();
    list.push(None);
    list
}

fn maps(conn: &Connection, puuid: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT COALESCE(m.map_id, m.map_name, '') FROM match_players p JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid = ?1 ORDER BY 1",
        )
        .unwrap();
    stmt.query_map([puuid], |row| row.get(0)).unwrap().filter_map(Result::ok).collect()
}

fn match_ids(conn: &Connection, puuid: &str) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT match_id FROM match_players WHERE puuid = ?1 ORDER BY match_id").unwrap();
    stmt.query_map([puuid], |row| row.get(0)).unwrap().filter_map(Result::ok).collect()
}

pub fn reports(conn: &Connection, puuid: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut put = |key: String, value: String| {
        out.insert(format!("{puuid}|{key}"), value);
    };
    put("FilterOptions".into(), json(stats::filter_options(conn, puuid)));
    for (limit, offset) in [(10, 0), (20, 0), (10, 10)] {
        put(format!("Recent({limit},{offset})"), json(stats::recent_matches(conn, puuid, &Filters::default(), limit, offset)));
    }
    put("Flaws".into(), json(progression::recent_flaws(conn, puuid)));
    put("Notes".into(), json(journal::entries(conn, puuid)));
    put("Tags".into(), json(journal::tag_stats(conn, puuid)));
    put("Favorites".into(), json(favorites::entries(conn, puuid)));
    let seasons = seasons(conn, puuid);
    for season in &seasons {
        let s = season.as_deref();
        put(format!("Overview({s:?})"), json(stats::overview(conn, puuid, &Filters::season(s))));
        put(format!("Progression({s:?})"), json(progression::progression(conn, puuid, s)));
        put(format!("Agents({s:?})"), json(agent_stats::agent_stats(conn, puuid, s)));
        put(format!("Maps({s:?})"), json(map_stats::map_stats(conn, puuid, s)));
        put(format!("Weapons({s:?})"), json(weapon_stats::report(conn, puuid, s)));
        put(format!("Duels({s:?})"), json(duels::duels(conn, puuid, s)));
        if let Ok(all) = weapon_stats::histories(conn, puuid, s) {
            let sorted: BTreeMap<String, String> =
                all.iter().map(|((weapon, deaths), list)| (format!("{weapon}|{deaths}"), serde_json::to_string(list).unwrap())).collect();
            for (key, value) in sorted {
                put(format!("WeaponHistory({s:?},{key})"), value);
            }
        }
    }
    let current = seasons.first().cloned().flatten();
    for map in maps(conn, puuid) {
        put(format!("MapHistory({map})"), json(map_detail::map_history(conn, puuid, &map)));
        for season in [None, current.as_deref()] {
            let filters = heatmap::Filters { map_id: Some(&map), season, agent_id: None, queue: Some("competitive"), limit: None };
            put(format!("Heatmap({map},{season:?})"), json(heatmap::heatmap(conn, puuid, &filters)));
        }
    }
    let filters = heatmap::Filters { map_id: None, season: None, agent_id: None, queue: Some("competitive"), limit: Some(30) };
    put("Heatmap(default)".into(), json(heatmap::heatmap(conn, puuid, &filters)));
    put("ActRecap".into(), json(recap::act(conn, puuid, None)));
    put("SessionRecap".into(), json(recap::session(conn, puuid)));
    put("RecapMatches".into(), json(recap::list(conn, puuid)));
    let roles = assets::agent_roles(conn).unwrap();
    let thresholds = Thresholds::load(conn).unwrap();
    for id in match_ids(conn, puuid) {
        let Some(game) = storage::load_game(conn, &id).unwrap() else {
            continue;
        };
        let map_id = game.pointer("/metadata/map/id").and_then(serde_json::Value::as_str).unwrap_or_default();
        let map = assets::load_map(conn, map_id).unwrap();
        let mut detail = analysis::analyze(&game, puuid, map.as_ref(), &roles, &thresholds);
        if let Some(detail) = detail.as_mut() {
            detail.flaws.retain(|flaw| !flaw.title.starts_with("morts à "));
        }
        put(format!("Match({id})"), serde_json::to_string(&detail).unwrap());
    }
    out
}

pub fn check(setup: &Setup, file: &str, outputs: &BTreeMap<String, String>) {
    let path = setup.reference.join(file);
    if setup.write {
        std::fs::create_dir_all(&setup.reference).unwrap();
        let body: String = outputs.iter().map(|(key, value)| format!("{key}\t{value}\n")).collect();
        std::fs::write(&path, body).unwrap();
        return;
    }
    let body = std::fs::read_to_string(&path).expect("reference outputs");
    let expected: BTreeMap<&str, &str> = body.lines().filter_map(|line| line.split_once('\t')).collect();
    let mut failures = Vec::new();
    for (key, value) in &expected {
        match outputs.get(*key) {
            None => failures.push(format!("missing {key}")),
            Some(found) if found != value => {
                let at = found.bytes().zip(value.bytes()).position(|(a, b)| a != b).unwrap_or(found.len().min(value.len()));
                let from = at.saturating_sub(80);
                failures.push(format!(
                    "differs {key} at {at}\n  expected {}\n  found    {}",
                    &value[from..(at + 80).min(value.len())],
                    &found[from..(at + 80).min(found.len())]
                ));
            }
            _ => {}
        }
    }
    for key in outputs.keys() {
        if !expected.contains_key(key.as_str()) {
            failures.push(format!("unexpected {key}"));
        }
    }
    assert!(failures.is_empty(), "{} differences of {} outputs:\n{}", failures.len(), expected.len(), failures.join("\n"));
}

#[test]
fn reports_match_the_reference() {
    let Some(setup) = setup("reports") else {
        return;
    };
    crate::i18n::set("fr");
    let mut outputs = BTreeMap::new();
    for puuid in puuids(&setup.conn) {
        outputs.extend(reports(&setup.conn, &puuid));
    }
    check(&setup, "reports.tsv", &outputs);
}
