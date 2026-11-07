use rusqlite::backup::Backup;
use rusqlite::config::DbConfig;
use rusqlite::{Connection, OpenFlags, params};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::assets;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::i18n::tr;
use crate::state::AppState;
use crate::sync::{ACTIVE_ACCOUNT_SETTING, API_KEY_SETTING};

const PAGES_PER_STEP: i32 = 512;
const SECRET_SETTINGS: [&str; 1] = [API_KEY_SETTING];
const CACHED_TABLES: [&str; 2] = ["maps", "agents"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub path: String,
    pub accounts: i64,
    pub matches: i64,
}

fn not_valtracker() -> AppError {
    AppError::Invalid(tr("Ce fichier n'est pas une base Valtracker", "This file is not a Valtracker database").into())
}

fn open_untrusted(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| not_valtracker())?;
    harden(&conn).map_err(|_| not_valtracker())?;
    Ok(conn)
}

fn harden(conn: &Connection) -> rusqlite::Result<()> {
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)?;
    conn.execute_batch("PRAGMA trusted_schema = OFF;")
}

fn internal(kind: &str, name: &str, without_sql: bool) -> bool {
    match kind {
        "index" => without_sql && name.starts_with("sqlite_autoindex_"),
        "table" => matches!(name, "sqlite_sequence" | "sqlite_stat1" | "sqlite_stat4"),
        _ => false,
    }
}

fn schema(conn: &Connection) -> rusqlite::Result<BTreeSet<(String, String, String)>> {
    let mut stmt = conn.prepare("SELECT type, name, tbl_name, sql IS NULL FROM sqlite_master")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, bool>(3)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows
        .into_iter()
        .filter(|(kind, name, _, without_sql)| !internal(kind, name, *without_sql))
        .map(|(kind, name, table, _)| (kind, name, table))
        .collect())
}

fn expected_schema(version: i64) -> AppResult<BTreeSet<(String, String, String)>> {
    let reference = Connection::open_in_memory()?;
    db::migrate_to(&reference, version)?;
    Ok(schema(&reference)?)
}

fn verify(conn: &Connection) -> AppResult<i64> {
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).map_err(|_| not_valtracker())?;
    if version < 1 {
        return Err(not_valtracker());
    }
    if version > db::schema_version() {
        return Err(AppError::Invalid(
            tr("Cette base vient d'une version plus récente de Valtracker", "This database comes from a newer version of Valtracker").into(),
        ));
    }
    let found = schema(conn).map_err(|_| not_valtracker())?;
    if found != expected_schema(version)? {
        return Err(not_valtracker());
    }
    Ok(version)
}

fn table_exists(conn: &Connection, table: &str) -> AppResult<bool> {
    let found: i64 =
        conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1", params![table], |row| row.get(0))?;
    Ok(found > 0)
}

fn scrub(conn: &Connection) -> AppResult<()> {
    for key in SECRET_SETTINGS.iter().chain([&assets::REFRESHED_SETTING]) {
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    }
    for table in CACHED_TABLES {
        if table_exists(conn, table)? {
            conn.execute_batch(&format!("DELETE FROM {table};"))?;
        }
    }
    Ok(())
}

pub fn inspect(path: &Path) -> AppResult<ImportCandidate> {
    let conn = open_untrusted(path)?;
    verify(&conn)?;
    let count = |sql: &str| conn.query_row(sql, [], |row| row.get::<_, i64>(0)).map_err(|_| not_valtracker());
    Ok(ImportCandidate {
        path: path.display().to_string(),
        accounts: count("SELECT COUNT(*) FROM accounts")?,
        matches: count("SELECT COUNT(*) FROM matches")?,
    })
}

pub fn export_to(source: &Path, target: &Path) -> AppResult<()> {
    if same_file(source, target) {
        return Err(AppError::Invalid(
            tr("Choisis un autre emplacement que la base actuelle", "Choose a location other than the current database").into(),
        ));
    }
    let mut name = target.file_name().unwrap_or_default().to_owned();
    name.push(".valtracker-export.tmp");
    let temp = target.with_file_name(name);
    remove_with_journals(&temp);
    let result = write_export(source, &temp).and_then(|()| Ok(std::fs::rename(&temp, target)?));
    remove_with_journals(&temp);
    result
}

fn write_export(source: &Path, temp: &Path) -> AppResult<()> {
    let conn = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    conn.execute("VACUUM INTO ?1", params![temp.to_string_lossy()])?;
    drop(conn);
    let copy = Connection::open_with_flags(temp, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    copy.execute_batch("PRAGMA secure_delete = ON; PRAGMA journal_mode = MEMORY;")?;
    for key in SECRET_SETTINGS {
        copy.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    }
    copy.execute_batch("VACUUM;")?;
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
    let from = open_untrusted(source)?;
    let mut copy = Connection::open(temp)?;
    harden(&copy)?;
    Backup::new(&from, &mut copy)?.run_to_completion(PAGES_PER_STEP, Duration::ZERO, None)?;
    drop(from);
    verify(&copy)?;
    scrub(&copy)?;
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
        return Err(AppError::Invalid(
            tr("Ce fichier est déjà ta base actuelle", "This file is already your current database").into(),
        ));
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
    let builder = app.dialog().file().add_filter(tr("Base Valtracker", "Valtracker database"), &["db"]);
    match app.get_webview_window("main") {
        Some(window) => builder.set_parent(&window),
        None => builder,
    }
}

async fn chosen(receiver: tokio::sync::oneshot::Receiver<Option<FilePath>>) -> AppResult<Option<PathBuf>> {
    let Some(path) = receiver.await.ok().flatten() else {
        return Ok(None);
    };
    path.into_path().map(Some).map_err(|_| AppError::Invalid(tr("Emplacement invalide", "Invalid location").into()))
}

async fn blocking<T: Send + 'static>(task: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|err| AppError::Invalid(err.to_string()))?
}

#[tauri::command]
pub async fn export_database(app: AppHandle, file_name: String) -> AppResult<Option<String>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog(&app).set_title(tr("Exporter la base", "Export the database")).set_file_name(file_name).save_file(move |path| {
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
    dialog(&app).set_title(tr("Importer une base", "Import a database")).pick_file(move |path| {
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
        crate::i18n::load(&live);
        db::get_setting(&live, ACTIVE_ACCOUNT_SETTING)
    })
    .await?;
    crate::tray::relabel(&app);
    state.invalidate();
    let _ = app.emit("data-changed", active.clone().unwrap_or_default());
    if let Some(puuid) = active.clone() {
        crate::reports::warm(&app, puuid);
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = handle.state::<AppState>();
        if assets::refresh_if_needed(&state).await.is_err() {
            return;
        }
        state.invalidate();
        let _ = handle.emit("data-changed", active.clone().unwrap_or_default());
        if let Some(puuid) = active {
            crate::reports::warm(&handle, puuid);
        }
    });
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
    fn rejects_a_database_with_a_trigger() {
        let scratch = Scratch::new();
        let path = scratch.path("trigger.db");
        let conn = db::open(&path).unwrap();
        conn.execute_batch("CREATE TRIGGER wipe AFTER INSERT ON accounts BEGIN DELETE FROM matches; END;").unwrap();
        drop(conn);
        assert!(inspect(&path).is_err());
        let live_path = scratch.path("valtracker.db");
        let mut live = db::open(&live_path).unwrap();
        assert!(replace(&mut live, &live_path, &path).is_err());
    }

    #[test]
    fn rejects_a_database_with_a_view_or_an_extra_index() {
        let scratch = Scratch::new();
        let view = scratch.path("view.db");
        let conn = db::open(&view).unwrap();
        conn.execute_batch("CREATE VIEW everything AS SELECT * FROM settings;").unwrap();
        drop(conn);
        assert!(inspect(&view).is_err());

        let index = scratch.path("index.db");
        let conn = db::open(&index).unwrap();
        conn.execute_batch("CREATE INDEX extra ON settings(value);").unwrap();
        drop(conn);
        assert!(inspect(&index).is_err());
    }

    #[test]
    fn accepts_an_older_schema() {
        let scratch = Scratch::new();
        let path = scratch.path("old.db");
        let conn = Connection::open(&path).unwrap();
        db::migrate_to(&conn, 3).unwrap();
        drop(conn);
        assert!(inspect(&path).is_ok());
    }

    #[test]
    fn import_never_adopts_the_imported_key_or_assets() {
        let scratch = Scratch::new();
        let other_path = scratch.path("other.db");
        let other = db::open(&other_path).unwrap();
        account(&other, "imported");
        db::set_setting(&other, API_KEY_SETTING, "attacker-key").unwrap();
        db::set_setting(&other, assets::REFRESHED_SETTING, "99999999999").unwrap();
        other
            .execute_batch(
                "INSERT INTO maps (uuid, name, display_icon, x_multiplier, y_multiplier, x_scalar, y_scalar, splash)
                 VALUES ('m', 'Map', 'https://evil.example/a.png', 1, 1, 0, 0, 'https://evil.example/b.png');
                 INSERT INTO agents (uuid, name, icon) VALUES ('a', 'Agent', 'https://evil.example/c.png');",
            )
            .unwrap();
        drop(other);

        let live_path = scratch.path("valtracker.db");
        let mut live = db::open(&live_path).unwrap();
        replace(&mut live, &live_path, &other_path).unwrap();
        assert_eq!(db::get_setting(&live, API_KEY_SETTING).unwrap(), None);
        assert_eq!(db::get_setting(&live, assets::REFRESHED_SETTING).unwrap(), None);
        let cached: i64 = live
            .query_row("SELECT (SELECT COUNT(*) FROM maps) + (SELECT COUNT(*) FROM agents)", [], |row| row.get(0))
            .unwrap();
        assert_eq!(cached, 0);
    }

    #[test]
    fn export_leaves_out_the_api_key() {
        let scratch = Scratch::new();
        let live_path = scratch.path("valtracker.db");
        let live = db::open(&live_path).unwrap();
        account(&live, "a");
        db::set_setting(&live, API_KEY_SETTING, "HDEV-secret-key-to-hide").unwrap();
        db::set_setting(&live, "theme", "dark").unwrap();
        let export_path = scratch.path("export.db");
        std::fs::write(&export_path, "ancien export").unwrap();
        export_to(&live_path, &export_path).unwrap();
        drop(live);

        let bytes = std::fs::read(&export_path).unwrap();
        assert!(!bytes.windows(b"HDEV-secret-key-to-hide".len()).any(|window| window == b"HDEV-secret-key-to-hide"));
        let exported = Connection::open(&export_path).unwrap();
        assert_eq!(db::get_setting(&exported, API_KEY_SETTING).unwrap(), None);
        assert_eq!(db::get_setting(&exported, "theme").unwrap().as_deref(), Some("dark"));
        let leftovers: Vec<_> = std::fs::read_dir(&scratch.0)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn refuses_to_import_the_live_database() {
        let scratch = Scratch::new();
        let live_path = scratch.path("valtracker.db");
        let mut live = db::open(&live_path).unwrap();
        assert!(replace(&mut live, &live_path, &live_path).is_err());
    }
}
