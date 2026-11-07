use reqwest::{Client, Response};
use std::sync::OnceLock;
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::i18n::tr;

const MAX_BODY: usize = 16 * 1024 * 1024;

static CLIENT: OnceLock<Client> = OnceLock::new();

pub fn install_crypto() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

pub fn client() -> AppResult<Client> {
    if let Some(client) = CLIENT.get() {
        return Ok(client.clone());
    }
    install_crypto();
    let client = Client::builder().timeout(Duration::from_secs(30)).user_agent("Valtracker").https_only(true).build()?;
    Ok(CLIENT.get_or_init(|| client).clone())
}

fn too_large() -> AppError {
    AppError::Api(tr("Réponse du serveur trop volumineuse", "Server response too large").into())
}

pub async fn body(mut response: Response) -> AppResult<Vec<u8>> {
    if response.content_length().is_some_and(|length| length > MAX_BODY as u64) {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if body.len() + chunk.len() > MAX_BODY {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
