use serde::{Serialize, Serializer};
use std::fmt::Display;

use crate::i18n::{english, tr};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{}", labeled("Erreur de base de données", "Database error", .0))]
    Db(#[from] rusqlite::Error),
    #[error("{}", labeled("Erreur réseau", "Network error", .0))]
    Http(#[from] reqwest::Error),
    #[error("{}", labeled("Erreur de fichier", "File error", .0))]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Api(String),
    #[error("{}", tr("Joueur ou match introuvable", "Player or match not found"))]
    NotFound,
    #[error("{}", tr("Limite de requêtes atteinte, réessaie dans une minute", "Rate limit reached, try again in a minute"))]
    RateLimited,
    #[error("{}", tr("HenrikDev ne répond pas pour le moment", "HenrikDev is not responding right now"))]
    Unavailable,
    #[error("{0}")]
    Invalid(String),
}

fn labeled(fr: &str, en: &str, detail: &dyn Display) -> String {
    if english() { format!("{en}: {detail}") } else { format!("{fr} : {detail}") }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
