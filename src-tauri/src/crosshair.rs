use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::State;

use crate::agent_stats;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::henrik::Henrik;
use crate::i18n::tr;
use crate::reports::Report;
use crate::state::AppState;
use crate::sync::API_KEY_SETTING;

const MAX_CODE_CHARS: usize = 400;
const MAX_LABEL_CHARS: usize = 40;
const MAX_ENTRIES: i64 = 200;
const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;
const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
const INSTANT_PATTERN: &[u8; 19] = b"0000-00-00T00:00:00";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Crosshair {
    pub id: i64,
    pub code: String,
    pub label: String,
    pub since_date: String,
    pub since_at: String,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Period {
    pub crosshair_id: Option<i64>,
    pub matches: i64,
    pub hs_pct: Option<f64>,
    pub kd: Option<f64>,
    pub acs: Option<f64>,
    pub first_duels: i64,
    pub first_duels_won_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosshairReport {
    pub crosshairs: Vec<Crosshair>,
    pub periods: Vec<Period>,
}

#[derive(Default)]
struct Acc {
    matches: i64,
    kills: i64,
    deaths: i64,
    headshots: i64,
    shots: i64,
    score: i64,
    rounds: i64,
    first_kills: i64,
    first_deaths: i64,
}

impl Acc {
    fn finish(self, crosshair_id: Option<i64>) -> Period {
        let share = |part: i64, total: i64| (total > 0).then(|| part as f64 * 100.0 / total as f64);
        Period {
            crosshair_id,
            matches: self.matches,
            hs_pct: share(self.headshots, self.shots),
            kd: (self.matches > 0).then(|| self.kills as f64 / self.deaths.max(1) as f64),
            acs: (self.rounds > 0).then(|| self.score as f64 / self.rounds as f64),
            first_duels: self.first_kills + self.first_deaths,
            first_duels_won_pct: share(self.first_kills, self.first_kills + self.first_deaths),
        }
    }
}

pub fn clean_code(raw: &str) -> Option<String> {
    let code = raw.trim().trim_end_matches(';');
    let valid = code.len() <= MAX_CODE_CHARS
        && code.starts_with("0;")
        && code.split(';').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'));
    valid.then(|| code.to_string())
}

fn clean_label(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_LABEL_CHARS).collect()
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10 && bytes.iter().zip(&INSTANT_PATTERN[..10]).all(|(c, p)| if *p == b'0' { c.is_ascii_digit() } else { c == p })
}

fn valid_instant(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 20 || bytes.len() > 30 || bytes.last() != Some(&b'Z') {
        return false;
    }
    let head = bytes[..19].iter().zip(INSTANT_PATTERN).all(|(c, p)| if *p == b'0' { c.is_ascii_digit() } else { c == p });
    let fraction = &bytes[19..bytes.len() - 1];
    head && (fraction.is_empty() || (fraction[0] == b'.' && fraction.len() > 1 && fraction[1..].iter().all(u8::is_ascii_digit)))
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() <= MAX_IMAGE_BYTES && bytes.starts_with(&PNG_SIGNATURE)
}

fn invalid_code() -> AppError {
    AppError::Invalid(tr(
        "Ce code de viseur n'a pas un format valide, il commence par 0; et se copie depuis les paramètres du jeu",
        "This crosshair code does not have a valid format, it starts with 0; and is copied from the game settings",
    ).into())
}

pub fn is_report(key: &str) -> bool {
    key.ends_with("|Crosshairs")
}

fn has_image(conn: &Connection, code: &str) -> AppResult<bool> {
    Ok(conn.query_row("SELECT 1 FROM crosshair_images WHERE code = ?1", params![code], |_| Ok(())).optional()?.is_some())
}

fn count(conn: &Connection, puuid: &str) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM crosshairs WHERE puuid = ?1", params![puuid], |row| row.get(0))?)
}

pub fn store_image(conn: &Connection, code: &str, png: &[u8]) -> AppResult<()> {
    conn.execute("INSERT OR IGNORE INTO crosshair_images (code, png) VALUES (?1, ?2)", params![code, png])?;
    Ok(())
}

pub fn insert(conn: &Connection, puuid: &str, code: &str, label: &str, since_date: &str, since_at: &str) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO crosshairs (puuid, code, label, since_date, since_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![puuid, code, label, since_date, since_at],
    )?;
    Ok(conn.last_insert_rowid())
}

fn crosshairs(conn: &Connection, puuid: &str) -> AppResult<Vec<Crosshair>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.code, c.label, c.since_date, c.since_at, i.png
         FROM crosshairs c LEFT JOIN crosshair_images i ON i.code = c.code
         WHERE c.puuid = ?1
         ORDER BY c.since_at, c.id",
    )?;
    let rows = stmt
        .query_map(params![puuid], |row| {
            let png: Option<Vec<u8>> = row.get(5)?;
            Ok(Crosshair {
                id: row.get(0)?,
                code: row.get(1)?,
                label: row.get(2)?,
                since_date: row.get(3)?,
                since_at: row.get(4)?,
                image: png.filter(|png| is_png(png)).map(|png| format!("data:image/png;base64,{}", STANDARD.encode(png))),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn report(conn: &Connection, puuid: &str) -> AppResult<CrosshairReport> {
    let crosshairs = crosshairs(conn, puuid)?;
    if crosshairs.is_empty() {
        return Ok(CrosshairReport { crosshairs, periods: Vec::new() });
    }
    let mut accs: Vec<Acc> = (0..=crosshairs.len()).map(|_| Acc::default()).collect();
    let mut stmt = conn.prepare(
        "SELECT p.match_id, m.started_at, p.kills, p.deaths, p.headshots, p.bodyshots + p.legshots, p.score, m.rounds
         FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = 'competitive'
         ORDER BY m.started_at",
    )?;
    let mut rows = stmt.query(params![puuid])?;
    while let Some(row) = rows.next()? {
        let match_id: String = row.get(0)?;
        let started_at: String = row.get(1)?;
        let index = crosshairs.partition_point(|crosshair| crosshair.since_at.as_str() <= started_at.as_str());
        let acc = &mut accs[index];
        let headshots: i64 = row.get(4)?;
        acc.matches += 1;
        acc.kills += row.get::<_, i64>(2)?;
        acc.deaths += row.get::<_, i64>(3)?;
        acc.headshots += headshots;
        acc.shots += headshots + row.get::<_, i64>(5)?;
        acc.score += row.get::<_, i64>(6)?;
        acc.rounds += row.get::<_, i64>(7)?;
        if let Some((first_kills, first_deaths, _)) = agent_stats::stored_first_kills(conn, &match_id, puuid)? {
            acc.first_kills += first_kills;
            acc.first_deaths += first_deaths;
        }
    }
    let periods = accs
        .into_iter()
        .enumerate()
        .map(|(index, acc)| acc.finish(index.checked_sub(1).map(|position| crosshairs[position].id)))
        .collect();
    Ok(CrosshairReport { crosshairs, periods })
}

#[tauri::command]
pub async fn add_crosshair(
    state: State<'_, AppState>,
    puuid: String,
    code: String,
    label: String,
    since_date: String,
    since_at: String,
) -> AppResult<()> {
    let code = clean_code(&code).ok_or_else(invalid_code)?;
    if puuid.trim().is_empty() {
        return Err(AppError::Invalid(tr("Compte introuvable", "Account not found").into()));
    }
    if !valid_date(&since_date) || !valid_instant(&since_at) {
        return Err(AppError::Invalid(tr("Date invalide", "Invalid date").into()));
    }
    let label = clean_label(&label);
    let (known, key) = {
        let conn = state.conn()?;
        if count(&conn, &puuid)? >= MAX_ENTRIES {
            return Err(AppError::Invalid(tr("Trop de viseurs enregistrés", "Too many crosshairs saved").into()));
        }
        (has_image(&conn, &code)?, db::get_setting(&conn, API_KEY_SETTING)?.filter(|key| !key.is_empty()))
    };
    let image = match key {
        Some(key) if !known => match Henrik::new(key)?.crosshair(&code).await {
            Ok(png) => Some(png).filter(|png| is_png(png)),
            Err(AppError::NotFound) => {
                return Err(AppError::Invalid(
                    tr("L'API HenrikDev ne reconnaît pas ce code de viseur", "The HenrikDev API does not recognize this crosshair code").into(),
                ));
            }
            Err(err @ AppError::Api(_)) => return Err(err),
            Err(_) => None,
        },
        _ => None,
    };
    let conn = state.conn()?;
    if let Some(png) = image {
        store_image(&conn, &code, &png)?;
    }
    insert(&conn, &puuid, &code, &label, &since_date, &since_at)?;
    drop(conn);
    state.forget(is_report);
    Ok(())
}

#[tauri::command(async)]
pub fn delete_crosshair(state: State<'_, AppState>, puuid: String, id: i64) -> AppResult<()> {
    state.conn()?.execute("DELETE FROM crosshairs WHERE id = ?1 AND puuid = ?2", params![id, puuid])?;
    state.forget(is_report);
    Ok(())
}

#[tauri::command(async)]
pub fn list_crosshairs(state: State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    Report::Crosshairs.serve(&state, &puuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_game_codes_only() {
        assert_eq!(clean_code(" 0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0; ").as_deref(), Some("0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0"));
        assert_eq!(clean_code("0;s;1;P;u;FF00FFFF;o;0.5").as_deref(), Some("0;s;1;P;u;FF00FFFF;o;0.5"));
        assert!(clean_code("").is_none());
        assert!(clean_code("0").is_none());
        assert!(clean_code("1;P;c;5").is_none());
        assert!(clean_code("0;P;;c").is_none());
        assert!(clean_code("0;P;c;5&x=1").is_none());
        assert!(clean_code(&format!("0;{}", "P;".repeat(300))).is_none());
    }

    #[test]
    fn checks_dates() {
        assert!(valid_date("2026-11-07"));
        assert!(!valid_date("2026-1-07"));
        assert!(valid_instant("2026-11-06T23:00:00.000Z"));
        assert!(valid_instant("2026-11-06T23:00:00Z"));
        assert!(!valid_instant("2026-11-06T23:00:00.Z"));
        assert!(!valid_instant("2026-11-06 23:00:00Z"));
        assert!(!valid_instant("2026-11-06T23:00:00+01:00"));
    }

    #[test]
    fn splits_matches_between_crosshair_changes() {
        let conn = Connection::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        let raw = r#"{"rounds":[{},{}],"kills":[{"round":0,"time_in_round_in_ms":900,"killer":{"puuid":"me"},"victim":{"puuid":"foe"}},{"round":1,"time_in_round_in_ms":800,"killer":{"puuid":"foe"},"victim":{"puuid":"me"}}]}"#;
        for (id, started, kills, deaths, head, body) in [
            ("m1", "2026-01-01T10:00:00.000Z", 10, 10, 2, 8),
            ("m2", "2026-01-05T10:00:00.000Z", 20, 10, 5, 5),
            ("m3", "2026-01-06T10:00:00.000Z", 10, 5, 3, 7),
        ] {
            conn.execute(
                "INSERT INTO matches (match_id, started_at, queue, rounds, raw) VALUES (?1, ?2, 'competitive', 20, ?3)",
                params![id, started, raw.as_bytes()],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO match_players (match_id, puuid, score, kills, deaths, headshots, bodyshots, won) VALUES (?1, 'me', 4000, ?2, ?3, ?4, ?5, 1)",
                params![id, kills, deaths, head, body],
            )
            .unwrap();
        }
        let first = insert(&conn, "me", "0;P;c;5", "", "2026-01-05", "2026-01-04T23:00:00.000Z").unwrap();
        store_image(&conn, "0;P;c;5", &PNG_SIGNATURE).unwrap();
        let report = report(&conn, "me").unwrap();
        assert_eq!(report.crosshairs.len(), 1);
        assert!(report.crosshairs[0].image.as_deref().is_some_and(|image| image.starts_with("data:image/png;base64,")));
        assert_eq!(report.periods.len(), 2);
        let before = &report.periods[0];
        assert_eq!((before.crosshair_id, before.matches), (None, 1));
        assert_eq!(before.hs_pct, Some(20.0));
        let after = &report.periods[1];
        assert_eq!((after.crosshair_id, after.matches), (Some(first), 2));
        assert_eq!(after.kd, Some(2.0));
        assert_eq!(after.hs_pct, Some(40.0));
        assert_eq!(after.acs, Some(200.0));
        assert_eq!(after.first_duels, 4);
        assert_eq!(after.first_duels_won_pct, Some(50.0));
    }
}
