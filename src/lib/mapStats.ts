import { invoke } from "@tauri-apps/api/core";

export type SitePlants = {
  site: string;
  plants: number;
};

export type MapStat = {
  mapId: string;
  name: string;
  splash: string | null;
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
