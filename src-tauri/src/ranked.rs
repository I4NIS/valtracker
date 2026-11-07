use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankState {
    pub shields: Option<i64>,
    pub protection_status: Option<String>,
    pub protected_tier: Option<bool>,
    pub games_needed_for_rating: Option<i64>,
    pub games_needed_for_leaderboard: Option<i64>,
    pub leaderboard_rank: Option<i64>,
    pub last_derank_protected: Option<bool>,
    pub last_protection_replenished: Option<bool>,
    pub last_placement: Option<bool>,
}

impl RankState {
    pub fn from_mmr(mmr: &Value) -> Option<Self> {
        let current = mmr.get("current")?;
        let latest = mmr.get("latest_update").filter(|value| value.is_object());
        let flag = |pointer: &str| latest.and_then(|value| value.pointer(pointer)).and_then(Value::as_bool);
        Some(Self {
            shields: current.get("rank_protection_shields").and_then(Value::as_i64),
            protection_status: current.get("rank_protection_status").and_then(Value::as_str).map(str::to_string),
            protected_tier: current.get("is_at_rank_protected_tier").and_then(Value::as_bool),
            games_needed_for_rating: current.get("games_needed_for_rating").and_then(Value::as_i64),
            games_needed_for_leaderboard: current.get("games_needed_for_leaderboard").and_then(Value::as_i64),
            leaderboard_rank: current.pointer("/leaderboard_placement/rank").and_then(Value::as_i64),
            last_derank_protected: flag("/was_derank_protected"),
            last_protection_replenished: flag("/was_derank_protection_replenished"),
            last_placement: flag("/is_placement_match"),
        })
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RrDetail {
    pub change: Option<i64>,
    pub rr_after: Option<i64>,
    pub tier_after: Option<i64>,
    pub tier_after_name: Option<String>,
    pub rr_before: Option<i64>,
    pub tier_before: Option<i64>,
    pub tier_before_name: Option<String>,
    pub performance_bonus: Option<i64>,
    pub penalty: Option<f64>,
    pub afk_penalty: Option<i64>,
    pub refunded: Option<i64>,
    pub derank_protected: Option<bool>,
    pub protection_replenished: Option<bool>,
    pub map_incentive_forgiven: Option<i64>,
    pub placement: Option<bool>,
}

impl RrDetail {
    fn has_details(&self) -> bool {
        self.rr_before.is_some()
            || self.tier_before.is_some()
            || self.performance_bonus.is_some_and(|value| value != 0)
            || self.penalty.is_some_and(|value| value != 0.0)
            || self.afk_penalty.is_some_and(|value| value != 0)
            || self.refunded.is_some_and(|value| value != 0)
            || self.derank_protected == Some(true)
            || self.protection_replenished == Some(true)
            || self.map_incentive_forgiven.is_some_and(|value| value != 0)
            || self.placement == Some(true)
    }
}

pub fn rr_detail(conn: &Connection, puuid: &str, match_id: &str) -> AppResult<Option<RrDetail>> {
    let detail = conn
        .query_row(
            "SELECT last_change, rr, tier, tier_name, rr_before_update, tier_before_update, tier_before_update_name,
                    rr_performance_bonus, rr_penalty, afk_penalty, refunded_rr, was_derank_protected,
                    was_derank_protection_replenished, new_map_incentive_rr_forgiven, is_placement_match
             FROM mmr_history WHERE puuid = ?1 AND match_id = ?2",
            params![puuid, match_id],
            |row| {
                Ok(RrDetail {
                    change: row.get(0)?,
                    rr_after: row.get(1)?,
                    tier_after: row.get(2)?,
                    tier_after_name: row.get(3)?,
                    rr_before: row.get(4)?,
                    tier_before: row.get(5)?,
                    tier_before_name: row.get(6)?,
                    performance_bonus: row.get(7)?,
                    penalty: row.get(8)?,
                    afk_penalty: row.get(9)?,
                    refunded: row.get(10)?,
                    derank_protected: row.get(11)?,
                    protection_replenished: row.get(12)?,
                    map_incentive_forgiven: row.get(13)?,
                    placement: row.get(14)?,
                })
            },
        )
        .optional()?;
    Ok(detail.filter(RrDetail::has_details))
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RrSum {
    pub total: f64,
    pub matches: i64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RrBreakdown {
    pub detailed: i64,
    pub performance_bonus: RrSum,
    pub penalty: RrSum,
    pub afk_penalty: RrSum,
    pub refunded: RrSum,
    pub map_incentive_forgiven: RrSum,
    pub derank_protected: i64,
    pub protection_replenished: i64,
    pub placements: i64,
}

fn sum(row: &rusqlite::Row, index: usize) -> rusqlite::Result<RrSum> {
    Ok(RrSum { total: row.get::<_, Option<f64>>(index)?.unwrap_or(0.0), matches: row.get(index + 1)? })
}

pub fn breakdown(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<RrBreakdown> {
    Ok(conn.query_row(
        "SELECT COUNT(rr_before_update),
                SUM(CASE WHEN rr_performance_bonus <> 0 THEN rr_performance_bonus END), COUNT(CASE WHEN rr_performance_bonus <> 0 THEN 1 END),
                SUM(CASE WHEN rr_penalty <> 0 THEN ABS(rr_penalty) END), COUNT(CASE WHEN rr_penalty <> 0 THEN 1 END),
                SUM(CASE WHEN afk_penalty <> 0 THEN ABS(afk_penalty) END), COUNT(CASE WHEN afk_penalty <> 0 THEN 1 END),
                SUM(CASE WHEN refunded_rr <> 0 THEN refunded_rr END), COUNT(CASE WHEN refunded_rr <> 0 THEN 1 END),
                SUM(CASE WHEN new_map_incentive_rr_forgiven <> 0 THEN new_map_incentive_rr_forgiven END),
                COUNT(CASE WHEN new_map_incentive_rr_forgiven <> 0 THEN 1 END),
                COUNT(CASE WHEN was_derank_protected = 1 THEN 1 END),
                COUNT(CASE WHEN was_derank_protection_replenished = 1 THEN 1 END),
                COUNT(CASE WHEN is_placement_match = 1 THEN 1 END)
         FROM mmr_history WHERE puuid = ?1 AND (?2 IS NULL OR season_short = ?2)",
        params![puuid, season],
        |row| {
            Ok(RrBreakdown {
                detailed: row.get(0)?,
                performance_bonus: sum(row, 1)?,
                penalty: sum(row, 3)?,
                afk_penalty: sum(row, 5)?,
                refunded: sum(row, 7)?,
                map_incentive_forgiven: sum(row, 9)?,
                derank_protected: row.get(11)?,
                protection_replenished: row.get(12)?,
                placements: row.get(13)?,
            })
        },
    )?)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TierRef {
    pub id: Option<i64>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Act {
    pub season_id: String,
    pub season_short: Option<String>,
    pub games: i64,
    pub wins: i64,
    pub end_tier: Option<i64>,
    pub end_tier_name: Option<String>,
    pub end_rr: Option<i64>,
    pub ranking_schema: Option<String>,
    pub act_rank_tier: Option<i64>,
    pub act_rank_name: Option<String>,
    pub act_wins: Vec<TierRef>,
    pub leaderboard_rank: Option<i64>,
}

fn tier_ref(value: &Value) -> TierRef {
    TierRef {
        id: value.get("id").and_then(Value::as_i64),
        name: value.get("name").and_then(Value::as_str).map(str::to_string),
    }
}

fn seasons_fingerprint(conn: &Connection, puuid: &str) -> AppResult<Option<String>> {
    Ok(conn.query_row(
        "SELECT group_concat(season_id || ':' || games || ':' || wins || ':' || coalesce(end_tier, '') || ':' || coalesce(end_rr, '')
                || ':' || coalesce(end_tier_name, '') || ':' || coalesce(act_rank_name, '') || ':' || act_wins || ':' || coalesce(leaderboard_rank, '')
                || ':' || coalesce(prestige, ''), '|')
         FROM (SELECT * FROM account_seasons WHERE puuid = ?1 ORDER BY position)",
        params![puuid],
        |row| row.get(0),
    )?)
}

pub fn store_seasons(conn: &Connection, puuid: &str, mmr: &Value) -> AppResult<bool> {
    let Some(seasons) = mmr.get("seasonal").and_then(Value::as_array) else {
        return Ok(false);
    };
    let before = seasons_fingerprint(conn, puuid)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM account_seasons WHERE puuid = ?1", params![puuid])?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO account_seasons
                (puuid, season_id, season_short, position, games, wins, end_tier, end_tier_name, end_rr, ranking_schema,
                 act_rank_tier, act_rank_name, act_wins, leaderboard_rank, prestige)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )?;
        for (position, season) in seasons.iter().enumerate() {
            let Some(season_id) = season.pointer("/season/id").and_then(Value::as_str) else {
                continue;
            };
            let wins: Vec<TierRef> = season.get("act_wins").and_then(Value::as_array).map(|list| list.iter().map(tier_ref).collect()).unwrap_or_default();
            let prestige = season.get("prestige").filter(|value| value.is_object()).map(Value::to_string);
            stmt.execute(params![
                puuid,
                season_id,
                season.pointer("/season/short").and_then(Value::as_str),
                position as i64,
                season.get("games").and_then(Value::as_i64).unwrap_or(0),
                season.get("wins").and_then(Value::as_i64).unwrap_or(0),
                season.pointer("/end_tier/id").and_then(Value::as_i64),
                season.pointer("/end_tier/name").and_then(Value::as_str),
                season.get("end_rr").and_then(Value::as_i64),
                season.get("ranking_schema").and_then(Value::as_str),
                season.pointer("/act_rank/id").and_then(Value::as_i64),
                season.pointer("/act_rank/name").and_then(Value::as_str),
                serde_json::to_string(&wins).unwrap_or_else(|_| "[]".into()),
                season.pointer("/leaderboard_placement/rank").and_then(Value::as_i64),
                prestige,
            ])?;
        }
    }
    tx.commit()?;
    Ok(seasons_fingerprint(conn, puuid)? != before)
}

pub fn acts(conn: &Connection, puuid: &str) -> AppResult<Vec<Act>> {
    let mut stmt = conn.prepare(
        "SELECT season_id, season_short, games, wins, end_tier, end_tier_name, end_rr, ranking_schema,
                act_rank_tier, act_rank_name, act_wins, leaderboard_rank
         FROM account_seasons WHERE puuid = ?1 ORDER BY position DESC",
    )?;
    let acts = stmt
        .query_map(params![puuid], |row| {
            Ok(Act {
                season_id: row.get(0)?,
                season_short: row.get(1)?,
                games: row.get(2)?,
                wins: row.get(3)?,
                end_tier: row.get(4)?,
                end_tier_name: row.get(5)?,
                end_rr: row.get(6)?,
                ranking_schema: row.get(7)?,
                act_rank_tier: row.get(8)?,
                act_rank_name: row.get(9)?,
                act_wins: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or_default(),
                leaderboard_rank: row.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(acts)
}

#[tauri::command(async)]
pub fn get_acts(state: tauri::State<'_, AppState>, puuid: String) -> AppResult<tauri::ipc::Response> {
    state.cached(format!("{puuid}|Acts"), |conn| {
        serde_json::to_string(&acts(conn, &puuid)?).map_err(|err| AppError::Invalid(err.to_string()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repo};
    use serde_json::json;

    fn entry(match_id: &str, extra: serde_json::Value) -> serde_json::Value {
        let mut base = json!({
            "match_id": match_id,
            "date": format!("2026-01-0{}T10:00:00Z", match_id.len()),
            "season": {"id": "s", "short": "e10a1"},
            "map": {"id": "m", "name": "Ascent"},
            "tier": {"id": 14, "name": "Gold 3"},
            "rr": 49,
            "last_change": 15,
            "elo": 1149,
            "refunded_rr": 0,
            "was_derank_protected": false,
        });
        if let (Some(base), Some(extra)) = (base.as_object_mut(), extra.as_object()) {
            for (key, value) in extra {
                base.insert(key.clone(), value.clone());
            }
        }
        base
    }

    #[test]
    fn reads_the_rank_protection_state() {
        let mmr = json!({
            "current": {"tier": {"id": 14, "name": "Gold 3"}, "rr": 10, "rank_protection_shields": 2, "is_at_rank_protected_tier": true,
                        "games_needed_for_rating": 0, "games_needed_for_leaderboard": 40, "leaderboard_placement": null},
            "latest_update": {"was_derank_protected": true, "is_placement_match": null}
        });
        let state = RankState::from_mmr(&mmr).unwrap();
        assert_eq!(state.shields, Some(2));
        assert_eq!(state.protected_tier, Some(true));
        assert_eq!(state.games_needed_for_rating, Some(0));
        assert_eq!(state.leaderboard_rank, None);
        assert_eq!(state.last_derank_protected, Some(true));
        assert_eq!(state.last_placement, None);
        assert!(RankState::from_mmr(&json!({})).is_none());
    }

    #[test]
    fn stores_every_act_and_reports_changes() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        db::migrate(&conn).unwrap();
        conn.execute("INSERT INTO accounts (puuid, name, tag, region) VALUES ('me', 'Moi', 'EUW', 'eu')", []).unwrap();
        let mmr = json!({"seasonal": [
            {"season": {"id": "s1", "short": "e8a1"}, "games": 30, "wins": 17, "end_tier": {"id": 15, "name": "Platinum 1"}, "end_rr": 40,
             "ranking_schema": "ascendant", "act_wins": [{"id": 15, "name": "Platinum 1"}, {"id": 14, "name": "Gold 3"}], "act_rank": {"id": 15, "name": "Platinum 1"},
             "wins_with_placements": 18, "games_needed_for_rating": 0, "leaderboard_placement": null, "prestige": null},
            {"season": {"id": "s2", "short": "e8a2"}, "games": 5, "wins": 2, "end_tier": {"id": 14, "name": "Gold 3"}, "end_rr": 12,
             "ranking_schema": "ascendant", "act_wins": [], "act_rank": {"id": 0, "name": "Unrated"}, "wins_with_placements": 2, "games_needed_for_rating": 0}
        ]});
        assert!(store_seasons(&conn, "me", &mmr).unwrap());
        assert!(!store_seasons(&conn, "me", &mmr).unwrap());
        assert!(!store_seasons(&conn, "me", &json!({"current": {}})).unwrap());
        let list = acts(&conn, "me").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].season_short.as_deref(), Some("e8a2"));
        assert_eq!(list[1].act_wins.len(), 2);
        assert_eq!(list[1].act_wins[1].name.as_deref(), Some("Gold 3"));
        conn.execute("DELETE FROM accounts WHERE puuid = 'me'", []).unwrap();
        assert!(acts(&conn, "me").unwrap().is_empty());
    }

    #[test]
    fn keeps_known_details_and_reports_changes() {
        let mut conn = Connection::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        let first = json!([entry("a", json!({})), entry("bb", json!({}))]);
        assert_eq!(repo::upsert_mmr_history(&mut conn, "me", &first).unwrap(), 2);
        assert_eq!(repo::upsert_mmr_history(&mut conn, "me", &first).unwrap(), 0);
        assert!(rr_detail(&conn, "me", "a").unwrap().is_none());

        let enriched = json!([
            entry("a", json!({"rr_before_update": 34, "rr_performance_bonus": 3, "rr_penalty": -4.0, "was_derank_protected": true, "tier_before_update": {"id": 14, "name": "Gold 3"}})),
            entry("bb", json!({"rr_before_update": 20, "rr_performance_bonus": 2, "is_placement_match": true})),
        ]);
        assert_eq!(repo::upsert_mmr_history(&mut conn, "me", &enriched).unwrap(), 2);
        assert_eq!(repo::upsert_mmr_history(&mut conn, "me", &enriched).unwrap(), 0);
        let without_details = json!([{"match_id": "a", "date": "2026-01-01T10:00:00Z", "season": {"id": "s", "short": "e10a1"}, "map": {"id": "m", "name": "Ascent"}, "tier": {"id": 14, "name": "Gold 3"}, "rr": 49, "last_change": 15, "elo": 1149}]);
        assert_eq!(repo::upsert_mmr_history(&mut conn, "me", &without_details).unwrap(), 0);

        let detail = rr_detail(&conn, "me", "a").unwrap().unwrap();
        assert_eq!(detail.rr_before, Some(34));
        assert_eq!(detail.performance_bonus, Some(3));
        assert_eq!(detail.derank_protected, Some(true));
        assert_eq!(detail.tier_before_name.as_deref(), Some("Gold 3"));

        let totals = breakdown(&conn, "me", Some("e10a1")).unwrap();
        assert_eq!(totals.detailed, 2);
        assert_eq!(totals.performance_bonus.total, 5.0);
        assert_eq!(totals.performance_bonus.matches, 2);
        assert_eq!(totals.penalty.total, 4.0);
        assert_eq!(totals.penalty.matches, 1);
        assert_eq!(totals.derank_protected, 1);
        assert_eq!(totals.placements, 1);
        assert_eq!(breakdown(&conn, "me", Some("e9a1")).unwrap().detailed, 0);
    }
}
