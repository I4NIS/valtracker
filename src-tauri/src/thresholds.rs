use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::i18n::{decimal, english, tr};
use crate::reports;
use crate::state::AppState;
use crate::sync::ACTIVE_ACCOUNT_SETTING;

pub const THRESHOLDS_SETTING: &str = "thresholds";

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Thresholds {
    pub trade_window_ms: i64,
    pub isolation_meters: f64,
    pub full_buy: i64,
    pub same_spot: usize,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self { trade_window_ms: 3000, isolation_meters: 15.0, full_buy: 3900, same_spot: 3 }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdSettings {
    pub values: Thresholds,
    pub defaults: Thresholds,
}

impl Thresholds {
    pub fn validate(&self) -> AppResult<()> {
        if !(1000..=10_000).contains(&self.trade_window_ms) {
            return Err(AppError::Invalid(
                tr("La fenêtre de trade doit être entre 1 et 10 secondes", "The trade window must be between 1 and 10 seconds").into(),
            ));
        }
        if !(5.0..=40.0).contains(&self.isolation_meters) {
            return Err(AppError::Invalid(
                tr("La distance d'isolement doit être entre 5 et 40 m", "The isolation distance must be between 5 and 40 m").into(),
            ));
        }
        if !(2000..=5000).contains(&self.full_buy) {
            return Err(AppError::Invalid(
                tr("Le full buy doit être entre 2000 et 5000 crédits", "The full buy must be between 2000 and 5000 credits").into(),
            ));
        }
        if !(2..=6).contains(&self.same_spot) {
            return Err(AppError::Invalid(
                tr("Le nombre de morts au même spot doit être entre 2 et 6", "Deaths at the same spot must be between 2 and 6").into(),
            ));
        }
        Ok(())
    }

    pub fn load(conn: &Connection) -> AppResult<Self> {
        Ok(db::get_setting(conn, THRESHOLDS_SETTING)?
            .and_then(|raw| serde_json::from_str::<Thresholds>(&raw).ok())
            .filter(|value| value.validate().is_ok())
            .unwrap_or_default())
    }

    pub fn save(&self, conn: &Connection) -> AppResult<()> {
        self.validate()?;
        let raw = serde_json::to_string(self).map_err(|err| AppError::Invalid(err.to_string()))?;
        db::set_setting(conn, THRESHOLDS_SETTING, &raw)
    }

    pub fn trade_window_text(&self) -> String {
        if self.trade_window_ms == 1000 {
            return tr("dans la seconde", "within 1 second").into();
        }
        let seconds = self.trade_window_ms as f64 / 1000.0;
        let value = decimal(seconds, if self.trade_window_ms % 1000 == 0 { 0 } else { 1 });
        if english() { format!("within {value} seconds") } else { format!("dans les {value} secondes") }
    }
}

#[tauri::command(async)]
pub fn get_thresholds(state: State<'_, AppState>) -> AppResult<ThresholdSettings> {
    Ok(ThresholdSettings { values: Thresholds::load(&*state.conn()?)?, defaults: Thresholds::default() })
}

#[tauri::command(async)]
pub fn set_thresholds(app: AppHandle, state: State<'_, AppState>, thresholds: Thresholds) -> AppResult<ThresholdSettings> {
    let active = {
        let conn = state.conn()?;
        thresholds.save(&conn)?;
        conn.execute("DELETE FROM match_summaries", [])?;
        db::get_setting(&conn, ACTIVE_ACCOUNT_SETTING)?
    };
    state.invalidate();
    let _ = app.emit("data-changed", ());
    if let Some(puuid) = active {
        reports::warm(&app, puuid);
    }
    Ok(ThresholdSettings { values: thresholds, defaults: Thresholds::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        conn
    }

    #[test]
    fn defaults_are_valid() {
        assert!(Thresholds::default().validate().is_ok());
    }

    #[test]
    fn rejects_out_of_range_values() {
        let base = Thresholds::default();
        let cases = [
            Thresholds { trade_window_ms: 999, ..base },
            Thresholds { trade_window_ms: 10_001, ..base },
            Thresholds { isolation_meters: 4.9, ..base },
            Thresholds { isolation_meters: 40.5, ..base },
            Thresholds { full_buy: 1999, ..base },
            Thresholds { full_buy: 5001, ..base },
            Thresholds { same_spot: 1, ..base },
            Thresholds { same_spot: 7, ..base },
        ];
        for case in cases {
            assert!(case.validate().is_err(), "{case:?}");
        }
    }

    #[test]
    fn accepts_bounds() {
        let low = Thresholds { trade_window_ms: 1000, isolation_meters: 5.0, full_buy: 2000, same_spot: 2 };
        let high = Thresholds { trade_window_ms: 10_000, isolation_meters: 40.0, full_buy: 5000, same_spot: 6 };
        assert!(low.validate().is_ok());
        assert!(high.validate().is_ok());
    }

    #[test]
    fn saves_and_loads() {
        let conn = memory();
        assert_eq!(Thresholds::load(&conn).unwrap(), Thresholds::default());
        let custom = Thresholds { trade_window_ms: 4500, isolation_meters: 20.0, full_buy: 4200, same_spot: 4 };
        custom.save(&conn).unwrap();
        assert_eq!(Thresholds::load(&conn).unwrap(), custom);
        assert!(Thresholds { same_spot: 9, ..custom }.save(&conn).is_err());
        assert_eq!(Thresholds::load(&conn).unwrap(), custom);
    }

    #[test]
    fn falls_back_to_defaults_on_bad_setting() {
        let conn = memory();
        db::set_setting(&conn, THRESHOLDS_SETTING, "{\"tradeWindowMs\": 50}").unwrap();
        assert_eq!(Thresholds::load(&conn).unwrap(), Thresholds::default());
        db::set_setting(&conn, THRESHOLDS_SETTING, "pas du json").unwrap();
        assert_eq!(Thresholds::load(&conn).unwrap(), Thresholds::default());
        db::set_setting(&conn, THRESHOLDS_SETTING, "{\"sameSpot\": 4}").unwrap();
        assert_eq!(Thresholds::load(&conn).unwrap(), Thresholds { same_spot: 4, ..Thresholds::default() });
    }

    #[test]
    fn describes_trade_window() {
        let base = Thresholds::default();
        assert_eq!(base.trade_window_text(), "dans les 3 secondes");
        assert_eq!(Thresholds { trade_window_ms: 1000, ..base }.trade_window_text(), "dans la seconde");
        assert_eq!(Thresholds { trade_window_ms: 2500, ..base }.trade_window_text(), "dans les 2,5 secondes");
        crate::i18n::set("en");
        assert_eq!(base.trade_window_text(), "within 3 seconds");
        assert_eq!(Thresholds { trade_window_ms: 1000, ..base }.trade_window_text(), "within 1 second");
        assert_eq!(Thresholds { trade_window_ms: 2500, ..base }.trade_window_text(), "within 2.5 seconds");
        crate::i18n::set("fr");
    }
}
