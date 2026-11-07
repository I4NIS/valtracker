use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, TryLockError};
use tauri::ipc::Response;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::i18n::tr;

const CACHE_LIMIT: usize = 400;
const READERS: usize = 2;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Default)]
pub struct Flight {
    done: Mutex<bool>,
    signal: Condvar,
}

impl Flight {
    fn wait(&self) {
        let mut done = lock(&self.done);
        while !*done {
            done = self.signal.wait(done).unwrap_or_else(|poisoned| poisoned.into_inner());
        }
    }

    fn finish(&self) {
        *lock(&self.done) = true;
        self.signal.notify_all();
    }
}

pub struct Claim<'a> {
    state: &'a AppState,
    key: String,
    generation: u64,
    flight: Arc<Flight>,
}

impl Claim<'_> {
    pub fn store(self, json: String) {
        self.state.store_json(self.key.clone(), json, self.generation);
    }
}

impl Drop for Claim<'_> {
    fn drop(&mut self) {
        let mut cache = self.state.cache();
        if cache.flights.get(&self.key).is_some_and(|flight| Arc::ptr_eq(flight, &self.flight)) {
            cache.flights.remove(&self.key);
        }
        drop(cache);
        self.flight.finish();
    }
}

enum Slot<'a> {
    Cached(String),
    Claimed(Claim<'a>),
    Busy(Arc<Flight>),
}

#[derive(Default)]
struct Cache {
    generation: u64,
    entries: HashMap<String, String>,
    flights: HashMap<String, Arc<Flight>>,
}

pub struct AppState {
    db: Mutex<Connection>,
    readers: Vec<Mutex<Option<Connection>>>,
    next_reader: AtomicUsize,
    cache: Mutex<Cache>,
    pub db_path: PathBuf,
    pub sync_lock: tokio::sync::Mutex<()>,
    import_source: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(conn: Connection, db_path: PathBuf) -> Self {
        Self {
            db: Mutex::new(conn),
            readers: (0..READERS).map(|_| Mutex::default()).collect(),
            next_reader: AtomicUsize::new(0),
            cache: Mutex::default(),
            db_path,
            sync_lock: tokio::sync::Mutex::new(()),
            import_source: Mutex::default(),
        }
    }

    pub fn set_import_source(&self, path: Option<PathBuf>) {
        *lock(&self.import_source) = path;
    }

    pub fn import_source(&self) -> Option<PathBuf> {
        lock(&self.import_source).clone()
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::Invalid(tr("La base de données est indisponible", "The database is unavailable").into()))
    }

    fn reader(&self) -> MutexGuard<'_, Option<Connection>> {
        for slot in &self.readers {
            match slot.try_lock() {
                Ok(guard) => return guard,
                Err(TryLockError::Poisoned(poisoned)) => return poisoned.into_inner(),
                Err(TryLockError::WouldBlock) => {}
            }
        }
        lock(&self.readers[self.next_reader.fetch_add(1, Ordering::Relaxed) % READERS])
    }

    pub fn read<T>(&self, task: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let mut slot = self.reader();
        let conn = match slot.take() {
            Some(conn) => conn,
            None => db::open_reader(&self.db_path)?,
        };
        let result = task(&conn);
        *slot = Some(conn);
        result
    }

    pub fn reset_readers(&self) {
        for slot in &self.readers {
            *lock(slot) = None;
        }
    }

    fn cache(&self) -> MutexGuard<'_, Cache> {
        lock(&self.cache)
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

    fn slot(&self, key: &str) -> Slot<'_> {
        let mut cache = self.cache();
        if let Some(json) = cache.entries.get(key) {
            return Slot::Cached(json.clone());
        }
        if let Some(flight) = cache.flights.get(key) {
            return Slot::Busy(flight.clone());
        }
        let flight = Arc::new(Flight::default());
        cache.flights.insert(key.to_string(), flight.clone());
        Slot::Claimed(Claim { state: self, key: key.to_string(), generation: cache.generation, flight })
    }

    pub fn cached(&self, key: String, compute: impl FnOnce(&Connection) -> AppResult<String>) -> AppResult<Response> {
        let claim = loop {
            match self.slot(&key) {
                Slot::Cached(json) => return Ok(Response::new(json)),
                Slot::Claimed(claim) => break claim,
                Slot::Busy(flight) => flight.wait(),
            }
        };
        let json = self.read(compute)?;
        claim.store(json.clone());
        Ok(Response::new(json))
    }

    pub fn invalidate(&self) {
        let mut cache = self.cache();
        cache.generation += 1;
        cache.entries.clear();
        drop(cache);
        crate::stats::forget_groups();
    }

    pub fn forget(&self, matches: impl Fn(&str) -> bool) {
        self.cache().entries.retain(|key, _| !matches(key));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    pub fn temp_state(name: &str) -> (AppState, PathBuf) {
        let path = std::env::temp_dir().join(format!("valtracker-state-{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        (AppState::new(db::open(&path).unwrap(), path.clone()), path)
    }

    #[test]
    fn computes_a_key_once_for_concurrent_requests() {
        let (state, path) = temp_state("flight");
        let calls = AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for _ in 0..4 {
                scope.spawn(|| {
                    state
                        .cached("key".into(), |conn| {
                            calls.fetch_add(1, Ordering::SeqCst);
                            std::thread::sleep(Duration::from_millis(100));
                            Ok(conn.query_row("SELECT 'value'", [], |row| row.get(0))?)
                        })
                        .unwrap();
                });
            }
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(state.cached_json("key").as_deref(), Some("value"));
        drop(state);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn recomputes_after_a_failed_computation() {
        let (state, path) = temp_state("failure");
        assert!(state.cached("key".into(), |_| Err(AppError::NotFound)).is_err());
        assert!(state.cached("key".into(), |_| Ok("value".into())).is_ok());
        assert_eq!(state.cached_json("key").as_deref(), Some("value"));
        drop(state);
        let _ = std::fs::remove_file(path);
    }
}
