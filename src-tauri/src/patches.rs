use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri::ipc::Response;

use crate::db;
use crate::error::AppResult;
use crate::henrik::Henrik;
use crate::i18n::english;
use crate::reports::Report;
use crate::state::AppState;

pub const NOTES_SETTING: &str = "patch_notes";
const REFRESH_SECS: i64 = 24 * 60 * 60;
const RETRY_SECS: i64 = 60 * 60;
const COMPETITIVE: &str = "competitive";
const PATCH_CATEGORY: &str = "patch_notes";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Note {
    pub version: String,
    pub title: String,
    pub date: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Cache {
    locale: String,
    checked_at: i64,
    notes: Vec<Note>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchLine {
    pub version: Option<String>,
    pub published: Option<String>,
    pub matches: i64,
    pub wins: i64,
    pub win_pct: f64,
    pub acs: f64,
    pub kd: f64,
    pub hs_pct: f64,
    pub rr_net: Option<i64>,
    pub inferred: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchReport {
    pub patches: Vec<PatchLine>,
    pub notes: usize,
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64)
}

pub fn locale() -> &'static str {
    if english() { "en-us" } else { "fr-fr" }
}

pub fn version_of(text: &str) -> Option<(u32, u32)> {
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if !bytes[index].is_ascii_digit() || (index > 0 && bytes[index - 1].is_ascii_digit()) {
            index += 1;
            continue;
        }
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        let major = &text[start..index];
        if index + 1 < bytes.len() && bytes[index] == b'.' && bytes[index + 1].is_ascii_digit() {
            let from = index + 1;
            let mut end = from;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
            let minor = &text[from..end];
            if major.len() <= 2 && minor.len() <= 2 {
                return Some((major.parse().ok()?, minor.parse().ok()?));
            }
            index = end;
        }
    }
    None
}

pub fn label((major, minor): (u32, u32)) -> String {
    format!("{major}.{minor:02}")
}

fn parse_notes(data: &Value) -> Vec<Note> {
    let mut found: BTreeMap<(u32, u32), Note> = BTreeMap::new();
    for item in data.as_array().map(Vec::as_slice).unwrap_or_default() {
        let title = item.get("title").and_then(Value::as_str).unwrap_or_default();
        let date = item.get("date").and_then(Value::as_str).unwrap_or_default();
        let category = item.get("category").and_then(Value::as_str).unwrap_or(PATCH_CATEGORY);
        if category != PATCH_CATEGORY || !title.contains("VAL") {
            continue;
        }
        let Some(version) = version_of(title).filter(|_| !date.is_empty()) else {
            continue;
        };
        let note = Note { version: label(version), title: title.to_string(), date: date.to_string() };
        match found.get(&version) {
            Some(known) if known.date <= note.date => {}
            _ => {
                found.insert(version, note);
            }
        }
    }
    found.into_values().collect()
}

fn cache(conn: &Connection) -> Option<Cache> {
    serde_json::from_str(&db::get_setting(conn, NOTES_SETTING).ok()??).ok()
}

pub fn notes(conn: &Connection) -> Vec<Note> {
    cache(conn).map(|cache| cache.notes).unwrap_or_default()
}

fn due(conn: &Connection, locale: &str, at: i64) -> bool {
    cache(conn).is_none_or(|cache| {
        let wait = if cache.notes.is_empty() { RETRY_SECS } else { REFRESH_SECS };
        cache.locale != locale || at - cache.checked_at >= wait || at < cache.checked_at
    })
}

pub async fn refresh(state: &AppState, api: &Henrik) -> AppResult<bool> {
    let locale = locale();
    let at = now();
    if !due(&*state.conn()?, locale, at) {
        return Ok(false);
    }
    let fetched = api.website(locale).await;
    let conn = state.conn()?;
    let previous = notes(&conn);
    let list = match &fetched {
        Ok(data) => parse_notes(data),
        Err(_) => previous.clone(),
    };
    let changed = list != previous;
    let stored = Cache { locale: locale.to_string(), checked_at: at, notes: list };
    if let Ok(json) = serde_json::to_string(&stored) {
        db::set_setting(&conn, NOTES_SETTING, &json)?;
    }
    drop(conn);
    if changed {
        state.forget(|key| key.contains("|Patches("));
    }
    fetched.map(|_| changed)
}

fn moment(date: &str) -> &str {
    date.get(..19).unwrap_or(date)
}

fn infer(notes: &[(String, (u32, u32))], started_at: &str) -> Option<(u32, u32)> {
    let at = moment(started_at).replace(' ', "T");
    notes.iter().rev().find(|(date, _)| moment(date).replace(' ', "T") <= at).map(|(_, version)| *version)
}

#[derive(Default)]
struct Acc {
    matches: i64,
    wins: i64,
    rounds: i64,
    score: i64,
    kills: i64,
    deaths: i64,
    headshots: i64,
    shots: i64,
    rr: Option<i64>,
    inferred: i64,
}

fn ratio(value: f64, total: f64) -> f64 {
    if total > 0.0 { value / total } else { 0.0 }
}

pub fn report(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<PatchReport> {
    let known = notes(conn);
    let mut dated: Vec<(String, (u32, u32))> = known.iter().filter_map(|note| Some((note.date.clone(), version_of(&note.version)?))).collect();
    dated.sort();
    let published: BTreeMap<(u32, u32), String> = dated.iter().map(|(date, version)| (*version, date.clone())).collect();
    let mut stmt = conn.prepare(
        "SELECT m.started_at, m.game_version, p.won, m.rounds, p.score, p.kills, p.deaths, p.headshots,
                p.headshots + p.bodyshots + p.legshots, h.last_change
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN mmr_history h ON h.puuid = p.puuid AND h.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)",
    )?;
    let mut rows = stmt.query(params![puuid, COMPETITIVE, season])?;
    let mut groups: BTreeMap<Option<(u32, u32)>, Acc> = BTreeMap::new();
    while let Some(row) = rows.next()? {
        let started_at: String = row.get(0)?;
        let stored = row.get::<_, Option<String>>(1)?.as_deref().and_then(version_of);
        let guessed = stored.is_none().then(|| infer(&dated, &started_at)).flatten();
        let acc = groups.entry(stored.or(guessed)).or_default();
        acc.matches += 1;
        acc.wins += i64::from(row.get::<_, bool>(2)?);
        acc.rounds += row.get::<_, i64>(3)?;
        acc.score += row.get::<_, i64>(4)?;
        acc.kills += row.get::<_, i64>(5)?;
        acc.deaths += row.get::<_, i64>(6)?;
        acc.headshots += row.get::<_, i64>(7)?;
        acc.shots += row.get::<_, i64>(8)?;
        if let Some(change) = row.get::<_, Option<i64>>(9)? {
            acc.rr = Some(acc.rr.unwrap_or(0) + change);
        }
        acc.inferred += i64::from(guessed.is_some());
    }
    let mut patches: Vec<PatchLine> = groups
        .into_iter()
        .rev()
        .map(|(version, acc)| PatchLine {
            version: version.map(label),
            published: version.and_then(|version| published.get(&version).cloned()),
            matches: acc.matches,
            wins: acc.wins,
            win_pct: ratio(acc.wins as f64 * 100.0, acc.matches as f64),
            acs: ratio(acc.score as f64, acc.rounds as f64),
            kd: ratio(acc.kills as f64, acc.deaths as f64),
            hs_pct: ratio(acc.headshots as f64 * 100.0, acc.shots as f64),
            rr_net: acc.rr,
            inferred: acc.inferred,
        })
        .collect();
    patches.sort_by_key(|line| line.version.is_none());
    Ok(PatchReport { patches, notes: known.len() })
}

#[tauri::command(async)]
pub fn get_patch_stats(state: State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<Response> {
    Report::Patches(season).serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_versions_from_game_builds_and_titles() {
        assert_eq!(version_of("release-09.10-shipping-25-2780935"), Some((9, 10)));
        assert_eq!(version_of("release-11.08-shipping-14-3954128"), Some((11, 8)));
        assert_eq!(version_of("VALORANT Patch Notes 11.08"), Some((11, 8)));
        assert_eq!(version_of("Notes de patch VALORANT 9.01"), Some((9, 1)));
        assert_eq!(version_of("2025.10 recap 3.5"), Some((3, 5)));
        assert_eq!(version_of("Pas de version"), None);
        assert_eq!(label((9, 1)), "9.01");
        assert_eq!(label((11, 10)), "11.10");
    }

    #[test]
    fn keeps_the_first_note_of_each_patch() {
        let data = json!([
            { "title": "VALORANT Patch Notes 11.08", "date": "2025-10-07T17:00:00.000Z" },
            { "title": "VALORANT Patch Notes 11.08 hotfix", "date": "2025-10-09T17:00:00.000Z" },
            { "title": "VALORANT Patch Notes 11.07", "date": "2025-09-23T17:00:00.000Z" },
            { "title": "Agent reveal", "date": "2025-09-30T17:00:00.000Z" },
            { "title": "VALORANT Patch Notes 11.06" },
        ]);
        let notes = parse_notes(&data);
        let found: Vec<(&str, &str)> = notes.iter().map(|note| (note.version.as_str(), note.date.as_str())).collect();
        assert_eq!(found, [("11.07", "2025-09-23T17:00:00.000Z"), ("11.08", "2025-10-07T17:00:00.000Z")]);
    }

    #[test]
    fn keeps_only_valorant_patch_notes() {
        let data = json!([
            { "category": "patch_notes", "title": "Notes de patch 13.09 VALORANT", "date": "2026-10-27T13:00:00Z" },
            { "category": "patch_notes", "title": "Notes de patch 12.01 de VAL", "date": "2026-01-20T14:00:00Z" },
            { "category": "patch_notes", "title": "Wild Rift Patch Notes 6.3", "date": "2025-10-22T09:00:00Z" },
            { "category": "patch_notes", "title": "Notes de patch 17.3 de TFT", "date": "2026-05-12T18:00:00Z" },
            { "category": "patch_notes", "title": "Patch 25.21 Notes", "date": "2025-10-21T18:00:00Z" },
            { "category": "game_updates", "title": "Deep Dive Into VALORANT 4.04 Changes", "date": "2022-03-03T16:00:00Z" },
        ]);
        let versions: Vec<String> = parse_notes(&data).into_iter().map(|note| note.version).collect();
        assert_eq!(versions, ["12.01", "13.09"]);
        let conn = Connection::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        let empty = Cache { locale: "fr-fr".into(), checked_at: 0, notes: Vec::new() };
        db::set_setting(&conn, NOTES_SETTING, &serde_json::to_string(&empty).unwrap()).unwrap();
        assert!(!due(&conn, "fr-fr", RETRY_SECS - 1) && due(&conn, "fr-fr", RETRY_SECS));
    }

    #[test]
    fn stores_the_game_version_of_new_matches() {
        let mut conn = Connection::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        let game = json!({
            "metadata": { "match_id": "m", "queue": { "id": "competitive" }, "game_version": "release-11.08-shipping-14-3954128" },
            "players": [{ "puuid": "me", "team_id": "Red" }],
            "teams": [{ "team_id": "Red", "won": true }],
            "rounds": [{ "winning_team": "Red" }],
        });
        assert!(crate::repo::insert_match(&mut conn, game).unwrap());
        let stored: Option<String> = conn.query_row("SELECT game_version FROM matches WHERE match_id = 'm'", [], |row| row.get(0)).unwrap();
        assert_eq!(stored.as_deref(), Some("release-11.08-shipping-14-3954128"));
    }

    fn insert(conn: &Connection, id: &str, started_at: &str, version: Option<&str>, won: bool, change: Option<i64>) {
        conn.execute(
            "INSERT INTO matches (match_id, started_at, queue, rounds, raw, game_version) VALUES (?1, ?2, 'competitive', 20, x'7b7d', ?3)",
            params![id, started_at, version],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO match_players (match_id, puuid, score, kills, deaths, headshots, bodyshots, won) VALUES (?1, 'me', 4000, 20, 10, 5, 15, ?2)",
            params![id, won],
        )
        .unwrap();
        if let Some(change) = change {
            conn.execute(
                "INSERT INTO mmr_history (puuid, match_id, date, last_change) VALUES ('me', ?1, ?2, ?3)",
                params![id, started_at, change],
            )
            .unwrap();
        }
    }

    #[test]
    fn groups_matches_by_patch_and_infers_old_ones_from_the_notes() {
        let conn = Connection::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        insert(&conn, "a", "2025-10-10T20:00:00.000Z", Some("release-11.08-shipping-14-3954128"), true, Some(20));
        insert(&conn, "b", "2025-10-08T20:00:00.000Z", None, false, Some(-15));
        insert(&conn, "c", "2025-09-25T20:00:00.000Z", None, true, None);
        insert(&conn, "d", "2025-01-01T20:00:00.000Z", None, false, None);
        let empty = report(&conn, "me", None).unwrap();
        assert_eq!(empty.notes, 0);
        assert_eq!(
            empty.patches.iter().map(|line| (line.version.clone(), line.matches, line.inferred)).collect::<Vec<_>>(),
            [(Some("11.08".to_string()), 1, 0), (None, 3, 0)]
        );

        let cache = Cache {
            locale: "fr-fr".into(),
            checked_at: 0,
            notes: parse_notes(&json!([
                { "title": "Notes de patch VALORANT 11.08", "date": "2025-10-07T17:00:00.000Z" },
                { "title": "Notes de patch VALORANT 11.07", "date": "2025-09-23T17:00:00.000Z" },
            ])),
        };
        db::set_setting(&conn, NOTES_SETTING, &serde_json::to_string(&cache).unwrap()).unwrap();
        let found = report(&conn, "me", None).unwrap();
        let lines: Vec<(Option<String>, i64, i64, Option<i64>, i64)> =
            found.patches.iter().map(|line| (line.version.clone(), line.matches, line.wins, line.rr_net, line.inferred)).collect();
        assert_eq!(
            lines,
            [(Some("11.08".into()), 2, 1, Some(5), 1), (Some("11.07".into()), 1, 1, None, 1), (None, 1, 0, None, 0)]
        );
        let first = &found.patches[0];
        assert_eq!(first.published.as_deref(), Some("2025-10-07T17:00:00.000Z"));
        assert!((first.acs - 200.0).abs() < 1e-9 && (first.kd - 2.0).abs() < 1e-9 && (first.hs_pct - 25.0).abs() < 1e-9);
        assert!(due(&conn, "fr-fr", REFRESH_SECS) && !due(&conn, "fr-fr", REFRESH_SECS - 1) && due(&conn, "en-us", 1));
    }
}
