use rusqlite::{Connection, Row, params};
use serde::Serialize;
use std::collections::HashMap;

use crate::agent_stats::{self, FirstKills};
use crate::assets;
use crate::duels::{DuelAcc, GameRow};
use crate::error::{AppError, AppResult};
use crate::game::Game;
use crate::map_stats::{MAP_COLUMNS, MAP_JOINS, MapAcc, RAW_COLUMN};
use crate::storage;
use crate::weapon_stats::{self, Histories, HistoryAcc, WeaponFacts};

const COMPETITIVE: &str = "competitive";

pub struct Batch {
    pub agents: Option<String>,
    pub maps: Option<String>,
    pub weapons: Option<String>,
    pub duels: Option<String>,
    pub histories: Histories,
}

#[derive(Default)]
struct Scope {
    maps: MapAcc,
    duels: DuelAcc,
    histories: HistoryAcc,
}

struct Known {
    roles: HashMap<String, String>,
    firsts: HashMap<String, FirstKills>,
    weapons: HashMap<String, WeaponFacts>,
}

fn json<T: Serialize>(value: AppResult<T>) -> Option<String> {
    value.and_then(|value| serde_json::to_string(&value).map_err(|err| AppError::Invalid(err.to_string()))).ok()
}

impl Scope {
    fn add(&mut self, conn: &Connection, row: &Row, game: Option<&Game>, puuid: &str, info: &GameRow) -> AppResult<()> {
        self.maps.add(conn, row, game, puuid)?;
        if let Some(game) = game {
            self.duels.add(game, puuid, info);
            self.histories.add(game, &info.match_id, &info.started_at, puuid);
        }
        Ok(())
    }

    fn finish(self, conn: &Connection, puuid: &str, season: Option<&str>, known: &Known) -> Batch {
        Batch {
            agents: json(agent_stats::agent_stats_from(conn, puuid, season, &known.firsts)),
            maps: json(Ok(self.maps.finish())),
            weapons: json(weapon_stats::report_from(conn, puuid, season, &known.weapons)),
            duels: json(Ok(self.duels.finish(&known.roles))),
            histories: self.histories.finish(),
        }
    }
}

pub fn scan(
    conn: &Connection,
    puuid: &str,
    current: Option<&str>,
    cancelled: &dyn Fn() -> bool,
    emit: &mut dyn FnMut(Option<&str>, Batch),
) -> AppResult<bool> {
    let mut known = Known { roles: assets::agent_roles(conn)?, firsts: HashMap::new(), weapons: HashMap::new() };
    let season_rows: i64 = match current {
        Some(season) => conn.query_row(
            "SELECT COUNT(*) FROM match_players p JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid = ?1 AND m.queue = ?2 AND m.season_short = ?3",
            params![puuid, COMPETITIVE, season],
            |row| row.get(0),
        )?,
        None => 0,
    };
    let mut all = Scope::default();
    let mut season = current.map(|_| Scope::default());
    let mut seen = 0;
    let mut stmt = conn.prepare(&format!(
        "SELECT {MAP_COLUMNS}, m.match_id, m.started_at, m.map_id, m.map_name, m.season_short {MAP_JOINS}
         WHERE p.puuid = ?1 AND m.queue = ?2
         ORDER BY m.started_at DESC"
    ))?;
    let mut rows = stmt.query(params![puuid, COMPETITIVE])?;
    while let Some(row) = rows.next()? {
        if cancelled() {
            return Ok(false);
        }
        let info = GameRow { match_id: row.get(20)?, started_at: row.get(21)?, map_id: row.get(22)?, map_name: row.get(23)? };
        let in_season = current.is_some() && row.get::<_, Option<String>>(24)?.as_deref() == current;
        let json = row.get_ref(RAW_COLUMN)?.as_bytes().ok().and_then(storage::inflate);
        let game = json.as_deref().and_then(Game::parse);
        all.add(conn, row, game.as_ref(), puuid, &info)?;
        if let Some(game) = &game {
            known.firsts.insert(info.match_id.clone(), agent_stats::first_kills(game, puuid));
            known.weapons.insert(info.match_id.clone(), weapon_stats::facts(game, puuid));
        }
        if !in_season {
            continue;
        }
        if let Some(scope) = season.as_mut() {
            scope.add(conn, row, game.as_ref(), puuid, &info)?;
        }
        seen += 1;
        if seen == season_rows {
            if let Some(scope) = season.take() {
                emit(current, scope.finish(conn, puuid, current, &known));
            }
        }
    }
    drop(rows);
    drop(stmt);
    if cancelled() {
        return Ok(false);
    }
    if let Some(scope) = season.take() {
        emit(current, scope.finish(conn, puuid, current, &known));
    }
    emit(None, all.finish(conn, puuid, None, &known));
    Ok(true)
}
