use rusqlite::Connection;

use crate::db;

pub const LANGUAGE_SETTING: &str = "language";

#[cfg(not(test))]
static ENGLISH: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(test)]
thread_local! {
    static ENGLISH: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(not(test))]
pub fn english() -> bool {
    ENGLISH.load(std::sync::atomic::Ordering::Relaxed)
}

#[cfg(test)]
pub fn english() -> bool {
    ENGLISH.with(std::cell::Cell::get)
}

#[cfg(not(test))]
pub fn set(code: &str) {
    ENGLISH.store(code == "en", std::sync::atomic::Ordering::Relaxed);
}

#[cfg(test)]
pub fn set(code: &str) {
    ENGLISH.with(|flag| flag.set(code == "en"));
}

pub fn load(conn: &Connection) {
    set(&db::get_setting(conn, LANGUAGE_SETTING).ok().flatten().unwrap_or_default());
}

pub fn tr(fr: &'static str, en: &'static str) -> &'static str {
    if english() { en } else { fr }
}

pub fn decimal(value: f64, digits: usize) -> String {
    let text = format!("{value:.digits$}");
    if english() { text } else { text.replace('.', ",") }
}
