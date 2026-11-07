use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Erreur de base de données : {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Erreur réseau : {0}")]
    Http(#[from] reqwest::Error),
    #[error("Erreur de fichier : {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Api(String),
    #[error("Limite de requêtes atteinte, réessaie dans une minute")]
    RateLimited,
    #[error("{0}")]
    Invalid(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
