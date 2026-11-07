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
  headshots: number;
  bodyshots: number;
  legshots: number;
  damageMade: number;
  damageReceived: number;
};

export type RankedGame = {
  startedAt: string;
  won: boolean;
  kills: number;
  deaths: number;
  headshots: number;
  shots: number;
};

export type WarmupReport = {
  games: WarmupGame[];
  ranked: RankedGame[];
};

export function getWarmup(puuid: string, season: string | null): Promise<WarmupReport> {
  return invoke<WarmupReport>("get_warmup", { puuid, season });
}

export type DayPoint = { day: string; matches: number; hsPct: number | null; kd: number };

export type Totals = { matches: number; hsPct: number | null; kd: number; kills: number; damage: number | null };

export type DaySide = { days: number; matches: number; wins: number };

export type WarmedDay = {
  day: string;
  warmups: number;
  warmupHsPct: number | null;
  ranked: number;
  wins: number;
  rankedHsPct: number | null;
};

export type RankedLink = {
  warmed: DaySide;
  cold: DaySide;
  warmupHsPct: number | null;
  rankedHsPct: number | null;
  days: WarmedDay[];
};

const shotsOf = (game: WarmupGame) => game.headshots + game.bodyshots + game.legshots;
const share = (part: number, total: number) => (total > 0 ? (part * 100) / total : null);
const dayOf = (iso: string) => localDay(new Date(iso));
const timeOf = (iso: string) => new Date(iso).getTime();

export function totals(games: WarmupGame[]): Totals {
  const kills = games.reduce((sum, game) => sum + game.kills, 0);
  const deaths = games.reduce((sum, game) => sum + game.deaths, 0);
  const heads = games.reduce((sum, game) => sum + game.headshots, 0);
  const shots = games.reduce((sum, game) => sum + shotsOf(game), 0);
  const measured = games.filter((game) => game.damageMade > 0 || shotsOf(game) > 0);
  const damage = measured.reduce((sum, game) => sum + game.damageMade, 0);
  return {
    matches: games.length,
    hsPct: share(heads, shots),
    kd: kills / Math.max(1, deaths),
    kills: games.length ? kills / games.length : 0,
    damage: measured.length ? damage / measured.length : null,
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
      return { day, matches: list.length, hsPct: sums.hsPct, kd: sums.kd };
    });
}

export function rankedLink(games: WarmupGame[], ranked: RankedGame[]): RankedLink {
  const warmups = group(games, (game) => dayOf(game.startedAt));
  const warmed: DaySide = { days: 0, matches: 0, wins: 0 };
  const cold: DaySide = { days: 0, matches: 0, wins: 0 };
  const days: WarmedDay[] = [];
  let warmHeads = 0;
  let warmShots = 0;
  let rankedHeads = 0;
  let rankedShots = 0;
  for (const [day, list] of group(ranked, (game) => dayOf(game.startedAt))) {
    const first = Math.min(...list.map((game) => timeOf(game.startedAt)));
    const before = (warmups.get(day) ?? []).filter((game) => timeOf(game.startedAt) < first);
    const wins = list.filter((game) => game.won).length;
    const side = before.length > 0 ? warmed : cold;
    side.days += 1;
    side.matches += list.length;
    side.wins += wins;
    if (before.length === 0) continue;
    const heads = before.reduce((sum, game) => sum + game.headshots, 0);
    const shots = before.reduce((sum, game) => sum + shotsOf(game), 0);
    const dayHeads = list.reduce((sum, game) => sum + game.headshots, 0);
    const dayShots = list.reduce((sum, game) => sum + game.shots, 0);
    warmHeads += heads;
    warmShots += shots;
    rankedHeads += dayHeads;
    rankedShots += dayShots;
    days.push({
      day,
      warmups: before.length,
      warmupHsPct: share(heads, shots),
      ranked: list.length,
      wins,
      rankedHsPct: share(dayHeads, dayShots),
    });
  }
  days.sort((a, b) => b.day.localeCompare(a.day));
  return { warmed, cold, warmupHsPct: share(warmHeads, warmShots), rankedHsPct: share(rankedHeads, rankedShots), days };
}
