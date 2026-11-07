import { getAgentStats } from "./agents";
import { api, type HeatmapFilters } from "./api";
import { getDuels } from "./duels";
import { journal } from "./journal";
import { getMapStats } from "./mapStats";
import { peek, prefetch, type Query } from "./query";
import { getWeaponHistory, getWeaponStats } from "./weapons";

type Season = string | null;

const s = (season: Season) => season ?? "all";

export const queries = {
  seasons: (puuid: string) => ({ key: `seasons|${puuid}`, fetch: () => api.getSeasons(puuid) }),
  overview: (puuid: string, season: Season) => ({ key: `overview|${puuid}|${s(season)}`, fetch: () => api.getOverview(puuid, season) }),
  recent: (puuid: string, limit: number, offset = 0) => ({
    key: `recent|${puuid}|${limit}|${offset}`,
    fetch: () => api.getRecentMatches(puuid, limit, offset),
  }),
  match: (puuid: string, matchId: string) => ({ key: `match|${puuid}|${matchId}`, fetch: () => api.getMatch(puuid, matchId) }),
  flaws: (puuid: string) => ({ key: `flaws|${puuid}`, fetch: () => api.getRecentFlaws(puuid) }),
  progression: (puuid: string, season: Season) => ({
    key: `progression|${puuid}|${s(season)}`,
    fetch: () => api.getProgression(puuid, season),
  }),
  heatmap: (puuid: string, filters: HeatmapFilters) => ({
    key: `heatmap|${puuid}|${JSON.stringify(filters)}`,
    fetch: () => api.getHeatmap(puuid, filters),
  }),
  agents: (puuid: string, season: Season) => ({ key: `agents|${puuid}|${s(season)}`, fetch: () => getAgentStats(puuid, season) }),
  maps: (puuid: string, season: Season) => ({ key: `maps|${puuid}|${s(season)}`, fetch: () => getMapStats(puuid, season) }),
  weapons: (puuid: string, season: Season) => ({ key: `weapons|${puuid}|${s(season)}`, fetch: () => getWeaponStats(puuid, season) }),
  weaponHistory: (puuid: string, season: Season, weapon: string, deaths: boolean) => ({
    key: `weaponHistory|${puuid}|${s(season)}|${weapon}|${deaths}`,
    fetch: () => getWeaponHistory(puuid, season, weapon, deaths),
  }),
  duels: (puuid: string, season: Season) => ({ key: `duels|${puuid}|${s(season)}`, fetch: () => getDuels(puuid, season) }),
  notes: (puuid: string) => ({ key: `journal|notes|${puuid}`, fetch: () => journal.listNotes(puuid) }),
  tags: (puuid: string) => ({ key: `journal|tags|${puuid}`, fetch: () => journal.listTags(puuid) }),
  note: (puuid: string, matchId: string) => ({ key: `journal|note|${puuid}|${matchId}`, fetch: () => journal.getNote(puuid, matchId) }),
} satisfies Record<string, (...args: never[]) => Query<unknown>>;

export function defaultSeason(puuid: string): Season | undefined {
  const list = peek<{ short: string }[]>(queries.seasons(puuid).key);
  return list === undefined ? undefined : (list[0]?.short ?? null);
}

export async function prefetchAccount(puuid: string) {
  await prefetch(queries.seasons(puuid));
  const current = defaultSeason(puuid) ?? null;
  const tasks: Query<unknown>[] = [
    queries.overview(puuid, current),
    queries.recent(puuid, 10),
    queries.recent(puuid, 20),
    queries.flaws(puuid),
    queries.progression(puuid, current),
    queries.notes(puuid),
    queries.tags(puuid),
    queries.agents(puuid, current),
    queries.maps(puuid, current),
    queries.weapons(puuid, current),
    queries.duels(puuid, current),
  ];
  for (const task of tasks) await prefetch(task);
}
