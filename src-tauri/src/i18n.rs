use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::Connection;

use crate::db;

pub const LANGUAGE_SETTING: &str = "language";

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn english() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

pub fn set(code: &str) {
    ENGLISH.store(code == "en", Ordering::Relaxed);
}

pub fn load(conn: &Connection) {
    if let Ok(Some(code)) = db::get_setting(conn, LANGUAGE_SETTING) {
        set(&code);
    }
}

pub fn tr(fr: &'static str, en: &'static str) -> &'static str {
    if english() { en } else { fr }
}
