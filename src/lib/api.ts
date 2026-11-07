import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Theme = "dark" | "light";

export type Account = {
  puuid: string;
  name: string;
  tag: string;
  region: string;
  platform: string;
  accountLevel: number | null;
  cardId: string | null;
  tier: number | null;
  tierName: string | null;
  rr: number | null;
  peakTier: number | null;
  peakTierName: string | null;
  peakSeason: string | null;
  lastSyncAt: string | null;
};

export type Bootstrap = {
  hasApiKey: boolean;
  accounts: Account[];
  activePuuid: string | null;
  theme: Theme;
  language: string;
  tutorialDone: boolean;
  notifyMatches: boolean;
};

export type LobbyAverages = {
  acs: number;
  adr: number;
  kd: number;
  hsPct: number;
};

export type Overview = {
  matches: number;
  wins: number;
  losses: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  kd: number;
  kad: number;
  hsPct: number;
  winPct: number;
  killsPerRound: number;
  lobby: LobbyAverages;
};

export type RecentMatch = {
  matchId: string;
  startedAt: string;
  mapName: string | null;
  queue: string | null;
  agentId: string | null;
  agentName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  place: number;
};

export type Season = {
  short: string;
  matches: number;
};

export type SyncProgress = {
  puuid: string;
  stage: string;
  newMatches: number;
  running: boolean;
  error: string | null;
};

export type SyncReport = {
  newMatches: number;
  finishedAt: string;
};

export type Position = { x: number; y: number };

export type Marker = { x: number; y: number; ally: boolean };

export type PlayerLine = {
  puuid: string;
  name: string;
  tag: string;
  agentId: string | null;
  agentName: string | null;
  role: string | null;
  tier: number | null;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hsPct: number;
  firstBloods: number;
  score: number;
  place: number;
  badge: string | null;
  isMe: boolean;
};

export type TeamBlock = {
  mine: boolean;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  avgAcs: number;
  players: PlayerLine[];
};

export type RoundEvent = {
  timeS: number;
  kind: "kill" | "plant" | "defuse";
  actor: string;
  actorAgentId: string | null;
  actorAlly: boolean;
  actorMe: boolean;
  target: string | null;
  targetAgentId: string | null;
  targetAlly: boolean;
  targetMe: boolean;
  weapon: string | null;
  weaponId?: string | null;
  weaponKind?: string | null;
  site: string | null;
};

export type EconomyLine = {
  name: string;
  agentId: string | null;
  ally: boolean;
  me: boolean;
  loadout: number;
  remaining: number;
  weapon: string | null;
  weaponId?: string | null;
  armor: string | null;
  kills: number;
  damage: number;
};

export type RoundLine = {
  number: number;
  won: boolean;
  attack: boolean;
  planted: boolean;
  myLoadout: number;
  teamLoadout: number;
  enemyLoadout: number;
  myKills: number;
  died: boolean;
  result: string;
  ceremony: string | null;
  events: RoundEvent[];
  economy: EconomyLine[];
};

export type Death = {
  round: number;
  timeS: number;
  attack: boolean;
  roundWon: boolean;
  killerName: string;
  killerAgent: string | null;
  killerAgentId: string | null;
  weapon: string | null;
  weaponId?: string | null;
  weaponKind?: string | null;
  distanceM: number | null;
  nearestAllyM: number | null;
  traded: boolean;
  firstDeath: boolean;
  loadout: number;
  zone: string | null;
  position: Position | null;
  killerPosition: Position | null;
  others: Marker[];
  flaws: string[];
  positives: string[];
};

export type Flaw = { value: string; title: string; detail: string };

export type MatchDetail = {
  matchId: string;
  mapId: string | null;
  mapName: string | null;
  minimap: string | null;
  splash: string | null;
  rotation: number;
  startedAt: string | null;
  lengthMs: number | null;
  queue: string | null;
  season: string | null;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  agentId: string | null;
  agentName: string | null;
  score: number;
  place: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  teamLevel: string;
  teamAcs: number;
  enemyAcs: number;
  rrChange: number | null;
  rrAfter: number | null;
  teams: TeamBlock[];
  rounds: RoundLine[];
  deathReviews: Death[];
  flaws: Flaw[];
};

export type HeatPoint = {
  kind: "death" | "kill" | "killer";
  x: number;
  y: number;
  attack: boolean;
  phase: "early" | "mid" | "post";
  zone: string | null;
  won: boolean;
};

export type MapOption = { id: string; name: string; matches: number; image: string | null };

export type AgentOption = { id: string; name: string; matches: number };

export type HeatmapFilters = {
  mapId: string | null;
  season: string | null;
  agentId: string | null;
  limit: number | null;
};

export type Heatmap = {
  maps: MapOption[];
  agents: AgentOption[];
  available: number;
  mapId: string | null;
  minimap: string | null;
  splash: string | null;
  rotation: number;
  matches: number;
  points: HeatPoint[];
};

export type RrPoint = {
  date: string;
  tier: number | null;
  tierName: string | null;
  rr: number | null;
  change: number | null;
};

export type GameSummary = {
  matchId: string;
  startedAt: string;
  mapName: string | null;
  agentId: string | null;
  won: boolean;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  hsPct: number;
  score: number;
  place: number;
  traded: number;
  firstDeaths: number;
  isolated: number;
};

export type Progression = {
  rr: RrPoint[];
  games: GameSummary[];
  lobbyAcs: number;
  lobbyHsPct: number;
};

export type RecentFlaws = {
  matches: number;
  rounds: number;
  deaths: number;
  untraded: number;
  isolated: number;
  firstDeaths: number;
};

export type ImportCandidate = {
  path: string;
  accounts: number;
  matches: number;
};

export const api = {
  bootstrap: () => invoke<Bootstrap>("bootstrap"),
  saveApiKey: (key: string) => invoke<void>("save_api_key", { key }),
  hasApiKey: () => invoke<boolean>("has_api_key"),
  addAccount: (riotId: string, region: string) => invoke<Account>("add_account", { riotId, region }),
  setActiveAccount: (puuid: string) => invoke<void>("set_active_account", { puuid }),
  removeAccount: (puuid: string) => invoke<void>("remove_account", { puuid }),
  listAccounts: () => invoke<Account[]>("list_accounts"),
  syncAccount: (puuid: string) => invoke<SyncReport>("sync_account", { puuid }),
  getOverview: (puuid: string, season: string | null) => invoke<Overview>("get_overview", { puuid, season }),
  getRecentMatches: (puuid: string, limit = 10, offset = 0) =>
    invoke<RecentMatch[]>("get_recent_matches", { puuid, limit, offset }),
  getMatch: (puuid: string, matchId: string) => invoke<MatchDetail>("get_match", { puuid, matchId }),
  getHeatmap: (puuid: string, filters: HeatmapFilters) => invoke<Heatmap>("get_heatmap", { puuid, ...filters }),
  getProgression: (puuid: string, season: string | null) => invoke<Progression>("get_progression", { puuid, season }),
  getRecentFlaws: (puuid: string) => invoke<RecentFlaws>("get_recent_flaws", { puuid }),
  getSeasons: (puuid: string) => invoke<Season[]>("get_seasons", { puuid }),
  setPreference: (key: "theme" | "language" | "tutorial_done" | "notify_matches", value: string) =>
    invoke<void>("set_preference", { key, value }),
  exportDatabase: (fileName: string) => invoke<string | null>("export_database", { fileName }),
  pickDatabaseImport: () => invoke<ImportCandidate | null>("pick_database_import"),
  importDatabase: (path: string) => invoke<void>("import_database", { path }),
};

export function onSyncProgress(callback: (progress: SyncProgress) => void): Promise<UnlistenFn> {
  return listen<SyncProgress>("sync-progress", (event) => callback(event.payload));
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue";
}
