import type { MapRotation } from "./mapStats";
import type { PastGame } from "./nextGame";

export type MapChance = { id: string; name: string; chance: number; lastSeen: number | null };

export type RepeatRate = { lag: number; observed: number; expected: number; samples: number };

export type MapOdds = {
  maps: MapChance[];
  repeats: RepeatRate[];
  backtest: { tests: number; given: number; random: number } | null;
};

const LAGS = 2;
const PRIOR = 60;
const MIN_TESTS = 30;

type Played = { key: string; season: string | null };

const keyOf = (game: PastGame) => (game.mapId ?? game.mapName ?? "").toLowerCase();

function poolsBySeason(games: (Played & { at: number })[]): Map<string | null, Set<string>> {
  const pools = new Map<string | null, Set<string>>();
  for (const game of games) {
    const pool = pools.get(game.season) ?? new Set<string>();
    pool.add(game.key);
    pools.set(game.season, pool);
  }
  return pools;
}

function repeatFactors(games: Played[], pools: Map<string | null, Set<string>>, upTo: number): RepeatRate[] {
  const rates: RepeatRate[] = [];
  for (let lag = 1; lag <= LAGS; lag += 1) {
    let hits = 0;
    let expected = 0;
    let samples = 0;
    for (let index = lag; index < upTo; index += 1) {
      if (games[index].season !== games[index - lag].season) continue;
      const size = pools.get(games[index].season)?.size ?? 0;
      if (size < 2) continue;
      samples += 1;
      expected += 1 / size;
      if (games[index].key === games[index - lag].key) hits += 1;
    }
    rates.push({ lag, observed: samples ? hits / samples : 0, expected: samples ? expected / samples : 0, samples });
  }
  return rates;
}

const factorOf = (rate: RepeatRate) => (rate.samples ? (rate.observed * rate.samples + rate.expected * PRIOR) / (rate.expected * (rate.samples + PRIOR)) : 1);

function chances(pool: string[], recent: string[], rates: RepeatRate[]): Map<string, number> {
  const weights = new Map(pool.map((key) => [key, 1]));
  rates.forEach((rate, index) => {
    const key = recent[index];
    if (key !== undefined && weights.has(key)) weights.set(key, (weights.get(key) ?? 1) * factorOf(rate));
  });
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  return new Map([...weights].map(([key, weight]) => [key, weight / total]));
}

export function mapOdds(history: PastGame[], rotation: MapRotation | null, season: string | null): MapOdds | null {
  const games = history
    .filter((game) => keyOf(game) !== "")
    .map((game) => ({ key: keyOf(game), season: game.season, at: new Date(game.startedAt).getTime(), name: game.mapName ?? "" }));
  if (games.length === 0) return null;
  const pools = poolsBySeason(games);
  const names = new Map(games.map((game) => [game.key, game.name]));

  const fromRotation = rotation?.maps.map((map) => ({ key: (map.id || map.name).toLowerCase(), name: map.name })) ?? [];
  const currentSeason = season ?? games[games.length - 1].season;
  const pool = fromRotation.length >= 2 ? fromRotation.map((map) => map.key) : [...(pools.get(currentSeason) ?? [])];
  fromRotation.forEach((map) => names.set(map.key, map.name));
  if (pool.length < 2) return null;

  const rates = repeatFactors(games, pools, games.length);
  const recent = games.slice(-LAGS).reverse().map((game) => game.key);
  const odds = chances(pool, recent, rates);
  const lastIndex = new Map<string, number>();
  games.forEach((game, index) => lastIndex.set(game.key, index));
  const maps = pool
    .map((key) => ({ id: key, name: names.get(key) ?? key, chance: odds.get(key) ?? 0, lastSeen: lastIndex.has(key) ? games.length - (lastIndex.get(key) ?? 0) : null }))
    .sort((a, b) => b.chance - a.chance || a.name.localeCompare(b.name));

  let backtest: MapOdds["backtest"] = null;
  const start = Math.floor(games.length / 2);
  let tests = 0;
  let given = 0;
  let random = 0;
  for (let index = start; index < games.length; index += 1) {
    const seasonPool = [...(pools.get(games[index].season) ?? [])];
    if (seasonPool.length < 2) continue;
    const before = games.slice(Math.max(0, index - LAGS), index).reverse().map((game) => (game.season === games[index].season ? game.key : ""));
    const guess = chances(seasonPool, before, repeatFactors(games, pools, index));
    tests += 1;
    given += guess.get(games[index].key) ?? 0;
    random += 1 / seasonPool.length;
  }
  if (tests >= MIN_TESTS) backtest = { tests, given: given / tests, random: random / tests };

  return { maps, repeats: rates, backtest };
}
