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
  getRecentMatches: (puuid: string, limit = 10) => invoke<RecentMatch[]>("get_recent_matches", { puuid, limit }),
  getSeasons: (puuid: string) => invoke<Season[]>("get_seasons", { puuid }),
  setPreference: (key: "theme" | "language" | "tutorial_done", value: string) =>
    invoke<void>("set_preference", { key, value }),
};

export function onSyncProgress(callback: (progress: SyncProgress) => void): Promise<UnlistenFn> {
  return listen<SyncProgress>("sync-progress", (event) => callback(event.payload));
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue";
}
