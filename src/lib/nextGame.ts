import { invoke } from "@tauri-apps/api/core";
import { fmt } from "./format";
import { lang, t } from "./i18n";

export type PastGame = {
  startedAt: string;
  mapId: string | null;
  mapName: string | null;
  agentId: string | null;
  agentName: string | null;
  won: boolean;
  draw: boolean;
  tier: number | null;
  allies: number | null;
  enemies: number | null;
};

export function getNextGame(puuid: string): Promise<PastGame[]> {
  return invoke<PastGame[]>("get_next_game", { puuid });
}

export type Rate = { wins: number; losses: number };

export type Condition = { key: string; title: string; detail: string; rate: Rate };

export type Lobby = { allies: number | null; enemies: number | null; games: number };

export type NextGameReport = {
  overall: Rate;
  conditions: Condition[];
  lobby: Lobby;
};

export const MIN_SAMPLE = 5;
const SESSION_GAP_MS = 2 * 3600 * 1000;
const LOBBY_GAMES = 10;
const STREAK_CAP = 3;

const plural = (count: number, one: string, many: string) => (lang() === "en" ? count !== 1 : count > 1) ? many : one;

export const winShare = (rate: Rate) => (rate.wins + rate.losses > 0 ? (rate.wins * 100) / (rate.wins + rate.losses) : null);

function rateOf(games: PastGame[]): Rate {
  const wins = games.filter((game) => game.won).length;
  return { wins, losses: games.length - wins };
}

const timeOf = (game: PastGame) => new Date(game.startedAt).getTime();

function band(hour: number): number {
  if (hour >= 6 && hour < 12) return 0;
  if (hour >= 12 && hour < 18) return 1;
  if (hour >= 18 && hour < 22) return 2;
  return 3;
}

const BANDS = () => [
  t("le matin, de 6 h à 12 h", "in the morning, 6am to noon"),
  t("l'après-midi, de 12 h à 18 h", "in the afternoon, noon to 6pm"),
  t("en soirée, de 18 h à 22 h", "in the evening, 6pm to 10pm"),
  t("la nuit, de 22 h à 6 h", "at night, 10pm to 6am"),
];

function sessionPosition(games: PastGame[], index: number, now?: number): number {
  let position = 0;
  let next = now ?? timeOf(games[index]);
  for (let cursor = now === undefined ? index - 1 : index; cursor >= 0; cursor -= 1) {
    if (next - timeOf(games[cursor]) > SESSION_GAP_MS) break;
    position += 1;
    next = timeOf(games[cursor]);
  }
  return position;
}

const sessionBucket = (position: number) => (position === 0 ? 0 : position <= 2 ? 1 : position <= 4 ? 2 : 3);

const SESSIONS = () => [
  t("1re game de la session", "1st game of the session"),
  t("2e ou 3e game de la session", "2nd or 3rd game of the session"),
  t("4e ou 5e game de la session", "4th or 5th game of the session"),
  t("6e game ou plus de la session", "6th game or later in the session"),
];

function streakBefore(games: PastGame[], index: number): number {
  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const won = games[cursor].won;
    if (streak === 0) streak = won ? 1 : -1;
    else if (streak > 0 === won) streak += won ? 1 : -1;
    else break;
  }
  return Math.max(-STREAK_CAP, Math.min(STREAK_CAP, streak));
}

function streakLabel(streak: number): string {
  const size = Math.abs(streak);
  const atLeast = size >= STREAK_CAP;
  if (streak > 0) {
    return atLeast
      ? t(`Après au moins ${size} victoires d'affilée`, `After at least ${size} wins in a row`)
      : t(`Après ${size} victoire${size > 1 ? "s" : ""} d'affilée`, `After ${size} ${plural(size, "win", "wins")} in a row`);
  }
  return atLeast
    ? t(`Après au moins ${size} défaites d'affilée`, `After at least ${size} losses in a row`)
    : t(`Après ${size} défaite${size > 1 ? "s" : ""} d'affilée`, `After ${size} ${plural(size, "loss", "losses")} in a row`);
}

const breakBucket = (gapMs: number) => (gapMs < SESSION_GAP_MS ? 0 : gapMs < 24 * 3600 * 1000 ? 1 : gapMs < 7 * 24 * 3600 * 1000 ? 2 : 3);

const BREAKS = () => [
  t("Moins de 2 h après la game précédente", "Less than 2 hours after the previous game"),
  t("Après une pause de 2 h à 1 jour", "After a break of 2 hours to 1 day"),
  t("Après une pause de 1 à 7 jours", "After a break of 1 to 7 days"),
  t("Après une pause de plus de 7 jours", "After a break of more than 7 days"),
];

function average(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

export function tierGap(value: number | null): string {
  if (value === null) return t("niveau inconnu", "unknown level");
  const size = Math.abs(value);
  if (size < 0.25) return t("à ton niveau", "at your level");
  const amount = fmt(size, 1);
  return value > 0
    ? t(`${amount} rang${size >= 2 ? "s" : ""} au-dessus de toi`, `${amount} ${plural(Math.round(size), "rank", "ranks")} above you`)
    : t(`${amount} rang${size >= 2 ? "s" : ""} en dessous de toi`, `${amount} ${plural(Math.round(size), "rank", "ranks")} below you`);
}

export function buildReport(history: PastGame[], mapId: string | null, agentId: string | null, now: Date): NextGameReport {
  const games = history.filter((game) => !game.draw);
  const overall = rateOf(games);
  const conditions: Condition[] = [];
  const nowMs = now.getTime();

  if (mapId) {
    const onMap = games.filter((game) => game.mapId === mapId);
    const name = onMap[0]?.mapName ?? history.find((game) => game.mapId === mapId)?.mapName ?? "";
    conditions.push({ key: "map", title: t(`Sur ${name}`, `On ${name}`), detail: t("Tous tes matchs sur cette map", "All your matches on this map"), rate: rateOf(onMap) });
  }
  if (agentId) {
    const withAgent = games.filter((game) => game.agentId?.toLowerCase() === agentId.toLowerCase());
    const name = withAgent[0]?.agentName ?? "";
    conditions.push({ key: "agent", title: t(`Avec ${name}`, `With ${name}`), detail: t("Tous tes matchs avec cet agent", "All your matches with this agent"), rate: rateOf(withAgent) });
    if (mapId) {
      const both = withAgent.filter((game) => game.mapId === mapId);
      conditions.push({ key: "map-agent", title: t("Cette map avec cet agent", "This map with this agent"), detail: t("Les deux à la fois", "Both at once"), rate: rateOf(both) });
    }
  }

  const nowBand = band(now.getHours());
  conditions.push({
    key: "hour",
    title: t(`Il est ${now.getHours()} h`, `It is ${now.getHours()}:00`),
    detail: t(`Tes matchs joués ${BANDS()[nowBand]}`, `Your matches played ${BANDS()[nowBand]}`),
    rate: rateOf(games.filter((game) => band(new Date(game.startedAt).getHours()) === nowBand)),
  });

  const weekend = now.getDay() === 0 || now.getDay() === 6;
  conditions.push({
    key: "day",
    title: weekend ? t("On est le week-end", "It is the weekend") : t("On est en semaine", "It is a weekday"),
    detail: weekend ? t("Tes matchs du samedi et du dimanche", "Your Saturday and Sunday matches") : t("Tes matchs du lundi au vendredi", "Your Monday to Friday matches"),
    rate: rateOf(games.filter((game) => {
      const day = new Date(game.startedAt).getDay();
      return (day === 0 || day === 6) === weekend;
    })),
  });

  if (games.length > 0) {
    const position = sessionPosition(games, games.length - 1, nowMs);
    const bucket = sessionBucket(position);
    conditions.push({
      key: "session",
      title: position === 0 ? t("Première game de la session", "First game of the session") : t(`${position} game${position > 1 ? "s" : ""} déjà jouée${position > 1 ? "s" : ""}`, `${position} ${plural(position, "game", "games")} already played`),
      detail: t(`Tes matchs joués en ${SESSIONS()[bucket].toLowerCase()}`, `Your matches played as the ${SESSIONS()[bucket].toLowerCase()}`),
      rate: rateOf(games.filter((_, index) => sessionBucket(sessionPosition(games, index)) === bucket)),
    });

    const streak = streakBefore(games, games.length);
    if (streak !== 0) {
      const matching = games.filter((_, index) => {
        const before = streakBefore(games, index);
        return Math.sign(before) === Math.sign(streak) && Math.abs(before) >= Math.abs(streak);
      });
      conditions.push({ key: "streak", title: streakLabel(streak), detail: t("Tes matchs joués juste après une série pareille", "Your matches played right after a similar streak"), rate: rateOf(matching) });
    }

    const gap = nowMs - timeOf(games[games.length - 1]);
    const breakNow = breakBucket(gap);
    conditions.push({
      key: "break",
      title: BREAKS()[breakNow],
      detail: t("Tes matchs joués après une pause pareille", "Your matches played after a similar break"),
      rate: rateOf(games.filter((game, index) => index > 0 && breakBucket(timeOf(game) - timeOf(games[index - 1])) === breakNow)),
    });
  }

  const recent = games.slice(-LOBBY_GAMES);
  const lobby: Lobby = {
    allies: average(recent.map((game) => (game.tier !== null && game.allies !== null ? game.allies - game.tier : null))),
    enemies: average(recent.map((game) => (game.tier !== null && game.enemies !== null ? game.enemies - game.tier : null))),
    games: recent.length,
  };
  if (lobby.enemies !== null) {
    const stronger = lobby.enemies >= 0.25;
    const weaker = lobby.enemies <= -0.25;
    const matching = games.filter((game) => {
      if (game.tier === null || game.enemies === null) return false;
      const gapNow = game.enemies - game.tier;
      return stronger ? gapNow >= 0.25 : weaker ? gapNow <= -0.25 : Math.abs(gapNow) < 0.25;
    });
    conditions.push({
      key: "lobby",
      title: t(`Adversaires récents ${tierGap(lobby.enemies)}`, `Recent opponents ${tierGap(lobby.enemies)}`),
      detail: stronger
        ? t("Tes matchs contre des adversaires au-dessus de toi", "Your matches against opponents above you")
        : weaker
          ? t("Tes matchs contre des adversaires en dessous de toi", "Your matches against opponents below you")
          : t("Tes matchs contre des adversaires à ton niveau", "Your matches against opponents at your level"),
      rate: rateOf(matching),
    });
  }

  return { overall, conditions, lobby };
}

export function pickOptions(history: PastGame[]) {
  const maps = new Map<string, { name: string; count: number }>();
  const agents = new Map<string, { name: string; count: number }>();
  history.forEach((game) => {
    if (game.mapId) {
      const entry = maps.get(game.mapId) ?? { name: game.mapName ?? game.mapId, count: 0 };
      entry.count += 1;
      maps.set(game.mapId, entry);
    }
    if (game.agentId) {
      const key = game.agentId.toLowerCase();
      const entry = agents.get(key) ?? { name: game.agentName ?? game.agentId, count: 0 };
      entry.count += 1;
      agents.set(key, entry);
    }
  });
  const sorted = (source: Map<string, { name: string; count: number }>) =>
    [...source.entries()].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { maps: sorted(maps), agents: sorted(agents) };
}
