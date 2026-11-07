use reqwest::{Client, Response, StatusCode, Url};
use serde_json::Value;
use std::time::Duration;

use crate::error::{AppError, AppResult};

const BASE_URL: &str = "https://api.henrikdev.xyz/valorant/";
const MAX_ATTEMPTS: usize = 4;

pub struct Henrik {
    client: Client,
    key: String,
}

impl Henrik {
    pub fn new(key: impl Into<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Valtracker")
            .build()
            .unwrap_or_default();
        Self { client, key: key.into() }
    }

    pub async fn account(&self, name: &str, tag: &str) -> AppResult<Value> {
        self.get(&["v2", "account", name, tag], &[]).await
    }

    pub async fn mmr(&self, region: &str, platform: &str, puuid: &str) -> AppResult<Value> {
        self.get(&["v3", "by-puuid", "mmr", region, platform, puuid], &[]).await
    }

    pub async fn mmr_history(&self, region: &str, platform: &str, puuid: &str) -> AppResult<Value> {
        self.get(&["v2", "by-puuid", "stored-mmr-history", region, platform, puuid], &[]).await
    }

    pub async fn matches(
        &self,
        region: &str,
        platform: &str,
        puuid: &str,
        mode: &str,
        start: usize,
        size: usize,
    ) -> AppResult<Value> {
        self.get(
            &["v4", "by-puuid", "matches", region, platform, puuid],
            &[("mode", mode.to_string()), ("start", start.to_string()), ("size", size.to_string())],
        )
        .await
    }

    async fn get(&self, segments: &[&str], query: &[(&str, String)]) -> AppResult<Value> {
        let url = build_url(segments, query)?;
        for _ in 0..MAX_ATTEMPTS {
            let response = self.client.get(url.clone()).header("Authorization", &self.key).send().await?;
            let status = response.status();
            let reset = header_secs(&response, "x-ratelimit-reset").unwrap_or(60);
            if status == StatusCode::TOO_MANY_REQUESTS {
                let wait = header_secs(&response, "retry-after").unwrap_or(reset);
                tokio::time::sleep(Duration::from_secs(wait.max(1))).await;
                continue;
            }
            let remaining = header_secs(&response, "x-ratelimit-remaining");
            let body: Value = response.json().await.unwrap_or(Value::Null);
            if !status.is_success() {
                return Err(api_error(status, &body));
            }
            if remaining == Some(0) {
                tokio::time::sleep(Duration::from_secs(reset.max(1))).await;
            }
            return Ok(body.get("data").cloned().unwrap_or(Value::Null));
        }
        Err(AppError::RateLimited)
    }
}

fn build_url(segments: &[&str], query: &[(&str, String)]) -> AppResult<Url> {
    let mut url = Url::parse(BASE_URL).map_err(|e| AppError::Invalid(e.to_string()))?;
    url.path_segments_mut()
        .map_err(|_| AppError::Invalid("URL invalide".into()))?
        .pop_if_empty()
        .extend(segments);
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query);
    }
    Ok(url)
}

fn header_secs(response: &Response, name: &str) -> Option<u64> {
    response.headers().get(name)?.to_str().ok()?.trim().parse().ok()
}

fn api_error(status: StatusCode, body: &Value) -> AppError {
    let detail = body
        .pointer("/errors/0/message")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let message = match status.as_u16() {
        401 | 403 => "Clé API HenrikDev invalide ou expirée".to_string(),
        404 => "Joueur ou match introuvable".to_string(),
        code if detail.is_empty() => format!("L'API HenrikDev a répondu avec l'erreur {code}"),
        code => format!("L'API HenrikDev a répondu avec l'erreur {code} : {detail}"),
    };
    AppError::Api(message)
}
