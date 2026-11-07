use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{agent_stats, db, duels, journal, map_stats, progression, stats, weapon_stats};

#[derive(Debug, Clone)]
pub enum Report {
    Overview(Option<String>),
    Recent(i64, i64),
    Flaws,
    Progression(Option<String>),
    Agents(Option<String>),
    Maps(Option<String>),
    Weapons(Option<String>),
    Duels(Option<String>),
    Notes,
    Tags,
}

fn json<T: Serialize>(value: AppResult<T>) -> AppResult<String> {
    serde_json::to_string(&value?).map_err(|err| AppError::Invalid(err.to_string()))
}

impl Report {
    pub fn key(&self, puuid: &str) -> String {
        format!("{puuid}|{self:?}")
    }

    pub fn is_journal(key: &str) -> bool {
        key.ends_with("|Notes") || key.ends_with("|Tags")
    }

    fn compute(&self, conn: &Connection, puuid: &str) -> AppResult<String> {
        match self {
            Report::Overview(season) => json(stats::overview(conn, puuid, season.as_deref())),
            Report::Recent(limit, offset) => json(stats::recent_matches(conn, puuid, *limit, *offset)),
            Report::Flaws => json(progression::recent_flaws(conn, puuid)),
            Report::Progression(season) => json(progression::progression(conn, puuid, season.as_deref())),
            Report::Agents(season) => json(agent_stats::agent_stats(conn, puuid, season.as_deref())),
            Report::Maps(season) => json(map_stats::map_stats(conn, puuid, season.as_deref())),
            Report::Weapons(season) => json(weapon_stats::report(conn, puuid, season.as_deref())),
            Report::Duels(season) => json(duels::duels(conn, puuid, season.as_deref())),
            Report::Notes => json(journal::entries(conn, puuid)),
            Report::Tags => json(journal::tag_stats(conn, puuid)),
        }
    }

    pub fn serve(self, state: &AppState, puuid: &str) -> AppResult<tauri::ipc::Response> {
        state.cached(self.key(puuid), |conn| self.compute(conn, puuid))
    }
}

pub fn warm(app: &AppHandle, puuid: String) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let Ok(conn) = db::open(&state.db_path) else { return };
        let current = stats::seasons(&conn, &puuid).ok().and_then(|list| list.first().map(|season| season.short.clone()));
        let mut list = vec![
            Report::Overview(current.clone()),
            Report::Recent(10, 0),
            Report::Recent(20, 0),
            Report::Flaws,
            Report::Progression(current.clone()),
            Report::Notes,
            Report::Tags,
        ];
        for season in [current.clone(), None] {
            list.extend([
                Report::Agents(season.clone()),
                Report::Maps(season.clone()),
                Report::Weapons(season.clone()),
                Report::Duels(season.clone()),
            ]);
        }
        list.extend([Report::Overview(None), Report::Progression(None)]);
        for report in list {
            let key = report.key(&puuid);
            if state.cached_json(&key).is_some() {
                continue;
            }
            let generation = state.generation();
            if let Ok(json) = report.compute(&conn, &puuid) {
                state.store_json(key, json, generation);
            }
        }
    });
}
