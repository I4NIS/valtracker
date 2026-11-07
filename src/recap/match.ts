import type { Account, MatchDetail, PlayerLine, RoundLine, TeamBlock } from "../lib/api";
import { tierNameById } from "../lib/assets";
import { fmt, pct, placeLabel } from "../lib/format";
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
  fitHeight,
  fitText,
  font,
  footer,
  fullPortrait,
  header,
  label,
  loadAll,
  loadImage,
  pill,
  playTime,
  rankArt,
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

const PANEL_X = 1060;
const PANEL_W = W - M - PANEL_X;

function clutchesWon(rounds: RoundLine[], allies: number, enemies: number): number {
  let won = 0;
  for (const round of rounds) {
    let alliesAlive = allies;
    let enemiesAlive = enemies;
    let meAlive = true;
    for (const event of round.events) {
      if (event.kind !== "kill") continue;
      if (event.targetMe) meAlive = false;
      if (event.targetAlly) alliesAlive -= 1;
      else enemiesAlive -= 1;
      if (!meAlive) break;
      if (alliesAlive === 1 && enemiesAlive > 0) {
        if (round.won) won += 1;
        break;
      }
    }
  }
  return won;
}

function facts(detail: MatchDetail, me: PlayerLine): string[] {
  const list: string[] = [];
  if (me.badge) list.push(me.badge.charAt(0).toUpperCase() + me.badge.slice(1));
  if (me.place === 1 && me.badge !== "MVP") list.push("1er du lobby");
  const counts = [5, 4, 3].map((size) => detail.rounds.filter((round) => (size === 5 ? round.myKills >= 5 : round.myKills === size)).length);
  if (counts[0]) list.push(counts[0] > 1 ? `${counts[0]} aces` : "Ace");
  if (counts[1]) list.push(counts[1] > 1 ? `${counts[1]} rounds à 4 kills` : "1 round à 4 kills");
  if (counts[2]) list.push(counts[2] > 1 ? `${counts[2]} rounds à 3 kills` : "1 round à 3 kills");
  if (me.firstBloods) list.push(me.firstBloods > 1 ? `${me.firstBloods} first bloods` : "1 first blood");
  const mine = detail.teams.find((team) => team.mine);
  const other = detail.teams.find((team) => !team.mine);
  const clutches = clutchesWon(detail.rounds, mine?.players.length ?? 5, other?.players.length ?? 5);
  if (clutches) list.push(clutches > 1 ? `${clutches} clutchs gagnés` : "1 clutch gagné");
  return list;
}

function resultWord(detail: MatchDetail, draw: boolean): string {
  if (detail.won) return "Victoire";
  return draw ? "Égalité" : "Défaite";
}

function scoreboard(ctx: Ctx, teams: TeamBlock[], icons: Map<string, HTMLImageElement | null>, ranks: Map<number, HTMLImageElement | null>) {
  const top = 116;
  const bottom = H - 120;
  fillRounded(ctx, PANEL_X, top, PANEL_W, bottom - top, 22, C.panel);
  strokeRounded(ctx, PANEL_X + 0.5, top + 0.5, PANEL_W - 1, bottom - top - 1, 22, C.line);
  const inner = PANEL_X + 24;
  const right = PANEL_X + PANEL_W - 24;
  const kdaX = right - 92;
  const rowH = 52;
  let y = top + 26;
  for (const team of teams) {
    const color = team.won ? C.win : team.roundsWon === team.roundsLost ? C.text2 : C.bad;
    label(ctx, team.mine ? "Ton équipe" : "Adversaires", inner, y + 16, C.text2);
    text(ctx, String(team.roundsWon), inner + (team.mine ? 128 : 124), y + 17, { font: font(800, 18), color });
    label(ctx, "K / D / A", kdaX, y + 16, C.text3, "center");
    label(ctx, "ACS", right, y + 16, C.text3, "right");
    y += 32;
    for (const player of team.players.slice(0, 5)) {
      if (player.isMe) {
        fillRounded(ctx, PANEL_X + 10, y, PANEL_W - 20, rowH - 4, 12, withAlpha(C.accent, 0.14));
        fillRounded(ctx, PANEL_X + 10, y + 10, 4, rowH - 24, 2, C.accent);
      }
      const icon = player.agentId ? icons.get(player.agentId) : null;
      const cy = y + (rowH - 4) / 2;
      if (icon) {
        clipRounded(ctx, inner, cy - 16, 32, 32, 8, () => {
          ctx.fillStyle = C.raised;
          ctx.fillRect(inner, cy - 16, 32, 32);
          contain(ctx, icon, inner, cy - 16, 32);
        });
      } else {
        fillRounded(ctx, inner, cy - 16, 32, 32, 8, C.raised);
      }
      ctx.save();
      ctx.font = font(player.isMe ? 700 : 600, 17);
      const name = fitText(ctx, player.name, kdaX - 112 - (inner + 46));
      ctx.restore();
      text(ctx, name, inner + 46, cy + 6, { font: font(player.isMe ? 700 : 600, 17), color: player.isMe ? C.text : C.text2 });
      const rank = ranks.get(player.tier ?? 0);
      if (rank) contain(ctx, rank, kdaX - 102, cy - 15, 30);
      text(ctx, `${player.kills} / ${player.deaths} / ${player.assists}`, kdaX, cy + 6, {
        font: font(600, 17),
        color: player.isMe ? C.text : C.text2,
        align: "center",
      });
      text(ctx, fmt(player.acs), right, cy + 6, { font: font(700, 17), color: player.isMe ? C.text : C.text2, align: "right" });
      y += rowH;
    }
    y += 30;
  }
}

export async function renderMatchRecap(detail: MatchDetail, account: Account): Promise<HTMLCanvasElement> {
  const players = detail.teams.flatMap((team) => team.players);
  const me = players.find((player) => player.isMe);
  if (!me) throw new Error("Joueur introuvable dans ce match");
  const agentIds = [...new Set(players.map((player) => player.agentId).filter((id): id is string => Boolean(id)))];
  const [, art, iconList] = await Promise.all([
    ensureFonts(),
    loadAll({
      splash: detail.splash,
      portrait: fullPortrait(detail.agentId),
      rank: rankArt(me.tier),
      card: cardArt(account.cardId),
      own: rankArt(account.tier),
    }),
    Promise.all(agentIds.map((id) => loadImage(agentBust(id)))),
  ]);
  const tiers = [...new Set(players.map((player) => player.tier ?? 0))];
  const tierList = await Promise.all(tiers.map((tier) => loadImage(rankArt(tier))));
  const ranks = new Map(tiers.map((tier, index) => [tier, tierList[index]]));
  const icons = new Map(agentIds.map((id, index) => [id, iconList[index]]));
  const { canvas, ctx } = createCanvas();
  const draw = detail.roundsWon === detail.roundsLost && !detail.won;
  const tone = resultColor(detail.won, draw);

  background(ctx);
  if (art.splash) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    cover(ctx, art.splash, 0, 0, W, H, 0.5, 0.45);
    ctx.restore();
  }
  shade(ctx, [[0, "rgba(14,17,22,0.97)"], [0.34, "rgba(14,17,22,0.8)"], [0.6, "rgba(14,17,22,0.35)"], [1, "rgba(14,17,22,0.75)"]], 0, 0, W, 0);
  shade(ctx, [[0, "rgba(14,17,22,0)"], [0.7, "rgba(14,17,22,0.2)"], [1, "rgba(14,17,22,0.95)"]], 0, 0, 0, H);
  const glow = ctx.createRadialGradient(120, 180, 20, 120, 180, 620);
  glow.addColorStop(0, withAlpha(tone, 0.12));
  glow.addColorStop(1, withAlpha(tone, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (art.portrait) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    fitHeight(ctx, art.portrait, 830, 30, 980);
    ctx.restore();
    shade(ctx, [[0, "rgba(14,17,22,0)"], [0.78, "rgba(14,17,22,0)"], [0.93, "rgba(14,17,22,0.85)"], [1, "rgba(14,17,22,1)"]], 0, 0, 0, H);
  }

  header(ctx, "Récap de match");

  text(ctx, resultWord(detail, draw).toUpperCase(), M, 178, { font: font(800, 30), color: tone, spacing: 5 });
  const won = text(ctx, String(detail.roundsWon), M - 6, 330, { font: font(800, 168), spacing: -6 });
  const dash = text(ctx, "-", M - 6 + won + 22, 318, { font: font(700, 110), color: C.text3 });
  text(ctx, String(detail.roundsLost), M - 6 + won + dash + 44, 330, { font: font(800, 168), color: C.text2, spacing: -6 });

  const mapWidth = text(ctx, detail.mapName ?? "Map inconnue", M, 400, { font: font(800, 40), spacing: -0.6 });
  if (detail.lengthMs) text(ctx, playTime(detail.lengthMs), M + mapWidth + 16, 400, { font: font(500, 22), color: C.text2 });
  text(ctx, `${dayLabel(detail.startedAt, true)} à ${timeLabel(detail.startedAt)}`, M, 436, { font: font(500, 20), color: C.text2 });

  let x = M;
  const rowY = 476;
  if (art.rank) contain(ctx, art.rank, x, rowY, 64);
  label(ctx, "Rang", x + 80, rowY + 22);
  const rankWidth = text(ctx, tierNameById(me.tier), x + 80, rowY + 52, { font: font(700, 24) });
  x += 80 + Math.max(rankWidth, 60) + 36;
  label(ctx, "Agent", x, rowY + 22);
  const agentWidth = text(ctx, detail.agentName ?? "Inconnu", x, rowY + 52, { font: font(700, 24) });
  x += Math.max(agentWidth, 60) + 36;
  if (detail.rrChange !== null) {
    label(ctx, "RR", x, rowY + 22);
    pill(ctx, signedRr(detail.rrChange), x - 2, rowY + 30, detail.rrChange >= 0 ? C.win : C.bad, { size: 18 });
  }

  const boxY = 580;
  const boxW = PANEL_X - M - 36;
  fillRounded(ctx, M, boxY, boxW, 132, 22, C.panel);
  strokeRounded(ctx, M + 0.5, boxY + 0.5, boxW - 1, 131, 22, C.line);
  statRow(ctx, M + 32, boxY + 44, boxW - 64, [
    { title: "K / D / A", value: `${me.kills} / ${me.deaths} / ${me.assists}` },
    { title: "ACS", value: fmt(me.acs) },
    { title: "ADR", value: fmt(me.adr) },
    { title: "HS", value: pct(me.hsPct) },
    { title: "Score", value: `${me.score}`, suffix: "/100" },
    { title: "Place", value: placeLabel(me.place), suffix: "sur 10" },
  ], 38);

  let chipX = M;
  for (const fact of facts(detail, me).slice(0, 5)) {
    const width = pill(ctx, fact, chipX, 740, fact.startsWith("MVP") ? C.gold : C.text, {
      size: 17,
      fill: fact.startsWith("MVP") ? withAlpha(C.gold, 0.16) : "rgba(255,255,255,0.08)",
    });
    chipX += width + 10;
    if (chipX > PANEL_X - 160) break;
  }

  scoreboard(ctx, detail.teams, icons, ranks);
  footer(ctx, account, today(), art.card, art.own);
  return canvas;
}
