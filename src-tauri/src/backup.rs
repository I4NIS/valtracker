use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags, params};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::sync::{ACTIVE_ACCOUNT_SETTING, API_KEY_SETTING};

const REQUIRED_TABLES: [&str; 5] = ["settings", "accounts", "matches", "match_players", "mmr_history"];
const FILTER_NAME: &str = "Base Valtracker";
const PAGES_PER_STEP: i32 = 512;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub path: String,
    pub accounts: i64,
    pub matches: i64,
}

fn not_valtracker() -> AppError {
    AppError::Invalid("Ce fichier n'est pas une base Valtracker".into())
}

pub fn inspect(path: &Path) -> AppResult<ImportCandidate> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| not_valtracker())?;
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).map_err(|_| not_valtracker())?;
    if version < 1 {
        return Err(not_valtracker());
    }
    if version > db::schema_version() {
        return Err(AppError::Invalid("Cette base vient d'une version plus récente de Valtracker".into()));
    }
    for table in REQUIRED_TABLES {
        let found: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1", params![table], |row| row.get(0))
            .map_err(|_| not_valtracker())?;
        if found == 0 {
            return Err(not_valtracker());
        }
    }
    let count = |sql: &str| conn.query_row(sql, [], |row| row.get::<_, i64>(0)).map_err(|_| not_valtracker());
    Ok(ImportCandidate {
        path: path.display().to_string(),
        accounts: count("SELECT COUNT(*) FROM accounts")?,
        matches: count("SELECT COUNT(*) FROM matches")?,
    })
}

pub fn export_to(source: &Path, target: &Path) -> AppResult<()> {
    if same_file(source, target) {
        return Err(AppError::Invalid("Choisis un autre emplacement que la base actuelle".into()));
    }
    if target.exists() {
        std::fs::remove_file(target)?;
    }
    let conn = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    conn.execute("VACUUM INTO ?1", params![target.to_string_lossy()])?;
    Ok(())
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

fn remove_with_journals(path: &Path) {
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let mut name = path.as_os_str().to_owned();
        name.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(name));
    }
}

fn prepare(source: &Path, temp: &Path, page_size: i64, api_key: Option<&str>) -> AppResult<()> {
    let from = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| not_valtracker())?;
    let mut copy = Connection::open(temp)?;
    Backup::new(&from, &mut copy)?.run_to_completion(PAGES_PER_STEP, Duration::ZERO, None)?;
    drop(from);
    copy.execute_batch("PRAGMA journal_mode = DELETE;")?;
    copy.pragma_update(None, "page_size", page_size)?;
    copy.execute_batch("VACUUM;")?;
    db::migrate(&copy)?;
    if let Some(key) = api_key {
        db::set_setting(&copy, API_KEY_SETTING, key)?;
    }
    Ok(())
}

pub fn replace(live: &mut Connection, live_path: &Path, source: &Path) -> AppResult<ImportCandidate> {
    if same_file(live_path, source) {
        return Err(AppError::Invalid("Ce fichier est déjà ta base actuelle".into()));
    }
    let candidate = inspect(source)?;
    let api_key = db::get_setting(live, API_KEY_SETTING)?.filter(|key| !key.is_empty());
    let page_size: i64 = live.pragma_query_value(None, "page_size", |row| row.get(0))?;
    let temp = live_path.with_file_name("valtracker-import.tmp.db");
    remove_with_journals(&temp);
    let result = prepare(source, &temp, page_size, api_key.as_deref()).and_then(|()| {
        let copy = Connection::open_with_flags(&temp, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
        Backup::new(&copy, live)?.run_to_completion(PAGES_PER_STEP, Duration::from_millis(5), None)?;
        Ok(())
    });
    remove_with_journals(&temp);
    result?;
    db::migrate(live)?;
    Ok(candidate)
}

fn dialog(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
    let builder = app.dialog().file().add_filter(FILTER_NAME, &["db"]);
    match app.get_webview_window("main") {
        Some(window) => builder.set_parent(&window),
        None => builder,
    }
}

async fn chosen(receiver: tokio::sync::oneshot::Receiver<Option<FilePath>>) -> AppResult<Option<PathBuf>> {
    let Some(path) = receiver.await.ok().flatten() else {
        return Ok(None);
    };
    path.into_path().map(Some).map_err(|_| AppError::Invalid("Emplacement invalide".into()))
}

async fn blocking<T: Send + 'static>(task: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|err| AppError::Invalid(err.to_string()))?
}

#[tauri::command]
pub async fn export_database(app: AppHandle, file_name: String) -> AppResult<Option<String>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog(&app).set_title("Exporter la base").set_file_name(file_name).save_file(move |path| {
        let _ = sender.send(path);
    });
    let Some(target) = chosen(receiver).await? else {
        return Ok(None);
    };
    let source = app.state::<AppState>().db_path.clone();
    let shown = target.display().to_string();
    blocking(move || export_to(&source, &target)).await?;
    Ok(Some(shown))
}

#[tauri::command]
pub async fn pick_database_import(app: AppHandle) -> AppResult<Option<ImportCandidate>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog(&app).set_title("Importer une base").pick_file(move |path| {
        let _ = sender.send(path);
    });
    let Some(source) = chosen(receiver).await? else {
        return Ok(None);
    };
    blocking(move || inspect(&source)).await.map(Some)
}

#[tauri::command]
pub async fn import_database(app: AppHandle, path: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let _sync = state.sync_lock.lock().await;
    let handle = app.clone();
    let active = blocking(move || {
        let state = handle.state::<AppState>();
        let mut live = state.conn()?;
        replace(&mut live, &state.db_path, Path::new(&path))?;
        db::get_setting(&live, ACTIVE_ACCOUNT_SETTING)
    })
    .await?;
    state.invalidate();
    let _ = app.emit("data-changed", active.clone().unwrap_or_default());
    if let Some(puuid) = active {
        crate::reports::warm(&app, puuid);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "valtracker-backup-test-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn account(conn: &Connection, puuid: &str) {
        conn.execute(
            "INSERT INTO accounts (puuid, name, tag, region) VALUES (?1, 'Joueur', 'EUW', 'eu')",
            params![puuid],
        )
        .unwrap();
    }

    #[test]
    fn accepts_a_valtracker_database() {
        let scratch = Scratch::new();
        let path = scratch.path("valtracker.db");
        let conn = db::open(&path).unwrap();
        account(&conn, "a");
        drop(conn);
        let candidate = inspect(&path).unwrap();
        assert_eq!(candidate.accounts, 1);
        assert_eq!(candidate.matches, 0);
    }

    #[test]
    fn rejects_a_text_file() {
        let scratch = Scratch::new();
        let path = scratch.path("notes.db");
        std::fs::write(&path, "ceci n'est pas une base de données SQLite, juste du texte pour le test").unwrap();
        assert!(inspect(&path).is_err());
    }

    #[test]
    fn rejects_an_unrelated_sqlite_database() {
        let scratch = Scratch::new();
        let path = scratch.path("other.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE things (id INTEGER); PRAGMA user_version = 3;").unwrap();
        drop(conn);
        assert!(inspect(&path).is_err());
    }

    #[test]
    fn rejects_a_newer_schema() {
        let scratch = Scratch::new();
        let path = scratch.path("future.db");
        let conn = db::open(&path).unwrap();
        conn.pragma_update(None, "user_version", db::schema_version() + 1).unwrap();
        drop(conn);
        assert!(inspect(&path).is_err());
    }

    #[test]
    fn rejects_a_missing_file() {
        let scratch = Scratch::new();
        assert!(inspect(&scratch.path("absent.db")).is_err());
    }

    #[test]
    fn export_then_import_keeps_the_current_key() {
        let scratch = Scratch::new();
        let other_path = scratch.path("other.db");
        let other = db::open(&other_path).unwrap();
        account(&other, "imported");
        db::set_setting(&other, API_KEY_SETTING, "old-key").unwrap();
        drop(other);
        let export_path = scratch.path("export.db");
        export_to(&other_path, &export_path).unwrap();

        let live_path = scratch.path("valtracker.db");
        let mut live = db::open(&live_path).unwrap();
        account(&live, "current");
        db::set_setting(&live, API_KEY_SETTING, "current-key").unwrap();

        let candidate = replace(&mut live, &live_path, &export_path).unwrap();
        assert_eq!(candidate.accounts, 1);
        let puuids: Vec<String> = live
            .prepare("SELECT puuid FROM accounts")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(puuids, vec!["imported".to_string()]);
        assert_eq!(db::get_setting(&live, API_KEY_SETTING).unwrap().as_deref(), Some("current-key"));
        let version: i64 = live.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
        assert_eq!(version, db::schema_version());
        assert!(!scratch.path("valtracker-import.tmp.db").exists());
    }

    #[test]
    fn refuses_to_import_the_live_database() {
        let scratch = Scratch::new();
        let live_path = scratch.path("valtracker.db");
        let mut live = db::open(&live_path).unwrap();
        assert!(replace(&mut live, &live_path, &live_path).is_err());
    }
}
