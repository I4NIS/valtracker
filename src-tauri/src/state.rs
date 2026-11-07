use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::ipc::Response;

use crate::error::{AppError, AppResult};
use crate::i18n::tr;

const CACHE_LIMIT: usize = 400;

#[derive(Default)]
struct Cache {
    generation: u64,
    entries: HashMap<String, String>,
}

pub struct AppState {
    db: Mutex<Connection>,
    cache: Mutex<Cache>,
    pub db_path: PathBuf,
    pub sync_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new(conn: Connection, db_path: PathBuf) -> Self {
        Self { db: Mutex::new(conn), cache: Mutex::default(), db_path, sync_lock: tokio::sync::Mutex::new(()) }
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::Invalid(tr("La base de données est indisponible", "The database is unavailable").into()))
    }

    fn cache(&self) -> MutexGuard<'_, Cache> {
        self.cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn generation(&self) -> u64 {
        self.cache().generation
    }

    pub fn cached_json(&self, key: &str) -> Option<String> {
        self.cache().entries.get(key).cloned()
    }

    pub fn store_json(&self, key: String, json: String, generation: u64) {
        let mut cache = self.cache();
        if cache.generation != generation {
            return;
        }
        if cache.entries.len() >= CACHE_LIMIT {
            cache.entries.clear();
        }
        cache.entries.insert(key, json);
    }

    pub fn cached(&self, key: String, compute: impl FnOnce(&Connection) -> AppResult<String>) -> AppResult<Response> {
        if let Some(json) = self.cached_json(&key) {
            return Ok(Response::new(json));
        }
        let generation = self.generation();
        let json = compute(&*self.conn()?)?;
        self.store_json(key, json.clone(), generation);
        Ok(Response::new(json))
    }

    pub fn invalidate(&self) {
        let mut cache = self.cache();
        cache.generation += 1;
        cache.entries.clear();
    }

    pub fn forget(&self, matches: impl Fn(&str) -> bool) {
        self.cache().entries.retain(|key, _| !matches(key));
    }
}
