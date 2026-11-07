use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_TAGS: usize = 20;
const MAX_TAG_CHARS: usize = 32;
const MAX_NOTE_CHARS: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub match_id: String,
    pub note: String,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub match_id: String,
    pub started_at: String,
    pub map_name: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub won: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub score: Option<i64>,
    pub note: String,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagStat {
    pub tag: String,
    pub matches: i64,
    pub wins: i64,
    pub win_rate: f64,
    pub avg_acs: f64,
    pub avg_score: Option<f64>,
    pub without_matches: i64,
    pub without_win_rate: f64,
    pub without_acs: f64,
}

fn parse_tags(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for tag in tags {
        let tag: String = tag.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_TAG_CHARS).collect();
        if tag.is_empty() || !seen.insert(tag.to_lowercase()) {
            continue;
        }
        result.push(tag);
        if result.len() == MAX_TAGS {
            break;
        }
    }
    result
}

fn ratio(part: f64, total: f64) -> f64 {
    if total > 0.0 { part / total } else { 0.0 }
}

pub fn load(conn: &Connection, puuid: &str, match_id: &str) -> AppResult<Option<Note>> {
    Ok(conn
        .query_row(
            "SELECT match_id, note, tags, updated_at FROM match_notes WHERE match_id = ?1 AND puuid = ?2",
            params![match_id, puuid],
            |row| {
                Ok(Note {
                    match_id: row.get(0)?,
                    note: row.get(1)?,
                    tags: parse_tags(&row.get::<_, String>(2)?),
                    updated_at: row.get(3)?,
                })
            },
        )
        .optional()?)
}

pub fn store(conn: &Connection, puuid: &str, match_id: &str, note: &str, tags: Vec<String>) -> AppResult<()> {
    if puuid.trim().is_empty() || match_id.trim().is_empty() {
        return Err(AppError::Invalid("Match ou compte inconnu".into()));
    }
    let note = note.trim();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(AppError::Invalid("La note est trop longue".into()));
    }
    let tags = clean_tags(tags);
    if note.is_empty() && tags.is_empty() {
        conn.execute("DELETE FROM match_notes WHERE match_id = ?1 AND puuid = ?2", params![match_id, puuid])?;
        return Ok(());
    }
    let encoded = serde_json::to_string(&tags).map_err(|err| AppError::Invalid(err.to_string()))?;
    conn.execute(
        "INSERT INTO match_notes (match_id, puuid, note, tags, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(match_id, puuid) DO UPDATE SET note = excluded.note, tags = excluded.tags, updated_at = excluded.updated_at",
        params![match_id, puuid, note, encoded],
    )?;
    Ok(())
}

pub fn entries(conn: &Connection, puuid: &str) -> AppResult<Vec<NoteEntry>> {
    let mut stmt = conn.prepare(
        "SELECT n.match_id, m.started_at, m.map_name, p.agent_id, p.agent_name, p.won, p.rounds_won, p.rounds_lost,
                p.kills, p.deaths, p.assists, p.score, m.rounds, s.score, n.note, n.tags, n.updated_at
         FROM match_notes n
         JOIN matches m ON m.match_id = n.match_id
         JOIN match_players p ON p.match_id = n.match_id AND p.puuid = n.puuid
         LEFT JOIN match_summaries s ON s.match_id = n.match_id AND s.puuid = n.puuid
         WHERE n.puuid = ?1
         ORDER BY m.started_at DESC",
    )?;
    let rows = stmt
        .query_map(params![puuid], |row| {
            let points: i64 = row.get(11)?;
            let rounds: i64 = row.get(12)?;
            Ok(NoteEntry {
                match_id: row.get(0)?,
                started_at: row.get(1)?,
                map_name: row.get(2)?,
                agent_id: row.get(3)?,
                agent_name: row.get(4)?,
                won: row.get(5)?,
                rounds_won: row.get(6)?,
                rounds_lost: row.get(7)?,
                kills: row.get(8)?,
                deaths: row.get(9)?,
                assists: row.get(10)?,
                acs: ratio(points as f64, rounds as f64),
                score: row.get(13)?,
                note: row.get(14)?,
                tags: parse_tags(&row.get::<_, String>(15)?),
                updated_at: row.get(16)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

struct Game {
    won: bool,
    acs: f64,
    score: Option<i64>,
    tags: Vec<String>,
}

#[derive(Default)]
struct Bucket {
    label: String,
    matches: i64,
    wins: i64,
    acs: f64,
    scores: i64,
    score_total: f64,
}

pub fn tag_stats(conn: &Connection, puuid: &str) -> AppResult<Vec<TagStat>> {
    let mut stmt = conn.prepare(
        "SELECT p.won, p.score, m.rounds, s.score, n.tags
         FROM match_players p
         JOIN matches m ON m.match_id = p.match_id
         LEFT JOIN match_summaries s ON s.match_id = p.match_id AND s.puuid = p.puuid
         LEFT JOIN match_notes n ON n.match_id = p.match_id AND n.puuid = p.puuid
         WHERE p.puuid = ?1 AND m.queue = 'competitive'",
    )?;
    let games = stmt
        .query_map(params![puuid], |row| {
            let points: i64 = row.get(1)?;
            let rounds: i64 = row.get(2)?;
            Ok(Game {
                won: row.get(0)?,
                acs: ratio(points as f64, rounds as f64),
                score: row.get(3)?,
                tags: row.get::<_, Option<String>>(4)?.map(|raw| parse_tags(&raw)).unwrap_or_default(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let total_matches = games.len() as i64;
    let total_wins = games.iter().filter(|game| game.won).count() as i64;
    let total_acs: f64 = games.iter().map(|game| game.acs).sum();

    let mut buckets: BTreeMap<String, Bucket> = BTreeMap::new();
    for game in &games {
        let mut counted = HashSet::new();
        for tag in &game.tags {
            let key = tag.to_lowercase();
            if !counted.insert(key.clone()) {
                continue;
            }
            let bucket = buckets.entry(key).or_insert_with(|| Bucket { label: tag.clone(), ..Bucket::default() });
            bucket.matches += 1;
            bucket.wins += game.won as i64;
            bucket.acs += game.acs;
            if let Some(score) = game.score {
                bucket.scores += 1;
                bucket.score_total += score as f64;
            }
        }
    }

    let mut stats: Vec<TagStat> = buckets
        .into_values()
        .map(|bucket| {
            let without_matches = total_matches - bucket.matches;
            TagStat {
                win_rate: ratio(bucket.wins as f64 * 100.0, bucket.matches as f64),
                avg_acs: ratio(bucket.acs, bucket.matches as f64),
                avg_score: (bucket.scores > 0).then(|| bucket.score_total / bucket.scores as f64),
                without_matches,
                without_win_rate: ratio((total_wins - bucket.wins) as f64 * 100.0, without_matches as f64),
                without_acs: ratio(total_acs - bucket.acs, without_matches as f64),
                tag: bucket.label,
                matches: bucket.matches,
                wins: bucket.wins,
            }
        })
        .collect();
    stats.sort_by(|a, b| b.matches.cmp(&a.matches).then_with(|| a.tag.to_lowercase().cmp(&b.tag.to_lowercase())));
    Ok(stats)
}

#[tauri::command]
pub fn get_note(state: State<'_, AppState>, puuid: String, match_id: String) -> AppResult<Option<Note>> {
    load(&*state.conn()?, &puuid, &match_id)
}

#[tauri::command]
pub fn save_note(state: State<'_, AppState>, puuid: String, match_id: String, note: String, tags: Vec<String>) -> AppResult<()> {
    store(&*state.conn()?, &puuid, &match_id, &note, tags)?;
    state.forget(crate::reports::Report::is_journal);
    Ok(())
}

#[tauri::command(async)]
pub fn list_notes(state: State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::Notes.serve(&state, &puuid)
}

#[tauri::command(async)]
pub fn list_tags(state: State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::Tags.serve(&state, &puuid)
}
