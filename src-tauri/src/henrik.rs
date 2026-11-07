use reqwest::{Client, Response, StatusCode, Url};
use serde::Deserialize;
use serde_json::Value;
use serde_json::value::RawValue;
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::http;
use crate::i18n::{english, tr};

const BASE_URL: &str = "https://api.henrikdev.xyz/valorant/";
const MAX_ATTEMPTS: usize = 4;
const MIN_WAIT_SECS: u64 = 1;
const MAX_WAIT_SECS: u64 = 120;

#[derive(Deserialize)]
struct Page {
    #[serde(default)]
    data: Option<Vec<Box<RawValue>>>,
}

pub struct Henrik {
    client: Client,
    key: String,
}

impl Henrik {
    pub fn new(key: impl Into<String>) -> AppResult<Self> {
        Ok(Self { client: http::client()?, key: key.into() })
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

    pub async fn accolades(&self, region: &str, platform: &str, puuid: &str) -> AppResult<Value> {
        self.get(&["v1", "by-puuid", "accolades", region, platform, puuid], &[]).await
    }

    pub async fn agent_mastery(&self, region: &str, platform: &str, puuid: &str) -> AppResult<Value> {
        self.get(&["v1", "by-puuid", "agent-mastery", region, platform, puuid], &[]).await
    }

    pub async fn matches(
        &self,
        region: &str,
        platform: &str,
        puuid: &str,
        mode: &str,
        start: usize,
        size: usize,
    ) -> AppResult<Vec<Box<RawValue>>> {
        let body = self
            .fetch(
                &["v4", "by-puuid", "matches", region, platform, puuid],
                &[("mode", mode.to_string()), ("start", start.to_string()), ("size", size.to_string())],
            )
            .await?;
        Ok(serde_json::from_slice::<Page>(&body).ok().and_then(|page| page.data).unwrap_or_default())
    }

    pub async fn match_detail(&self, region: &str, match_id: &str) -> AppResult<Value> {
        self.get(&["v4", "match", region, match_id], &[]).await
    }

    pub async fn queue_status(&self, region: &str) -> AppResult<Value> {
        self.get(&["v1", "queue-status", region], &[]).await
    }

    pub async fn stored_matches(&self, region: &str, puuid: &str, mode: &str) -> AppResult<Value> {
        self.get(&["v1", "by-puuid", "stored-matches", region, puuid], &[("mode", mode.to_string())]).await
    }

    pub async fn crosshair(&self, code: &str) -> AppResult<Vec<u8>> {
        self.fetch(&["v1", "crosshair", "generate"], &[("id", code.to_string())]).await
    }

    pub async fn website(&self, locale: &str, category: &str) -> AppResult<Value> {
        self.get(&["v1", "website", locale], &[("category", category.to_string())]).await
    }

    async fn get(&self, segments: &[&str], query: &[(&str, String)]) -> AppResult<Value> {
        let body = self.fetch(segments, query).await?;
        Ok(match serde_json::from_slice(&body).unwrap_or(Value::Null) {
            Value::Object(mut map) => map.remove("data").unwrap_or(Value::Null),
            _ => Value::Null,
        })
    }

    async fn fetch(&self, segments: &[&str], query: &[(&str, String)]) -> AppResult<Vec<u8>> {
        let url = build_url(segments, query)?;
        for _ in 0..MAX_ATTEMPTS {
            let response = self.client.get(url.clone()).header("Authorization", &self.key).send().await?;
            let status = response.status();
            let reset = header_secs(&response, "x-ratelimit-reset").unwrap_or(60);
            if status == StatusCode::TOO_MANY_REQUESTS {
                let wait = header_secs(&response, "retry-after").unwrap_or(reset);
                tokio::time::sleep(pause(wait)).await;
                continue;
            }
            let remaining = header_secs(&response, "x-ratelimit-remaining");
            let body = http::body(response).await?;
            if !status.is_success() {
                return Err(api_error(status, &serde_json::from_slice(&body).unwrap_or(Value::Null)));
            }
            if remaining == Some(0) {
                tokio::time::sleep(pause(reset)).await;
            }
            return Ok(body);
        }
        Err(AppError::RateLimited)
    }
}

fn build_url(segments: &[&str], query: &[(&str, String)]) -> AppResult<Url> {
    let mut url = Url::parse(BASE_URL).map_err(|e| AppError::Invalid(e.to_string()))?;
    url.path_segments_mut()
        .map_err(|_| AppError::Invalid(tr("URL invalide", "Invalid URL").into()))?
        .pop_if_empty()
        .extend(segments);
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query);
    }
    Ok(url)
}

fn pause(secs: u64) -> Duration {
    Duration::from_secs(secs.clamp(MIN_WAIT_SECS, MAX_WAIT_SECS))
}

fn header_secs(response: &Response, name: &str) -> Option<u64> {
    response.headers().get(name)?.to_str().ok()?.trim().parse().ok()
}

fn api_error(status: StatusCode, body: &Value) -> AppError {
    let detail = body
        .pointer("/errors/0/message")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let english = english();
    let message = match status.as_u16() {
        401 | 403 => tr("Clé API HenrikDev invalide ou expirée", "HenrikDev API key invalid or expired").to_string(),
        404 => return AppError::NotFound,
        code if detail.is_empty() && english => format!("The HenrikDev API returned error {code}"),
        code if detail.is_empty() => format!("L'API HenrikDev a répondu avec l'erreur {code}"),
        code if english => format!("The HenrikDev API returned error {code}: {detail}"),
        code => format!("L'API HenrikDev a répondu avec l'erreur {code} : {detail}"),
    };
    AppError::Api(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn games(body: &str) -> Vec<String> {
        serde_json::from_str::<Page>(body)
            .ok()
            .and_then(|page| page.data)
            .unwrap_or_default()
            .into_iter()
            .map(|raw| raw.get().to_string())
            .collect()
    }

    #[test]
    fn reads_a_page_one_match_at_a_time() {
        assert_eq!(games(r#"{"status":200,"data":[{"a":1},{"b":"x\"y"}]}"#), [r#"{"a":1}"#, r#"{"b":"x\"y"}"#]);
        assert!(games(r#"{"status":200,"data":null}"#).is_empty());
        assert!(games(r#"{"status":200}"#).is_empty());
        assert!(games(r#"{"status":200,"data":{"a":1}}"#).is_empty());
        assert!(games("not json").is_empty());
    }
}
