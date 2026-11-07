use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub region: String,
    pub platform: String,
    pub account_level: Option<i64>,
    pub card_id: Option<String>,
    pub tier: Option<i64>,
    pub tier_name: Option<String>,
    pub rr: Option<i64>,
    pub peak_tier: Option<i64>,
    pub peak_tier_name: Option<String>,
    pub peak_season: Option<String>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub puuid: String,
    pub stage: String,
    pub new_matches: usize,
    pub running: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub new_matches: usize,
    pub finished_at: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LobbyAverages {
    pub acs: f64,
    pub adr: f64,
    pub kd: f64,
    pub hs_pct: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub matches: i64,
    pub wins: i64,
    pub losses: i64,
    pub rounds: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub adr: f64,
    pub kd: f64,
    pub kad: f64,
    pub hs_pct: f64,
    pub win_pct: f64,
    pub kills_per_round: f64,
    pub lobby: LobbyAverages,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentMatch {
    pub match_id: String,
    pub puuid: String,
    pub started_at: String,
    pub map_name: Option<String>,
    pub queue: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub acs: f64,
    pub won: bool,
    pub rounds_won: i64,
    pub rounds_lost: i64,
    pub place: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub short: String,
    pub matches: i64,
}
