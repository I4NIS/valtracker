import type { Account } from "../lib/api";
import { seasonLabel } from "../lib/assets";
import { fmt, pct } from "../lib/format";
import type { ActRecap } from "../lib/recap";
import {
  C,
  H,
  M,
  W,
  agentBust,
  background,
  cardArt,
  clipRounded,
  contain,
  cover,
  createCanvas,
  dayLabel,
  ensureFonts,
  fillRounded,
  fitFont,
  fitHeight,
  font,
  footer,
  fullPortrait,
  header,
  label,
  loadAll,
  playTime,
  plural,
  rankArt,
  rankLine,
  shade,
  signedRr,
  statRow,
  strokeRounded,
  text,
  timeLabel,
  today,
  withAlpha,
  type Ctx,
} from "./draw";
import { record } from "./session";

const LEFT_W = 1010;
const NIGHT_END_HOUR = 6;
const TILES = 12;

type Tile = { title: string; value: string; detail: string; icon?: HTMLImageElement | null; color?: string };

function favouriteHour(recap: ActRecap): number | null {
  const counts = new Array<number>(24).fill(0);
  for (const game of recap.matches) counts[new Date(game.startedAt).getHours()] += 1;
  const best = counts.reduce((top, count, hour) => (count > counts[top] ? hour : top), 0);
  return counts[best] > 0 ? best : null;
}

function latestNight(recap: ActRecap): string | null {
  let best: { minutes: number; iso: string } | null = null;
  for (const game of recap.matches) {
    const date = new Date(game.startedAt);
    if (date.getHours() >= NIGHT_END_HOUR) continue;
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (!best || minutes > best.minutes) best = { minutes, iso: game.startedAt };
  }
  return best?.iso ?? null;
}

function tiles(recap: ActRecap, icons: { nemesis: HTMLImageElement | null; victim: HTMLImageElement | null }): Tile[] {
  const list: Tile[] = [];
  list.push({ title: "Balles dans les pieds", value: fmt(recap.legshots), detail: `${pct(recap.legPct)} de tes tirs` });
  if (recap.aces + recap.fourKs > 0) {
    list.push({
      title: recap.aces > 0 ? "Aces" : "Rounds à 4 kills",
      value: fmt(recap.aces > 0 ? recap.aces : recap.fourKs),
      detail: recap.aces > 0 ? `${plural(recap.fourKs, "round")} à 4 kills` : `${plural(recap.threeKs, "round")} à 3 kills`,
    });
  }
  if (recap.clutchAttempts > 0) {
    list.push({ title: "Clutchs gagnés", value: fmt(recap.clutchesWon), detail: `sur ${fmt(recap.clutchAttempts)} tentés` });
  }
  if (recap.longestKill) {
    const where = [recap.longestKill.weapon, recap.longestKill.mapName].filter(Boolean).join(" sur ");
    list.push({ title: "Plus long kill", value: `${fmt(recap.longestKill.meters)} m`, detail: where });
  }
  list.push({ title: "First bloods", value: fmt(recap.firstBloods), detail: `${plural(recap.firstDeaths, "first death")}` });
  list.push({ title: "Dégâts infligés", value: fmt(recap.damageDealt), detail: `${fmt(recap.damageReceived)} subis` });
  if (recap.nemesis) {
    list.push({ title: "Némésis", value: recap.nemesis.name, detail: `t'a tué ${plural(recap.nemesis.killedMe, "fois", "fois")}`, icon: icons.nemesis });
  }
  if (recap.victim) {
    list.push({ title: "Victime préférée", value: recap.victim.name, detail: `tué ${plural(recap.victim.killedByMe, "fois", "fois")}`, icon: icons.victim });
  }
  if (recap.plants + recap.defuses > 0) {
    list.push({ title: "Spikes posés", value: fmt(recap.plants), detail: `${fmt(recap.defuses)} désamorcés` });
  }
  if (recap.longestWinStreak >= 2) {
    list.push({ title: "Meilleure série", value: plural(recap.longestWinStreak, "victoire"), detail: "d'affilée", color: C.win });
  }
  const weapon = recap.weapons[0];
  if (weapon) list.push({ title: "Arme préférée", value: weapon.name, detail: plural(weapon.kills, "kill") });
  const night = latestNight(recap);
  if (night) list.push({ title: "Partie la plus tardive", value: timeLabel(night), detail: `le ${dayLabel(night)}` });
  const hour = favouriteHour(recap);
  if (hour !== null) list.push({ title: "Heure préférée", value: `${hour} h`, detail: "pour lancer une partie" });
  if (recap.knifeKills > 0) list.push({ title: "Kills au couteau", value: fmt(recap.knifeKills), detail: "au corps à corps" });
  const map = recap.maps[0];
  if (map) list.push({ title: "Map préférée", value: map.mapName, detail: `${plural(map.matches, "partie")}, ${map.wins} V` });
  list.push({ title: "Rounds joués", value: fmt(recap.rounds), detail: `${fmt(recap.roundsWon)} gagnés` });
  return list.slice(0, TILES);
}

function tile(ctx: Ctx, item: Tile, x: number, y: number, w: number, h: number) {
  fillRounded(ctx, x, y, w, h, 18, C.panel);
  strokeRounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18, C.line);
  const pad = 20;
  label(ctx, item.title, x + pad, y + 32, C.text3, "left", w - pad * 2);
  let vx = x + pad;
  if (item.icon) {
    clipRounded(ctx, vx, y + 46, 34, 34, 8, () => {
      ctx.fillStyle = C.raised;
      ctx.fillRect(vx, y + 46, 34, 34);
      contain(ctx, item.icon as HTMLImageElement, vx, y + 46, 34);
    });
    vx += 44;
  }
  const size = fitFont(ctx, item.value, 800, 32, x + w - pad - vx, 20);
  text(ctx, item.value, vx, y + 76, { font: font(800, size), color: item.color ?? C.text, spacing: -0.4, maxWidth: x + w - pad - vx });
  text(ctx, item.detail, x + pad, y + h - 20, { font: font(500, 16), color: C.text2, maxWidth: w - pad * 2 });
}

function rankPanel(ctx: Ctx, recap: ActRecap, art: Record<string, HTMLImageElement | null>, x: number, y: number, w: number, h: number) {
  fillRounded(ctx, x, y, w, h, 22, C.panel);
  strokeRounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 22, C.line);
  const pad = 24;
  label(ctx, "Rang sur l'acte", x + pad, y + 36);
  const iconY = y + 56;
  if (art.start) contain(ctx, art.start, x + pad, iconY, 68);
  ctx.save();
  ctx.strokeStyle = C.text3;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const ay = iconY + 34;
  const ax = x + pad + 82;
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + 30, ay);
  ctx.moveTo(ax + 21, ay - 9);
  ctx.lineTo(ax + 30, ay);
  ctx.lineTo(ax + 21, ay + 9);
  ctx.stroke();
  ctx.restore();
  if (art.end) contain(ctx, art.end, x + pad + 126, iconY, 68);
  const tx = x + pad + 214;
  const maxWidth = x + w - pad - tx;
  text(ctx, rankLine(recap.end), tx, iconY + 30, { font: font(700, 21), maxWidth });
  text(ctx, `Début : ${rankLine(recap.start)}`, tx, iconY + 56, { font: font(500, 16), color: C.text2, maxWidth });
  const peakY = y + h - 30;
  if (art.peak) contain(ctx, art.peak, x + pad, peakY - 24, 32);
  text(ctx, `Pic : ${rankLine(recap.peak)}`, x + pad + 42, peakY, { font: font(600, 17), color: C.gold, maxWidth: w - pad * 2 - 42 });
}

export async function renderActRecap(recap: ActRecap, account: Account): Promise<HTMLCanvasElement> {
  const agent = recap.agents[0] ?? null;
  const map = recap.maps[0] ?? null;
  const [, art] = await Promise.all([
    ensureFonts(),
    loadAll({
      splash: map?.splash,
      portrait: fullPortrait(agent?.agentId),
      start: rankArt(recap.start.tier),
      end: rankArt(recap.end.tier),
      peak: rankArt(recap.peak.tier),
      nemesis: agentBust(recap.nemesis?.agentId),
      victim: agentBust(recap.victim?.agentId),
      card: cardArt(account.cardId),
      own: rankArt(account.tier),
    }),
  ]);
  const { canvas, ctx } = createCanvas();

  background(ctx);
  if (art.splash) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    cover(ctx, art.splash, 0, 0, W, H, 0.5, 0.4);
    ctx.restore();
  }
  shade(ctx, [[0, "rgba(14,17,22,0.97)"], [0.55, "rgba(14,17,22,0.9)"], [0.8, "rgba(14,17,22,0.5)"], [1, "rgba(14,17,22,0.75)"]], 0, 0, W, 0);
  if (art.portrait) fitHeight(ctx, art.portrait, 1300, 40, 820);
  shade(ctx, [[0, "rgba(14,17,22,0)"], [0.52, "rgba(14,17,22,0.05)"], [0.66, "rgba(14,17,22,0.8)"], [1, "rgba(14,17,22,1)"]], 0, 0, 0, H);
  const glow = ctx.createRadialGradient(140, 120, 20, 140, 120, 700);
  glow.addColorStop(0, withAlpha(C.accent, 0.12));
  glow.addColorStop(1, withAlpha(C.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  header(ctx, "Récap d'acte");

  text(ctx, recap.season ? seasonLabel(recap.season) : "Toutes les saisons", M, 176, { font: font(800, 58), spacing: -1.4 });
  const first = recap.matches[0]?.startedAt;
  const last = recap.matches[recap.matches.length - 1]?.startedAt;
  text(ctx, `${plural(recap.matches.length, "partie")}, ${playTime(recap.playedMs)} de jeu, du ${dayLabel(first)} au ${dayLabel(last)}`, M, 218, {
    font: font(500, 22),
    color: C.text2,
  });

  const heroY = 268;
  label(ctx, "Bilan", M, heroY);
  record(ctx, M, heroY + 70, recap.wins, recap.losses, recap.draws, 60);
  text(ctx, `${pct(recap.winPct, 0)} de victoires`, M, heroY + 100, { font: font(500, 17), color: C.text2 });
  statRow(ctx, M + 300, heroY, LEFT_W - M - 300, [
    { title: "K/D", value: fmt(recap.kd, 2), sub: plural(recap.kills, "kill") },
    { title: "ACS", value: fmt(recap.acs), sub: `${fmt(recap.adr)} ADR` },
    { title: "HS", value: pct(recap.hsPct), sub: `${pct(recap.bodyPct, 0)} au corps` },
    {
      title: "RR",
      value: recap.rrKnown > 0 ? signedRr(recap.rrNet) : "Inconnu",
      color: recap.rrKnown === 0 ? C.text2 : recap.rrNet >= 0 ? C.win : C.bad,
      sub: recap.rrKnown < recap.matches.length ? `sur ${plural(recap.rrKnown, "partie")}` : "sur l'acte",
    },
  ], 50);

  const list = tiles(recap, { nemesis: art.nemesis, victim: art.victim });
  const gridY = 410;
  const gap = 14;
  const cols = 4;
  const rows = Math.ceil(list.length / cols);
  const tileW = (LEFT_W - M - gap * (cols - 1)) / cols;
  const tileH = (H - 116 - gridY - gap * (rows - 1)) / Math.max(rows, 3);
  list.forEach((item, index) => {
    tile(ctx, item, M + (index % cols) * (tileW + gap), gridY + Math.floor(index / cols) * (tileH + gap), tileW, tileH);
  });

  const rightX = LEFT_W + 40;
  const rightW = W - M - rightX;
  if (agent) {
    label(ctx, "Agent préféré", rightX, 470, C.text2);
    text(ctx, agent.agentName ?? "Agent", rightX, 518, { font: font(800, 44), spacing: -0.8 });
    text(ctx, `${plural(agent.matches, "partie")}, ${agent.wins} V`, rightX, 548, { font: font(500, 18), color: C.text2 });
  }
  rankPanel(ctx, recap, art, rightX, 590, rightW, H - 116 - 590);

  footer(ctx, account, today(), art.card, art.own);
  return canvas;
}
