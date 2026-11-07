import { invoke } from "@tauri-apps/api/core";

export type OpeningSide = {
  rounds: number;
  firstKills: number;
  firstDeaths: number;
  successRate: number;
  wonAfterKill: number;
  wonAfterDeath: number;
  winRateAfterKill: number;
  winRateAfterDeath: number;
};

export type Opening = {
  all: OpeningSide;
  attack: OpeningSide;
  defense: OpeningSide;
};

export type ClutchSize = {
  enemies: number;
  attempts: number;
  won: number;
  winRate: number;
};

export type ClutchEntry = {
  matchId: string;
  mapId: string | null;
  mapName: string | null;
  startedAt: string;
  round: number;
  roundIndex: number;
  enemies: number;
  won: boolean;
  kills: number;
  agentId: string | null;
};

export type Clutches = {
  attempts: number;
  won: number;
  winRate: number;
  bySize: ClutchSize[];
  recent: ClutchEntry[];
};

export type Matchup = {
  agentId: string;
  agentName: string;
  role: string | null;
  kills: number;
  deaths: number;
  winRate: number;
  matches: number;
};

export type DistanceBucket = {
  key: "close" | "mid" | "long";
  label: string;
  kills: number;
  deaths: number;
  winRate: number;
};

export type Rival = {
  puuid: string;
  name: string;
  tag: string;
  agentId: string | null;
  card: string | null;
  killedMe: number;
  killedByMe: number;
  matches: number;
};

export type DuelReport = {
  matches: number;
  rounds: number;
  kills: number;
  deaths: number;
  opening: Opening;
  clutches: Clutches;
  matchups: Matchup[];
  distances: DistanceBucket[];
  nemeses: Rival[];
  victims: Rival[];
};

export const getDuels = (puuid: string, season: string | null) => invoke<DuelReport>("get_duels", { puuid, season });
