import type { PastGame } from "./nextGame";

export type Inputs = {
  mapId: string | null;
  agentId: string | null;
  party: number;
  allies: string[];
  enemies: string[];
};

export type FeatureKey = "map" | "agent" | "mapAgent" | "party" | "allies" | "enemies" | "controllers" | "duelists" | "noController";

export type Effect = { key: FeatureKey; points: number };

export type Reliability = { tests: number; correct: number; always: number };

export type WinModel = {
  predict: (inputs: Inputs) => { probability: number; effects: Effect[] };
  reliability: Reliability | null;
  trained: number;
};

type Row = { mapId: string | null; agentId: string | null; party: number; allies: string[]; enemies: string[]; won: boolean };

const KEYS: FeatureKey[] = ["map", "agent", "mapAgent", "party", "allies", "enemies", "controllers", "duelists", "noController"];
const PRIOR = 8;
const LAMBDA = 5;
const STEPS = 150;
const RATE = 1;
const WARMUP = 30;
export const MIN_GAMES = 60;
const MIN_TESTS = 30;

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function toRow(game: PastGame): Row {
  return {
    mapId: game.mapId,
    agentId: game.agentId?.toLowerCase() ?? null,
    party: game.party,
    allies: game.allyAgents,
    enemies: game.enemyAgents,
    won: game.won,
  };
}

function shiftOf(history: Row[], match: (row: Row) => boolean, base: number): number {
  let wins = 0;
  let count = 0;
  for (const row of history) {
    if (!match(row)) continue;
    count += 1;
    if (row.won) wins += 1;
  }
  return logit((wins + PRIOR * base) / (count + PRIOR)) - logit(base);
}

const TEAM = 4;
const SQUAD = 5;

function share(values: number[], slots: number): number {
  return values.reduce((sum, value) => sum + value, 0) / slots;
}

function features(history: Row[], input: Inputs, roleOf: (agent: string) => string | null): number[] {
  const wins = history.filter((row) => row.won).length;
  const base = Math.min(0.9, Math.max(0.1, (wins + 1) / (history.length + 2)));
  const agent = input.agentId?.toLowerCase() ?? null;
  const count = (list: string[], role: string) => list.filter((entry) => roleOf(entry) === role).length;
  const mine = agent ? [agent, ...input.allies] : input.allies;
  const known = input.allies.length >= TEAM && input.enemies.length >= SQUAD;
  return [
    input.mapId ? shiftOf(history, (row) => row.mapId === input.mapId, base) : 0,
    agent ? shiftOf(history, (row) => row.agentId === agent, base) : 0,
    input.mapId && agent ? shiftOf(history, (row) => row.mapId === input.mapId && row.agentId === agent, base) : 0,
    shiftOf(history, (row) => row.party === input.party, base),
    share(input.allies.map((entry) => shiftOf(history, (row) => row.allies.includes(entry), base)), TEAM),
    share(input.enemies.map((entry) => shiftOf(history, (row) => row.enemies.includes(entry), base)), SQUAD),
    known ? count(mine, "Controller") - count(input.enemies, "Controller") : 0,
    known ? count(mine, "Duelist") - count(input.enemies, "Duelist") : 0,
    input.allies.length >= TEAM && count(mine, "Controller") === 0 ? 1 : 0,
  ];
}

type Fitted = { mu: number[]; sd: number[]; weights: number[] };

function fit(x: number[][], y: number[]): Fitted {
  const n = x.length;
  const d = x[0].length;
  const mu = new Array<number>(d).fill(0);
  const sd = new Array<number>(d).fill(0);
  for (const row of x) row.forEach((value, j) => (mu[j] += value / n));
  for (const row of x) row.forEach((value, j) => (sd[j] += (value - mu[j]) ** 2 / n));
  for (let j = 0; j < d; j += 1) sd[j] = Math.sqrt(sd[j]) || 1;
  const z = x.map((row) => row.map((value, j) => (value - mu[j]) / sd[j]));
  const weights = new Array<number>(d + 1).fill(0);
  const gradient = new Array<number>(d + 1);
  for (let step = 0; step < STEPS; step += 1) {
    gradient.fill(0);
    for (let i = 0; i < n; i += 1) {
      let score = weights[0];
      for (let j = 0; j < d; j += 1) score += z[i][j] * weights[j + 1];
      const error = sigmoid(score) - y[i];
      gradient[0] += error;
      for (let j = 0; j < d; j += 1) gradient[j + 1] += error * z[i][j];
    }
    for (let j = 0; j <= d; j += 1) weights[j] -= RATE * (gradient[j] / n + (j > 0 ? (LAMBDA * weights[j]) / n : 0));
  }
  return { mu, sd, weights };
}

function score(model: Fitted, row: number[]): { logit: number; parts: number[] } {
  const parts = row.map((value, j) => ((value - model.mu[j]) / model.sd[j]) * model.weights[j + 1]);
  return { logit: model.weights[0] + parts.reduce((sum, part) => sum + part, 0), parts };
}

export function trainWinModel(history: PastGame[], roleOf: (agent: string) => string | null): WinModel | null {
  const rows = history.filter((game) => !game.draw).map(toRow);
  if (rows.length < MIN_GAMES) return null;
  const x: number[][] = [];
  const y: number[] = [];
  for (let index = WARMUP; index < rows.length; index += 1) {
    const row = rows[index];
    x.push(features(rows.slice(0, index), { mapId: row.mapId, agentId: row.agentId, party: row.party, allies: row.allies, enemies: row.enemies }, roleOf));
    y.push(row.won ? 1 : 0);
  }

  const start = Math.max(MIN_GAMES - WARMUP, Math.floor(x.length * 0.35));
  let reliability: Reliability | null = null;
  if (x.length - start >= MIN_TESTS) {
    let correct = 0;
    let always = 0;
    for (let index = start; index < x.length; index += 1) {
      const model = fit(x.slice(0, index), y.slice(0, index));
      const probability = sigmoid(score(model, x[index]).logit);
      const winsBefore = y.slice(0, index).reduce((sum, value) => sum + value, 0);
      if ((probability >= 0.5) === (y[index] === 1)) correct += 1;
      if ((winsBefore * 2 >= index) === (y[index] === 1)) always += 1;
    }
    reliability = { tests: x.length - start, correct, always };
  }

  const model = fit(x, y);
  return {
    trained: x.length,
    reliability,
    predict: (inputs) => {
      const result = score(model, features(rows, inputs, roleOf));
      const probability = sigmoid(result.logit);
      const effects = result.parts
        .map((part, j) => ({ key: KEYS[j], points: (probability - sigmoid(result.logit - part)) * 100 }))
        .filter((effect) => Math.abs(effect.points) >= 0.5)
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
      return { probability, effects };
    },
  };
}
