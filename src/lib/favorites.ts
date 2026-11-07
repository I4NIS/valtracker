import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

export type FavoriteKind = "match" | "round" | "death";

export type FavoriteEntry = {
  kind: FavoriteKind;
  matchId: string;
  roundIndex: number | null;
  startedAt: string;
  mapName: string | null;
  agentId: string | null;
  agentName: string | null;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  assists: number;
  createdAt: string;
};

export const favorites = {
  list: (puuid: string) => invoke<FavoriteEntry[]>("list_favorites", { puuid }),
  toggle: (puuid: string, matchId: string, kind: FavoriteKind, roundIndex: number | null) =>
    invoke<FavoriteEntry[]>("toggle_favorite", { puuid, matchId, kind, roundIndex }),
};

export function isFavorite(list: FavoriteEntry[] | undefined, matchId: string, kind: FavoriteKind, roundIndex: number | null) {
  return (list ?? []).some(
    (entry) => entry.matchId === matchId && entry.kind === kind && (kind === "match" || entry.roundIndex === roundIndex),
  );
}

export function favoriteLabel(entry: FavoriteEntry): string {
  const round = (entry.roundIndex ?? 0) + 1;
  if (entry.kind === "round") return t(`Round ${round}`, `Round ${round}`);
  if (entry.kind === "death") return t(`Ta mort au round ${round}`, `Your death in round ${round}`);
  return t("Match entier", "Full match");
}
