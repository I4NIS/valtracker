use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Condvar, Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, Claim};
use crate::stats::Filters;
use crate::{agent_stats, crosshair, duels, favorites, journal, map_detail, map_stats, progression, scan, stats, warmup, weapon_stats};

#[derive(Debug, Clone)]
pub enum Report {
    Overview(Filters),
    FilterOptions,
    Recent(Filters, i64, i64),
    Flaws,
    Progression(Option<String>),
    Agents(Option<String>),
    Maps(Option<String>),
    MapHistory(String),
    Weapons(Option<String>),
    Duels(Option<String>),
    Notes,
    Tags,
    Favorites,
    Crosshairs,
    Warmup(Option<String>),
    Patches(Option<String>),
    NextGame,
}

fn json<T: Serialize>(value: AppResult<T>) -> AppResult<String> {
    serde_json::to_string(&value?).map_err(|err| AppError::Invalid(err.to_string()))
}

impl Report {
    pub fn key(&self, puuid: &str) -> String {
        format!("{puuid}|{self:?}")
    }

    pub fn is_journal(key: &str) -> bool {
        key.ends_with("|Notes") || key.ends_with("|Tags") || key.ends_with("|Favorites")
    }

    fn compute(&self, conn: &Connection, puuid: &str) -> AppResult<String> {
        match self {
            Report::Overview(filters) => json(stats::overview(conn, puuid, filters)),
            Report::FilterOptions => json(stats::filter_options(conn, puuid)),
            Report::Recent(filters, limit, offset) => json(stats::recent_matches(conn, puuid, filters, *limit, *offset)),
            Report::Flaws => json(progression::recent_flaws(conn, puuid)),
            Report::Progression(season) => json(progression::progression(conn, puuid, season.as_deref())),
            Report::Agents(season) => json(agent_stats::agent_stats(conn, puuid, season.as_deref())),
            Report::Maps(season) => json(map_stats::map_stats(conn, puuid, season.as_deref())),
            Report::MapHistory(map_id) => json(map_detail::map_history(conn, puuid, map_id)),
            Report::Weapons(season) => json(weapon_stats::report(conn, puuid, season.as_deref())),
            Report::Duels(season) => json(duels::duels(conn, puuid, season.as_deref())),
            Report::Notes => json(journal::entries(conn, puuid)),
            Report::Tags => json(journal::tag_stats(conn, puuid)),
            Report::Favorites => json(favorites::entries(conn, puuid)),
            Report::Crosshairs => json(crosshair::report(conn, puuid)),
            Report::Warmup(season) => json(warmup::report(conn, puuid, season.as_deref())),
            Report::NextGame => json(crate::next_game::history(conn, puuid)),
            Report::Patches(season) => json(crate::patches::report(conn, puuid, season.as_deref())),
        }
    }

    pub fn serve(self, state: &AppState, puuid: &str) -> AppResult<tauri::ipc::Response> {
        state.cached(self.key(puuid), |conn| self.compute(conn, puuid))
    }
}

#[derive(Default)]
struct Queue {
    request: Option<String>,
    ready: bool,
}

#[derive(Default)]
pub struct Warmer {
    queue: Mutex<Queue>,
    signal: Condvar,
}

impl Warmer {
    fn queue(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn request(&self, puuid: String) {
        self.queue().request = Some(puuid);
        self.signal.notify_all();
    }

    fn set_ready(&self) {
        self.queue().ready = true;
        self.signal.notify_all();
    }

    fn pending(&self) -> bool {
        self.queue().request.is_some()
    }

    fn next(&self) -> String {
        let mut queue = self.queue();
        loop {
            if queue.ready {
                if let Some(puuid) = queue.request.take() {
                    return puuid;
                }
            }
            queue = self.signal.wait(queue).unwrap_or_else(|poisoned| poisoned.into_inner());
        }
    }
}

pub fn warm(app: &AppHandle, puuid: String) {
    app.state::<Warmer>().request(puuid);
}

pub fn ready(app: &AppHandle) {
    app.state::<Warmer>().set_ready();
}

pub fn start(app: AppHandle) {
    let _ = std::thread::Builder::new().name("warm".into()).spawn(move || {
        lower_priority();
        let warmer = app.state::<Warmer>();
        loop {
            let puuid = warmer.next();
            run(&app.state::<AppState>(), &puuid, &|| warmer.pending());
        }
    });
}

#[cfg(windows)]
pub fn lower_priority() {
    use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL};
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    }
}

#[cfg(not(windows))]
pub fn lower_priority() {}

fn compute(state: &AppState, puuid: &str, list: Vec<Report>, cancelled: &dyn Fn() -> bool) -> bool {
    for report in list {
        if cancelled() {
            return false;
        }
        let Some(claim) = state.claim(&report.key(puuid)) else {
            continue;
        };
        if let Ok(json) = state.read(|conn| report.compute(conn, puuid)) {
            claim.store(json);
        }
    }
    !cancelled()
}

struct Claims<'a> {
    reports: Vec<(Report, Claim<'a>)>,
    histories: Option<Claim<'a>>,
}

impl<'a> Claims<'a> {
    fn take(state: &'a AppState, puuid: &str, season: Option<&str>) -> Self {
        let name = season.map(str::to_string);
        let reports = [Report::Agents(name.clone()), Report::Maps(name.clone()), Report::Weapons(name.clone()), Report::Duels(name)]
            .into_iter()
            .filter_map(|report| state.claim(&report.key(puuid)).map(|claim| (report, claim)))
            .collect();
        Self { reports, histories: state.claim(&weapon_stats::ready_key(puuid, season)) }
    }

    fn is_empty(&self) -> bool {
        self.reports.is_empty() && self.histories.is_none()
    }

    fn store(self, state: &AppState, puuid: &str, season: Option<&str>, batch: scan::Batch) {
        for (report, claim) in self.reports {
            let json = match report {
                Report::Agents(_) => &batch.agents,
                Report::Maps(_) => &batch.maps,
                Report::Weapons(_) => &batch.weapons,
                _ => &batch.duels,
            };
            if let Some(json) = json {
                claim.store(json.clone());
            }
        }
        if let Some(claim) = self.histories {
            weapon_stats::store_histories(state, puuid, season, &batch.histories, claim.generation());
            claim.store("true".into());
        }
    }
}

pub fn run(state: &AppState, puuid: &str, newer: &dyn Fn() -> bool) {
    let generation = state.generation();
    let cancelled = || newer() || state.generation() != generation;
    let Ok(current) = state.read(|conn| Ok(stats::seasons(conn, puuid)?.into_iter().next().map(|season| season.short))) else {
        return;
    };
    state.set_current_season(puuid, current.as_deref());
    let current = current.as_deref();
    let list = vec![
        Report::Overview(Filters::season(current)),
        Report::Recent(Filters::default(), 10, 0),
        Report::Recent(Filters::default(), 20, 0),
        Report::Flaws,
        Report::Progression(current.map(str::to_string)),
        Report::Patches(current.map(str::to_string)),
        Report::FilterOptions,
        Report::Notes,
        Report::Tags,
        Report::Favorites,
    ];
    if !compute(state, puuid, list, &cancelled) {
        return;
    }
    let mut season_claims = current.map(|season| Claims::take(state, puuid, Some(season)));
    let mut total_claims = Some(Claims::take(state, puuid, None));
    let needed = season_claims.as_ref().is_some_and(|claims| !claims.is_empty()) || total_claims.as_ref().is_some_and(|claims| !claims.is_empty());
    if needed {
        let _ = state.read(|conn| {
            scan::scan(conn, puuid, current, &cancelled, &mut |season, batch| {
                let claims = if season.is_some() { season_claims.take() } else { total_claims.take() };
                if let Some(claims) = claims {
                    claims.store(state, puuid, season, batch);
                }
            })
        });
    }
    drop(season_claims);
    drop(total_claims);
    let mut list = vec![Report::Overview(Filters::default()), Report::Progression(None), Report::Crosshairs, Report::Warmup(current.map(str::to_string))];
    list.extend(state.read(|conn| Ok(played_maps(conn, puuid))).unwrap_or_default().into_iter().map(Report::MapHistory));
    compute(state, puuid, list, &cancelled);
}

fn played_maps(conn: &rusqlite::Connection, puuid: &str) -> Vec<String> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(m.map_id, m.map_name, '') AS map FROM match_players p JOIN matches m ON m.match_id = p.match_id
         WHERE p.puuid = ?1 AND m.queue = 'competitive' AND map <> ''
         GROUP BY map ORDER BY MAX(m.started_at) DESC",
    ) else {
        return Vec::new();
    };
    stmt.query_map([puuid], |row| row.get::<_, String>(0))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(name: &str) -> (AppState, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("valtracker-warm-{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        (AppState::new(crate::db::open(&path).unwrap(), path.clone()), path)
    }

    #[test]
    fn stops_when_a_newer_request_arrives() {
        let (state, path) = state("cancel");
        run(&state, "p", &|| true);
        assert!(state.cached_entries().0.is_empty());
        run(&state, "p", &|| false);
        assert!(state.cached_json(&Report::Agents(None).key("p")).is_some());
        assert!(state.cached_json(&Report::Flaws.key("p")).is_some());
        drop(state);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn serves_the_newest_request_once_ready() {
        let warmer = Warmer::default();
        warmer.request("a".into());
        warmer.request("b".into());
        assert!(warmer.pending());
        warmer.set_ready();
        assert_eq!(warmer.next(), "b");
        assert!(!warmer.pending());
    }
}
