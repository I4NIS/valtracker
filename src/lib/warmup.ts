import { invoke } from "@tauri-apps/api/core";
import { localDay } from "./crosshairs";

export type WarmupMode = "deathmatch" | "teamdeathmatch";

export type WarmupGame = {
  matchId: string;
  startedAt: string;
  mode: WarmupMode;
  season: string | null;
  mapId: string | null;
  mapName: string | null;
  agentId: string | null;
  agentName: string | null;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
};

export type RankedGame = {
  startedAt: string;
  won: boolean;
  kills: number;
  deaths: number;
};

export type WarmupReport = {
  games: WarmupGame[];
  ranked: RankedGame[];
};

export function getWarmup(puuid: string, season: string | null): Promise<WarmupReport> {
  return invoke<WarmupReport>("get_warmup", { puuid, season });
}

export type DayPoint = { day: string; matches: number; kd: number; kills: number };

export type Totals = { matches: number; kd: number; kills: number };

export type DaySide = { days: number; matches: number; wins: number };

export type WarmedDay = {
  day: string;
  warmups: number;
  warmupKd: number;
  ranked: number;
  wins: number;
  rankedKd: number;
};

export type RankedLink = {
  warmed: DaySide;
  cold: DaySide;
  warmupKd: number | null;
  rankedKd: number | null;
  days: WarmedDay[];
};

const ratio = (kills: number, deaths: number) => kills / Math.max(1, deaths);
const dayOf = (iso: string) => localDay(new Date(iso));
const timeOf = (iso: string) => new Date(iso).getTime();

export function totals(games: WarmupGame[]): Totals {
  const kills = games.reduce((sum, game) => sum + game.kills, 0);
  const deaths = games.reduce((sum, game) => sum + game.deaths, 0);
  return {
    matches: games.length,
    kd: ratio(kills, deaths),
    kills: games.length ? kills / games.length : 0,
  };
}

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id);
    if (list) list.push(item);
    else map.set(id, [item]);
  }
  return map;
}

export function daily(games: WarmupGame[]): DayPoint[] {
  return [...group(games, (game) => dayOf(game.startedAt)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const sums = totals(list);
      return { day, matches: list.length, kd: sums.kd, kills: sums.kills };
    });
}

export function rankedLink(games: WarmupGame[], ranked: RankedGame[]): RankedLink {
  const warmups = group(games, (game) => dayOf(game.startedAt));
  const warmed: DaySide = { days: 0, matches: 0, wins: 0 };
  const cold: DaySide = { days: 0, matches: 0, wins: 0 };
  const days: WarmedDay[] = [];
  const warmTotals = { kills: 0, deaths: 0 };
  const rankedTotals = { kills: 0, deaths: 0 };
  for (const [day, list] of group(ranked, (game) => dayOf(game.startedAt))) {
    const first = Math.min(...list.map((game) => timeOf(game.startedAt)));
    const before = (warmups.get(day) ?? []).filter((game) => timeOf(game.startedAt) < first);
    const wins = list.filter((game) => game.won).length;
    const side = before.length > 0 ? warmed : cold;
    side.days += 1;
    side.matches += list.length;
    side.wins += wins;
    if (before.length === 0) continue;
    const warmKills = before.reduce((sum, game) => sum + game.kills, 0);
    const warmDeaths = before.reduce((sum, game) => sum + game.deaths, 0);
    const dayKills = list.reduce((sum, game) => sum + game.kills, 0);
    const dayDeaths = list.reduce((sum, game) => sum + game.deaths, 0);
    warmTotals.kills += warmKills;
    warmTotals.deaths += warmDeaths;
    rankedTotals.kills += dayKills;
    rankedTotals.deaths += dayDeaths;
    days.push({
      day,
      warmups: before.length,
      warmupKd: ratio(warmKills, warmDeaths),
      ranked: list.length,
      wins,
      rankedKd: ratio(dayKills, dayDeaths),
    });
  }
  days.sort((a, b) => b.day.localeCompare(a.day));
  const any = days.length > 0;
  return {
    warmed,
    cold,
    warmupKd: any ? ratio(warmTotals.kills, warmTotals.deaths) : null,
    rankedKd: any ? ratio(rankedTotals.kills, rankedTotals.deaths) : null,
    days,
  };
}
