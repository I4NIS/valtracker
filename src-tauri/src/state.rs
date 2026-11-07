use rusqlite::Connection;
use std::sync::{Mutex, MutexGuard};

use crate::error::{AppError, AppResult};

pub struct AppState {
    db: Mutex<Connection>,
    pub sync_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self { db: Mutex::new(conn), sync_lock: tokio::sync::Mutex::new(()) }
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::Invalid("La base de données est indisponible".into()))
    }
}
