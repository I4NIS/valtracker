import { invoke } from "@tauri-apps/api/core";

export type RankPoint = {
  tier: number | null;
  tierName: string | null;
  rr: number | null;
};

export type RecapMatch = {
  matchId: string;
  startedAt: string;
  lengthMs: number;
  mapId: string | null;
  mapName: string | null;
  mapImage: string | null;
  splash: string | null;
  agentId: string | null;
  agentName: string | null;
  tier: number | null;
  won: boolean;
  draw: boolean;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hsPct: number;
  rrChange: number | null;
  rrAfter: number | null;
  score: number;
  place: number;
};

export type AgentCount = {
  agentId: string;
  agentName: string | null;
  matches: number;
  wins: number;
};

export type MapCount = {
  mapId: string | null;
  mapName: string;
  mapImage: string | null;
  splash: string | null;
  matches: number;
  wins: number;
};

export type WeaponCount = { name: string; kills: number };

export type Rival = {
  puuid: string;
  name: string;
  tag: string;
  agentId: string | null;
  killedMe: number;
  killedByMe: number;
  matches: number;
};

export type LongestKill = {
  meters: number;
  weapon: string | null;
  mapName: string | null;
  matchId: string;
};

export type SessionRecap = {
  matches: RecapMatch[];
  wins: number;
  losses: number;
  draws: number;
  rrNet: number;
  rrKnown: number;
  before: RankPoint;
  after: RankPoint;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  kd: number;
  hsPct: number;
  playedMs: number;
  startedAt: string;
  endedAt: string;
  bestMatchId: string | null;
  agents: AgentCount[];
};

export type ActRecap = {
  season: string | null;
  matches: RecapMatch[];
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  rounds: number;
  roundsWon: number;
  playedMs: number;
  rrNet: number;
  rrKnown: number;
  start: RankPoint;
  end: RankPoint;
  peak: RankPoint;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  acs: number;
  adr: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
  hsPct: number;
  bodyPct: number;
  legPct: number;
  damageDealt: number;
  damageReceived: number;
  aces: number;
  fourKs: number;
  threeKs: number;
  clutchesWon: number;
  clutchAttempts: number;
  firstBloods: number;
  firstDeaths: number;
  knifeKills: number;
  plants: number;
  defuses: number;
  loadoutTotal: number;
  longestKill: LongestKill | null;
  nemesis: Rival | null;
  victim: Rival | null;
  agents: AgentCount[];
  maps: MapCount[];
  weapons: WeaponCount[];
  bestMatchId: string | null;
  worstMatchId: string | null;
  longestWinStreak: number;
  longestLossStreak: number;
};

export const recapApi = {
  getSessionRecap: (puuid: string) => invoke<SessionRecap>("get_session_recap", { puuid }),
  getActRecap: (puuid: string, season: string | null) => invoke<ActRecap>("get_act_recap", { puuid, season }),
  saveImage: async (fileName: string, blob: Blob) =>
    invoke<{ path: string; copied: boolean }>("save_recap_image", new Uint8Array(await blob.arrayBuffer()), {
      headers: { "x-file-name": fileName },
    }),
  reveal: (path: string) => invoke<void>("reveal_recap", { path }),
};
