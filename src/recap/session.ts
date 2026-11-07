import type { Account } from "../lib/api";
import { fmt, pct } from "../lib/format";
import { t } from "../lib/i18n";
import type { RecapMatch, SessionRecap } from "../lib/recap";
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
  loadImage,
  measure,
  plural,
  playTime,
  rankArt,
  rankLine,
  resultColor,
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

const LEFT_W = 1010;
const MAX_CARDS = 16;

const matchCount = (count: number) => plural(count, t("partie", "match"), t("parties", "matches"));

type Art = Map<string, HTMLImageElement | null>;

function arrow(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = C.text3;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 34, y);
  ctx.moveTo(x + 24, y - 10);
  ctx.lineTo(x + 34, y);
  ctx.lineTo(x + 24, y + 10);
  ctx.stroke();
  ctx.restore();
}

export function record(ctx: Ctx, x: number, y: number, wins: number, losses: number, draws: number, size: number): number {
  let cx = x;
  const parts: [number, string, string][] = [[wins, t("V", "W"), C.win], [losses, t("D", "L"), C.bad]];
  if (draws) parts.push([draws, t("N", "D"), C.text2]);
  parts.forEach(([value, letter, color], index) => {
    cx += text(ctx, String(value), cx, y, { font: font(800, size), spacing: -1 });
    cx += 4;
    cx += text(ctx, letter, cx, y, { font: font(800, Math.round(size * 0.5)), color });
    if (index < parts.length - 1) cx += size * 0.42;
  });
  return cx - x;
}

function card(ctx: Ctx, game: RecapMatch, x: number, y: number, w: number, h: number, art: Art, best: boolean, dated: boolean) {
  const tone = resultColor(game.won, game.draw);
  const map = game.mapImage ? art.get(game.mapImage) : null;
  clipRounded(ctx, x, y, w, h, 16, () => {
    ctx.fillStyle = C.panelSolid;
    ctx.fillRect(x, y, w, h);
    if (map) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      cover(ctx, map, x, y, w, h, 0.5, 0.5);
      ctx.restore();
    }
    const fade = ctx.createLinearGradient(0, y, 0, y + h);
    fade.addColorStop(0, "rgba(14,17,22,0.35)");
    fade.addColorStop(1, "rgba(14,17,22,0.92)");
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = tone;
    ctx.fillRect(x, y + h - 5, w, 5);
  });
  strokeRounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16, best ? withAlpha(C.gold, 0.7) : C.line);
  const compact = h < 120;
  const pad = compact ? 12 : 16;
  const icon = game.agentId ? art.get(game.agentId) : null;
  const iconSize = compact ? 30 : 40;
  if (icon) {
    clipRounded(ctx, x + w - pad - iconSize, y + pad, iconSize, iconSize, 9, () => {
      ctx.fillStyle = "rgba(14,17,22,0.6)";
      ctx.fillRect(x + w - pad - iconSize, y + pad, iconSize, iconSize);
      contain(ctx, icon, x + w - pad - iconSize, y + pad, iconSize);
    });
  }
  const nameWidth = w - pad * 2 - iconSize - 8;
  text(ctx, game.mapName ?? "Map", x + pad, y + pad + (compact ? 14 : 18), { font: font(700, compact ? 15 : 18), maxWidth: nameWidth });
  if (!compact) {
    const when = dated ? `${dayLabel(game.startedAt)}, ${timeLabel(game.startedAt)}` : timeLabel(game.startedAt);
    text(ctx, when, x + pad, y + pad + 40, { font: font(500, 15), color: C.text2, maxWidth: w - pad * 2 });
  }
  const scoreY = compact ? y + h - 18 : y + h - 64;
  text(ctx, `${game.roundsWon} - ${game.roundsLost}`, x + pad, scoreY, { font: font(800, compact ? 22 : 30), color: tone, spacing: -0.5 });
  if (game.rrChange !== null) {
    text(ctx, signedRr(game.rrChange), x + w - pad, scoreY, {
      font: font(700, compact ? 15 : 17),
      color: game.rrChange >= 0 ? C.win : C.bad,
      align: "right",
    });
  }
  if (!compact) {
    text(ctx, `${game.kills} / ${game.deaths} / ${game.assists}`, x + pad, y + h - 26, { font: font(600, 16), color: C.text2 });
    text(ctx, `${fmt(game.acs)} ACS`, x + w - pad, y + h - 26, { font: font(600, 16), color: C.text2, align: "right" });
  }
  if (best) {
    const tag = t("Meilleur match", "Best match");
    const tagW = measure(ctx, tag.toUpperCase(), font(700, 11), 1.2) + 16;
    fillRounded(ctx, x + pad, y - 11, tagW, 22, 11, C.gold);
    text(ctx, tag.toUpperCase(), x + pad + tagW / 2, y + 4, { font: font(700, 11), color: C.bg, align: "center", spacing: 1.2 });
  }
}

function strip(ctx: Ctx, recap: SessionRecap, art: Art, dated: boolean) {
  const games = recap.matches.slice(-MAX_CARDS);
  const top = 584;
  const bottom = H - 116;
  const gap = 14;
  const rows = games.length > 8 ? 2 : 1;
  const perRow = Math.ceil(games.length / rows);
  const width = W - M * 2;
  const cardW = Math.min(300, (width - gap * (perRow - 1)) / perRow);
  const cardH = rows === 1 ? bottom - top - 16 : (bottom - top - 16 - gap) / 2;
  const showBest = games.length > 1;
  label(ctx, recap.matches.length > MAX_CARDS ? t(`${MAX_CARDS} dernières parties`, `Last ${MAX_CARDS} matches`) : t("Parties", "Matches"), M, top - 6, C.text2);
  games.forEach((game, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    card(ctx, game, M + col * (cardW + gap), top + 16 + row * (cardH + gap), cardW, cardH, art, showBest && game.matchId === recap.bestMatchId, dated);
  });
}

function rankBlock(ctx: Ctx, recap: SessionRecap, art: Art, x: number, y: number) {
  label(ctx, t("Rang", "Rank"), x, y);
  const before = art.get("before");
  const after = art.get("after");
  if (before) contain(ctx, before, x, y + 14, 76);
  arrow(ctx, x + 92, y + 52);
  if (after) contain(ctx, after, x + 142, y + 14, 76);
  text(ctx, rankLine(recap.after), x + 236, y + 50, { font: font(700, 24) });
  text(ctx, t(`Avant : ${rankLine(recap.before)}`, `Before: ${rankLine(recap.before)}`), x + 236, y + 80, { font: font(500, 17), color: C.text2 });
}

export type Heading = { kind: string; title: string; span: string; dated: boolean };

export function renderSessionRecap(recap: SessionRecap, account: Account): Promise<HTMLCanvasElement> {
  return renderSummaryRecap(recap, account, {
    kind: t("Récap de session", "Session recap"),
    title: t(`Session du ${dayLabel(recap.startedAt)}`, `${dayLabel(recap.startedAt)} session`),
    span: t(`${timeLabel(recap.startedAt)} à ${timeLabel(recap.endedAt)}`, `${timeLabel(recap.startedAt)} to ${timeLabel(recap.endedAt)}`),
    dated: false,
  });
}

export async function renderSummaryRecap(recap: SessionRecap, account: Account, heading: Heading): Promise<HTMLCanvasElement> {
  const games = recap.matches.slice(-MAX_CARDS);
  const mainAgent = recap.agents[0]?.agentId ?? null;
  const counts = new Map<string, number>();
  for (const game of recap.matches) if (game.splash) counts.set(game.splash, (counts.get(game.splash) ?? 0) + 1);
  const splash = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const keys = [
    ...new Set([...games.map((game) => game.mapImage), ...recap.agents.map((agent) => agent.agentId), ...games.map((game) => game.agentId)]),
  ].filter((key): key is string => Boolean(key));
  const [, base, list] = await Promise.all([
    ensureFonts(),
    loadAll({
      splash,
      portrait: fullPortrait(mainAgent),
      before: rankArt(recap.before.tier),
      after: rankArt(recap.after.tier),
      card: cardArt(account.cardId),
      own: rankArt(account.tier),
    }),
    Promise.all(keys.map((key) => loadImage(key.startsWith("http") ? key : agentBust(key)))),
  ]);
  const art: Art = new Map(keys.map((key, index) => [key, list[index]]));
  art.set("before", base.before);
  art.set("after", base.after);
  const { canvas, ctx } = createCanvas();

  background(ctx);
  if (base.splash) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    cover(ctx, base.splash, 0, 0, W, H, 0.5, 0.4);
    ctx.restore();
  }
  shade(ctx, [[0, "rgba(14,17,22,0.97)"], [0.5, "rgba(14,17,22,0.86)"], [0.75, "rgba(14,17,22,0.45)"], [1, "rgba(14,17,22,0.7)"]], 0, 0, W, 0);
  if (base.portrait) {
    fitHeight(ctx, base.portrait, 1300, 20, 900);
  }
  shade(ctx, [[0, "rgba(14,17,22,0)"], [0.5, "rgba(14,17,22,0.1)"], [0.64, "rgba(14,17,22,0.88)"], [1, "rgba(14,17,22,1)"]], 0, 0, 0, H);
  const glow = ctx.createRadialGradient(140, 120, 20, 140, 120, 700);
  glow.addColorStop(0, withAlpha(C.accent, 0.1));
  glow.addColorStop(1, withAlpha(C.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  header(ctx, heading.kind);

  text(ctx, heading.title, M, 178, { font: font(800, fitFont(ctx, heading.title, 800, 58, LEFT_W - M, 40)), spacing: -1.4 });
  const span = heading.span;
  text(ctx, t(`${span}, ${matchCount(recap.matches.length)}, ${playTime(recap.playedMs)} de jeu`, `${span}, ${matchCount(recap.matches.length)}, ${playTime(recap.playedMs)} played`), M, 220, {
    font: font(500, 22),
    color: C.text2,
    maxWidth: LEFT_W - M,
  });

  const heroY = 270;
  label(ctx, t("Bilan", "Record"), M, heroY);
  record(ctx, M, heroY + 74, recap.wins, recap.losses, recap.draws, 68);
  const rrX = M + 250;
  label(ctx, "RR", rrX, heroY);
  if (recap.rrKnown > 0) {
    text(ctx, signedRr(recap.rrNet), rrX, heroY + 74, { font: font(800, 68), color: recap.rrNet >= 0 ? C.win : C.bad, spacing: -1 });
    if (recap.rrKnown < recap.matches.length) {
      text(ctx, t(`sur ${matchCount(recap.rrKnown)}`, `over ${matchCount(recap.rrKnown)}`), rrX, heroY + 104, { font: font(500, 17), color: C.text2 });
    }
  } else {
    text(ctx, t("Inconnu", "Unknown"), rrX, heroY + 74, { font: font(800, 44), color: C.text2 });
  }
  rankBlock(ctx, recap, art, M + 530, heroY);

  const boxY = 418;
  const boxW = LEFT_W - M;
  fillRounded(ctx, M, boxY, boxW, 120, 22, C.panel);
  strokeRounded(ctx, M + 0.5, boxY + 0.5, boxW - 1, 119, 22, C.line);
  statRow(ctx, M + 32, boxY + 40, boxW - 64, [
    { title: "K / D / A", value: `${recap.kills} / ${recap.deaths} / ${recap.assists}` },
    { title: "K/D", value: fmt(recap.kd, 2) },
    { title: t("ACS moyen", "Avg ACS"), value: fmt(recap.acs) },
    { title: "HS", value: pct(recap.hsPct) },
    { title: "ADR", value: fmt(recap.adr) },
  ], 36);

  const agentsX = LEFT_W + 40;
  const agentsW = W - M - agentsX;
  fillRounded(ctx, agentsX, boxY, agentsW, 120, 22, C.panel);
  strokeRounded(ctx, agentsX + 0.5, boxY + 0.5, agentsW - 1, 119, 22, C.line);
  label(ctx, recap.agents.length > 1 ? t("Agents joués", "Agents played") : t("Agent joué", "Agent played"), agentsX + 24, boxY + 40);
  let ax = agentsX + 24;
  for (const agent of recap.agents.slice(0, recap.agents.length > 1 ? 6 : 1)) {
    const icon = art.get(agent.agentId);
    if (icon) {
      clipRounded(ctx, ax, boxY + 54, 44, 44, 10, () => {
        ctx.fillStyle = C.raised;
        ctx.fillRect(ax, boxY + 54, 44, 44);
        contain(ctx, icon, ax, boxY + 54, 44);
      });
    }
    if (recap.agents.length === 1) {
      text(ctx, agent.agentName ?? "Agent", ax + 58, boxY + 76, { font: font(700, 22) });
      text(ctx, t(`${agent.wins} V sur ${matchCount(agent.matches)}`, `${agent.wins} W in ${matchCount(agent.matches)}`), ax + 58, boxY + 98, { font: font(500, 16), color: C.text2 });
      ax += 56;
    } else {
      const count = text(ctx, String(agent.matches), ax + 54, boxY + 84, { font: font(700, 20) });
      ax += 54 + count + 22;
    }
    if (ax > W - M - 80) break;
  }

  strip(ctx, recap, art, heading.dated);
  footer(ctx, account, today(), base.card, base.own);
  return canvas;
}
