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

pub fn integer(value: i64) -> String {
    let digits = value.unsigned_abs().to_string();
    let separator = if english() { ',' } else { '\u{202f}' };
    let mut grouped = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push(separator);
        }
        grouped.push(digit);
    }
    if value < 0 { format!("-{grouped}") } else { grouped }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integer_groups_thousands_per_language() {
        set("fr");
        assert_eq!(integer(4000), "4\u{202f}000");
        assert_eq!(integer(950), "950");
        assert_eq!(integer(-12500), "-12\u{202f}500");
        set("en");
        assert_eq!(integer(4000), "4,000");
        set("fr");
    }
}
