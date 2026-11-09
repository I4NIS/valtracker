use rusqlite::{Connection, Row, params};
use serde::Serialize;
use std::collections::HashMap;

use crate::analysis::attack_side;
use crate::assets::{self, MapData};
use crate::error::AppResult;
use crate::game::Game;
use crate::state::AppState;
use crate::storage;

const COMPETITIVE: &str = "competitive";
const PLANT_SPOTS: usize = 400;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePlants {
    pub site: String,
    pub plants: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlantSpot {
    pub x: f64,
    pub y: f64,
    pub site: Option<String>,
    pub won: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapStat {
    pub map_id: String,
    pub name: String,
    pub splash: Option<String>,
    pub list_icon: Option<String>,
    pub minimap: Option<String>,
    pub rotation: i32,
    pub matches: i64,
    pub wins: i64,
    pub losses: i64,
    pub draws: i64,
    pub win_pct: f64,
    pub acs: f64,
    pub kd: f64,
    pub adr: f64,
    pub hs_pct: f64,
    pub rr_net: i64,
    pub rr_matches: i64,
    pub rounds: i64,
    pub played_ms: i64,
    pub analyzed: i64,
    pub attack_played: i64,
    pub attack_won: i64,
    pub defense_played: i64,
    pub defense_won: i64,
    pub pistol_played: i64,
    pub pistol_won: i64,
    pub plants: i64,
    pub plant_sites: Vec<SitePlants>,
    pub plant_spots: Vec<PlantSpot>,
    pub retakes_played: i64,
    pub retakes_won: i64,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub agent_matches: i64,
    pub agent_wins: i64,
}

#[derive(Default)]
struct Totals {
    stat: MapStat,
    score: i64,
    kills: i64,
    deaths: i64,
    headshots: i64,
    shots: i64,
    damage: i64,
    sites: HashMap<String, i64>,
    agents: HashMap<String, (String, i64, i64)>,
}

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 { numerator / denominator } else { 0.0 }
}

fn rounds_of(game: &Game, puuid: &str, map: Option<&MapData>, stat: &mut MapStat, sites: &mut HashMap<String, i64>) -> bool {
    let Some(team) = game.player(puuid).and_then(|player| player.team_id.get()) else {
        return false;
    };
    let rounds = &game.rounds;
    if rounds.is_empty() {
        return false;
    }
    let attack_first = game.attacks_first(team);
    for (index, round) in rounds.iter().enumerate() {
        let attack = attack_side(index, attack_first);
        let won = round.winning_team.get() == Some(team);
        if attack {
            stat.attack_played += 1;
            stat.attack_won += won as i64;
        } else {
            stat.defense_played += 1;
            stat.defense_won += won as i64;
        }
        if index == 0 || index == 12 {
            stat.pistol_played += 1;
            stat.pistol_won += won as i64;
        }
        if let Some(plant) = &round.plant {
            if attack {
                stat.plants += 1;
                let site = plant.site.get().map(str::trim).filter(|site| !site.is_empty()).map(str::to_uppercase);
                if let Some(site) = &site {
                    *sites.entry(site.clone()).or_default() += 1;
                }
                if let (Some(map), Some(spot)) = (map, plant.location.get()) {
                    if stat.plant_spots.len() < PLANT_SPOTS {
                        let (x, y) = map.project(spot.0, spot.1);
                        stat.plant_spots.push(PlantSpot { x, y, site, won });
                    }
                }
            } else {
                stat.retakes_played += 1;
                stat.retakes_won += won as i64;
            }
        }
    }
    true
}

pub const MAP_COLUMNS: &str = "COALESCE(m.map_id, m.map_name, ''), COALESCE(m.map_name, mp.name, ''), mp.splash,
        p.agent_id, p.agent_name, p.won, p.rounds_won, p.rounds_lost, m.rounds,
        p.score, p.kills, p.deaths, p.headshots, p.headshots + p.bodyshots + p.legshots, p.damage_dealt,
        h.last_change, m.raw, mp.list_icon, mp.display_icon, COALESCE(m.game_length_ms, 0)";

pub const MAP_JOINS: &str = "FROM match_players p
     JOIN matches m ON m.match_id = p.match_id
     LEFT JOIN maps mp ON mp.uuid = m.map_id
     LEFT JOIN mmr_history h ON h.puuid = p.puuid AND h.match_id = p.match_id";

pub const RAW_COLUMN: usize = 16;

#[derive(Default)]
pub struct MapAcc {
    totals: HashMap<String, Totals>,
    layouts: HashMap<String, Option<MapData>>,
}

impl MapAcc {
    pub fn add(&mut self, conn: &Connection, row: &Row, game: Option<&Game>, puuid: &str) -> AppResult<()> {
        let map_id: String = row.get(0)?;
        if map_id.is_empty() {
            return Ok(());
        }
        if !self.layouts.contains_key(&map_id) {
            self.layouts.insert(map_id.clone(), assets::load_map(conn, &map_id)?);
        }
        let layout = self.layouts.get(&map_id).and_then(Option::as_ref);
        let entry = self.totals.entry(map_id.clone()).or_default();
        let stat = &mut entry.stat;
        if stat.map_id.is_empty() {
            stat.map_id = map_id;
            stat.name = row.get(1)?;
            stat.splash = assets::trusted_image(row.get(2)?);
            stat.list_icon = assets::trusted_image(row.get(17)?);
            stat.minimap = assets::trusted_image(row.get(18)?);
            stat.rotation = layout.map_or(0, MapData::rotation);
        }
        let agent_id: Option<String> = row.get(3)?;
        let agent_name: Option<String> = row.get(4)?;
        let won: bool = row.get(5)?;
        let draw = !won && row.get::<_, i64>(6)? == row.get::<_, i64>(7)?;
        stat.matches += 1;
        stat.wins += won as i64;
        stat.draws += draw as i64;
        stat.rounds += row.get::<_, i64>(8)?;
        stat.played_ms += row.get::<_, i64>(19)?;
        entry.score += row.get::<_, i64>(9)?;
        entry.kills += row.get::<_, i64>(10)?;
        entry.deaths += row.get::<_, i64>(11)?;
        entry.headshots += row.get::<_, i64>(12)?;
        entry.shots += row.get::<_, i64>(13)?;
        entry.damage += row.get::<_, i64>(14)?;
        if let Some(change) = row.get::<_, Option<i64>>(15)? {
            stat.rr_net += change;
            stat.rr_matches += 1;
        }
        if let Some(id) = agent_id {
            let agent = entry.agents.entry(id).or_insert_with(|| (agent_name.unwrap_or_default(), 0, 0));
            agent.1 += 1;
            agent.2 += won as i64;
        }
        if let Some(game) = game {
            if rounds_of(game, puuid, layout, stat, &mut entry.sites) {
                stat.analyzed += 1;
            }
        }
        Ok(())
    }

    pub fn finish(self) -> Vec<MapStat> {
        let mut maps: Vec<MapStat> = self
            .totals
            .into_values()
            .map(|entry| {
                let mut stat = entry.stat;
                let rounds = stat.rounds as f64;
                stat.losses = stat.matches - stat.wins - stat.draws;
                stat.win_pct = ratio(stat.wins as f64 * 100.0, stat.matches as f64);
                stat.acs = ratio(entry.score as f64, rounds);
                stat.adr = ratio(entry.damage as f64, rounds);
                stat.kd = ratio(entry.kills as f64, entry.deaths as f64);
                stat.hs_pct = ratio(entry.headshots as f64 * 100.0, entry.shots as f64);
                let mut sites: Vec<SitePlants> =
                    entry.sites.into_iter().map(|(site, plants)| SitePlants { site, plants }).collect();
                sites.sort_by(|a, b| a.site.cmp(&b.site));
                stat.plant_sites = sites;
                if let Some((id, (name, count, wins))) = entry
                    .agents
                    .into_iter()
                    .max_by(|a, b| a.1.1.cmp(&b.1.1).then(a.1.2.cmp(&b.1.2)).then(b.0.cmp(&a.0)))
                {
                    stat.agent_id = Some(id);
                    stat.agent_name = Some(name).filter(|name| !name.is_empty());
                    stat.agent_matches = count;
                    stat.agent_wins = wins;
                }
                stat
            })
            .collect();
        maps.sort_by(|a, b| b.matches.cmp(&a.matches).then(b.wins.cmp(&a.wins)).then(a.name.cmp(&b.name)));
        maps
    }
}

pub fn map_stats(conn: &Connection, puuid: &str, season: Option<&str>) -> AppResult<Vec<MapStat>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MAP_COLUMNS} {MAP_JOINS}
         WHERE p.puuid = ?1 AND m.queue = ?2 AND (?3 IS NULL OR m.season_short = ?3)
         ORDER BY m.started_at DESC"
    ))?;
    let mut rows = stmt.query(params![puuid, COMPETITIVE, season])?;
    let mut acc = MapAcc::default();
    while let Some(row) = rows.next()? {
        let json = match row.get::<_, String>(0)?.is_empty() {
            true => None,
            false => row.get_ref(RAW_COLUMN)?.as_bytes().ok().and_then(storage::inflate),
        };
        let game = json.as_deref().and_then(Game::parse);
        acc.add(conn, row, game.as_ref(), puuid)?;
    }
    Ok(acc.finish())
}

#[tauri::command(async)]
pub fn get_map_stats(state: tauri::State<'_, AppState>, puuid: String, season: Option<String>) -> AppResult<tauri::ipc::Response> {
    crate::reports::Report::Maps(season).serve(&state, &puuid)
}
