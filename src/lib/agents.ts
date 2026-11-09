import { invoke } from "@tauri-apps/api/core";

export type AgentRole = "Duelist" | "Initiator" | "Controller" | "Sentinel";

export type AgentBestMap = {
  name: string;
  matches: number;
  winPct: number;
};

export type AgentMap = {
  mapId: string | null;
  mapName: string;
  image: string | null;
  matches: number;
  wins: number;
  winPct: number;
  acs: number;
  playedMs: number;
};

export type AgentStat = {
  agentId: string;
  name: string;
  role: AgentRole | string | null;
  matches: number;
  wins: number;
  losses: number;
  winPct: number;
  rounds: number;
  playedMs: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  avgScore: number | null;
  firstBloods: number;
  firstDeaths: number;
  firstBloodsPerRound: number;
  firstDeathsPerRound: number;
  bestMap: AgentBestMap | null;
  maps: AgentMap[];
  lobbyAcs: number | null;
  lobbySamples: number;
};

export const getAgentStats = (puuid: string, season: string | null) =>
  invoke<AgentStat[]>("get_agent_stats", { puuid, season });
