import { getAgentStats } from "./agents";
import { api, type HeatmapFilters, type OverviewFilters } from "./api";
import { crosshairs } from "./crosshairs";
import { getDuels } from "./duels";
import { whenIdle } from "./idle";
import { favorites } from "./favorites";
import { journal } from "./journal";
import { getMapHistory, getMapRotation, getMapStats } from "./mapStats";
import { peek, prefetch, type Query } from "./query";
import { getActs } from "./ranked";
import { getAccolades, getAgentMastery } from "./career";
import { getWeaponHistory, getWeaponStats } from "./weapons";

type Season = string | null;

const s = (season: Season) => season ?? "all";

export const ALL_ACCOUNTS = "all";

export const RECENT_PAGE = 20;

export const NO_FILTERS: OverviewFilters = { season: null, mapId: null, agentId: null, role: null, days: null, party: null };

const filterKey = (filters: OverviewFilters) =>
  [s(filters.season), filters.mapId, filters.agentId, filters.role, filters.days, filters.party].map((part) => part ?? "all").join("|");

export const queries = {
  thresholds: () => ({ key: "thresholds", fetch: () => api.getThresholds() }),
  seasons: (puuid: string) => ({ key: `seasons|${puuid}`, fetch: () => api.getSeasons(puuid) }),
  overview: (puuid: string, filters: OverviewFilters) => ({
    key: `overview|${puuid}|${filterKey(filters)}`,
    fetch: () => api.getOverview(puuid, filters),
  }),
  filterOptions: (puuid: string) => ({ key: `filterOptions|${puuid}`, fetch: () => api.getFilterOptions(puuid) }),
  recent: (puuid: string, limit: number, offset = 0, filters: OverviewFilters = NO_FILTERS) => ({
    key: `recent|${puuid}|${filterKey(filters)}|${limit}|${offset}`,
    fetch: () => api.getRecentMatches(puuid, limit, offset, filters),
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
  rotation: (region: string) => ({ key: `rotation|${region}`, fetch: () => getMapRotation(region) }),
  mapHistory: (puuid: string, mapId: string) => ({ key: `mapHistory|${puuid}|${mapId}`, fetch: () => getMapHistory(puuid, mapId) }),
  weapons: (puuid: string, season: Season) => ({ key: `weapons|${puuid}|${s(season)}`, fetch: () => getWeaponStats(puuid, season) }),
  weaponHistory: (puuid: string, season: Season, weapon: string, deaths: boolean) => ({
    key: `weaponHistory|${puuid}|${s(season)}|${weapon}|${deaths}`,
    fetch: () => getWeaponHistory(puuid, season, weapon, deaths),
  }),
  duels: (puuid: string, season: Season) => ({ key: `duels|${puuid}|${s(season)}`, fetch: () => getDuels(puuid, season) }),
  notes: (puuid: string) => ({ key: `journal|notes|${puuid}`, fetch: () => journal.listNotes(puuid) }),
  tags: (puuid: string) => ({ key: `journal|tags|${puuid}`, fetch: () => journal.listTags(puuid) }),
  note: (puuid: string, matchId: string) => ({ key: `journal|note|${puuid}|${matchId}`, fetch: () => journal.getNote(puuid, matchId) }),
  favorites: (puuid: string) => ({ key: `journal|favorites|${puuid}`, fetch: () => favorites.list(puuid) }),
  acts: (puuid: string) => ({ key: `acts|${puuid}`, fetch: () => getActs(puuid) }),
  accolades: (puuid: string) => ({ key: `accolades|${puuid}`, fetch: () => getAccolades(puuid) }),
  mastery: (puuid: string) => ({ key: `mastery|${puuid}`, fetch: () => getAgentMastery(puuid) }),
  crosshairs: (puuid: string) => ({ key: `journal|crosshairs|${puuid}`, fetch: () => crosshairs.list(puuid) }),
} satisfies Record<string, (...args: never[]) => Query<unknown>>;

export function defaultSeason(puuid: string): Season | undefined {
  const list = peek<{ short: string }[]>(queries.seasons(puuid).key);
  return list === undefined ? undefined : (list[0]?.short ?? null);
}

const NEEDS: Record<string, string[]> = {
  home: ["overview|", "recent|", "flaws|", "thresholds", "filterOptions|"],
  matches: ["recent|", "filterOptions|"],
  progress: ["progression|", "thresholds"],
  agents: ["agents|", "mastery|"],
  maps: ["maps|"],
  weapons: ["weapons|"],
  duels: ["duels|"],
  journal: ["journal|"],
  settings: ["thresholds"],
};

let run = 0;

export async function prefetchAccount(puuid: string, page = "home") {
  run += 1;
  const id = run;
  await prefetch(queries.seasons(puuid));
  const current = defaultSeason(puuid) ?? null;
  const tasks: Query<unknown>[] = [
    queries.overview(puuid, { ...NO_FILTERS, season: current }),
    queries.filterOptions(puuid),
    queries.recent(puuid, RECENT_PAGE),
    queries.thresholds(),
    ...(puuid === ALL_ACCOUNTS ? [] : accountOnly(puuid, current)),
  ];
  const needs = NEEDS[page] ?? [];
  const urgent = tasks.filter((task) => needs.some((prefix) => task.key.startsWith(prefix)));
  const later = tasks.filter((task) => !urgent.includes(task));
  for (const task of urgent) {
    if (id !== run) return;
    await prefetch(task);
  }
  for (const task of later) {
    await whenIdle();
    if (id !== run) return;
    await prefetch(task);
  }
}

function accountOnly(puuid: string, current: Season): Query<unknown>[] {
  return [
    queries.flaws(puuid),
    queries.progression(puuid, current),
    queries.notes(puuid),
    queries.tags(puuid),
    queries.favorites(puuid),
    queries.crosshairs(puuid),
    queries.agents(puuid, current),
    queries.maps(puuid, current),
    queries.weapons(puuid, current),
    queries.duels(puuid, current),
    queries.acts(puuid),
    queries.accolades(puuid),
    queries.mastery(puuid),
  ];
}
