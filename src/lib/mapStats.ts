import { invoke } from "@tauri-apps/api/core";
import type { Position } from "./api";

export type SitePlants = {
  site: string;
  plants: number;
};

export type PlantSpot = {
  x: number;
  y: number;
  site: string | null;
  won: boolean;
};

export type MapStat = {
  mapId: string;
  name: string;
  splash: string | null;
  listIcon: string | null;
  minimap: string | null;
  rotation: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  acs: number;
  kd: number;
  adr: number;
  hsPct: number;
  rrNet: number;
  rrMatches: number;
  rounds: number;
  analyzed: number;
  attackPlayed: number;
  attackWon: number;
  defensePlayed: number;
  defenseWon: number;
  pistolPlayed: number;
  pistolWon: number;
  plants: number;
  plantSites: SitePlants[];
  plantSpots: PlantSpot[];
  retakesPlayed: number;
  retakesWon: number;
  agentId: string | null;
  agentName: string | null;
  agentMatches: number;
  agentWins: number;
};

export function getMapStats(puuid: string, season: string | null): Promise<MapStat[]> {
  return invoke<MapStat[]>("get_map_stats", { puuid, season });
}

export type MapZone = {
  name: string;
  x: number;
  y: number;
};

export type MapGame = {
  matchId: string;
  startedAt: string;
  season: string | null;
  won: boolean;
  draw: boolean;
  roundsWon: number;
  roundsLost: number;
  agentId: string | null;
  agentName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
};

export type MapAction = {
  kind: "death" | "kill";
  matchId: string;
  round: number;
  timeS: number;
  attack: boolean;
  phase: "early" | "mid" | "post";
  roundWon: boolean;
  first: boolean;
  zone: string | null;
  mePosition: Position | null;
  opponentPosition: Position | null;
  opponent: string;
  opponentAgentId: string | null;
  weapon: string | null;
  weaponId: string | null;
  weaponKind: string | null;
  flaws: string[];
  positives: string[];
};

export type MapHistory = {
  mapId: string;
  minimap: string | null;
  rotation: number;
  total: number;
  zones: MapZone[];
  games: MapGame[];
  actions: MapAction[];
};

export function getMapHistory(puuid: string, mapId: string): Promise<MapHistory> {
  return invoke<MapHistory>("get_map_history", { puuid, mapId });
}

export type RotationMap = {
  id: string;
  name: string;
};

export type MapRotation = {
  region: string;
  fetchedAt: number;
  maps: RotationMap[];
};

export function getMapRotation(region: string): Promise<MapRotation | null> {
  return invoke<MapRotation | null>("get_map_rotation", { region });
}

export function inRotation(rotation: MapRotation, map: { mapId: string; name: string }): boolean {
  const id = map.mapId.toLowerCase();
  const name = map.name.toLowerCase();
  return rotation.maps.some((entry) => (entry.id !== "" && entry.id.toLowerCase() === id) || entry.name.toLowerCase() === name);
}
