import type { Account } from "../lib/api";
import { tierIcon, tierLabel, tierNameById } from "../lib/assets";
import { fmt } from "../lib/format";
import { lang, locale, t } from "../lib/i18n";
import type { RankPoint } from "../lib/recap";

export const W = 1600;
export const H = 900;
export const M = 64;

export const C = {
  bg: "#0E1116",
  panel: "rgba(20, 23, 29, 0.82)",
  panelSolid: "#151820",
  raised: "rgba(255, 255, 255, 0.05)",
  line: "rgba(255, 255, 255, 0.09)",
  text: "#F2F3F5",
  text2: "#A8ADB7",
  text3: "#7F8591",
  accent: "#FF4655",
  accent2: "#A61E2B",
  win: "#3FCF8E",
  bad: "#FF8A4C",
  gold: "#E9C46A",
};

const FAMILY = '"Inter Variable", "Inter", system-ui, sans-serif';
const MEDIA = "https://media.valorant-api.com";
const IMAGE_TIMEOUT_MS = 8000;

export type Ctx = CanvasRenderingContext2D;

export function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FAMILY}`;
}

export async function ensureFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.all([400, 500, 600, 700, 800].map((weight) => document.fonts.load(font(weight, 32), "Victoire 0123")));
  await document.fonts.ready;
}

export function createCanvas(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("Canvas indisponible", "Canvas unavailable"));
  ctx.textBaseline = "alphabetic";
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = `${url}${url.includes("?") ? "&" : "?"}export=1`;
  });
}

export async function loadAll<K extends string>(urls: Record<K, string | null | undefined>): Promise<Record<K, HTMLImageElement | null>> {
  const keys = Object.keys(urls) as K[];
  const images = await Promise.all(keys.map((key) => loadImage(urls[key])));
  return Object.fromEntries(keys.map((key, index) => [key, images[index]])) as Record<K, HTMLImageElement | null>;
}

export function fullPortrait(agentId: string | null | undefined): string | null {
  return agentId ? `${MEDIA}/agents/${agentId}/fullportrait.png` : null;
}

export function agentBust(agentId: string | null | undefined): string | null {
  return agentId ? `${MEDIA}/agents/${agentId}/displayicon.png` : null;
}

export function cardArt(cardId: string | null | undefined): string | null {
  return cardId ? `${MEDIA}/playercards/${cardId}/wideart.png` : null;
}

export function rankArt(tier: number | null | undefined): string {
  return tierIcon(tier ?? 0);
}

export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t("Export de l'image impossible", "Couldn't export the image")))), "image/png");
  });
}

export function cover(ctx: Ctx, image: HTMLImageElement, x: number, y: number, w: number, h: number, focusX = 0.5, focusY = 0.5) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.naturalWidth - sw) * focusX;
  const sy = (image.naturalHeight - sh) * focusY;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

export function fitHeight(ctx: Ctx, image: HTMLImageElement, cx: number, top: number, height: number) {
  const width = (image.naturalWidth / image.naturalHeight) * height;
  ctx.drawImage(image, cx - width / 2, top, width, height);
}

export function contain(ctx: Ctx, image: HTMLImageElement, x: number, y: number, size: number) {
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

export function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function fillRounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, stroke: string) {
  rounded(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function clipRounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, draw: () => void) {
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.clip();
  draw();
  ctx.restore();
}

type TextOptions = {
  font: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  spacing?: number;
  maxWidth?: number;
};

export function fitText(ctx: Ctx, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export function text(ctx: Ctx, value: string, x: number, y: number, options: TextOptions): number {
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color ?? C.text;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";
  ctx.letterSpacing = `${options.spacing ?? 0}px`;
  const shown = options.maxWidth ? fitText(ctx, value, options.maxWidth) : value;
  ctx.fillText(shown, x, y);
  const width = ctx.measureText(shown).width;
  ctx.restore();
  return width;
}

export function measure(ctx: Ctx, value: string, fontValue: string, spacing = 0): number {
  ctx.save();
  ctx.font = fontValue;
  ctx.letterSpacing = `${spacing}px`;
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}

export function fitFont(ctx: Ctx, value: string, weight: number, size: number, maxWidth: number, min = 18): number {
  let current = size;
  while (current > min && measure(ctx, value, font(weight, current)) > maxWidth) current -= 2;
  return current;
}

export function label(ctx: Ctx, value: string, x: number, y: number, color = C.text3, align: CanvasTextAlign = "left", maxWidth?: number): number {
  const upper = value.toUpperCase();
  let size = 14;
  let spacing = 1.6;
  while (maxWidth && size > 11 && measure(ctx, upper, font(700, size), spacing) > maxWidth) {
    if (spacing > 0.8) spacing -= 0.4;
    else size -= 1;
  }
  return text(ctx, upper, x, y, { font: font(700, size), color, spacing, align, maxWidth });
}

export function pill(ctx: Ctx, value: string, x: number, y: number, color: string, options: { size?: number; fill?: string; align?: "left" | "right" } = {}): number {
  const size = options.size ?? 18;
  const padding = size * 0.75;
  const height = size * 1.9;
  const width = measure(ctx, value, font(700, size)) + padding * 2;
  const left = options.align === "right" ? x - width : x;
  fillRounded(ctx, left, y, width, height, height / 2, options.fill ?? withAlpha(color, 0.16));
  text(ctx, value, left + width / 2, y + height / 2 + 1, { font: font(700, size), color, align: "center", baseline: "middle" });
  return width;
}

export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function logo(ctx: Ctx, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = C.accent;
  ctx.fill(new Path2D("M6 10H19L32 40V56Z"));
  ctx.fillStyle = C.accent2;
  ctx.fill(new Path2D("M58 10H45L32 40V56Z"));
  ctx.restore();
}

export function background(ctx: Ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
}

export function grain(ctx: Ctx) {
  const glow = ctx.createRadialGradient(W * 0.15, -120, 40, W * 0.15, -120, 900);
  glow.addColorStop(0, withAlpha(C.accent, 0.1));
  glow.addColorStop(1, withAlpha(C.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

export function shade(ctx: Ctx, stops: [number, string][], x0: number, y0: number, x1: number, y1: number) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

export function header(ctx: Ctx, kind: string) {
  logo(ctx, M, 44, 34);
  text(ctx, "Valtracker", M + 46, 71, { font: font(800, 22), spacing: -0.4 });
  label(ctx, kind, W - M, 68, C.text2, "right");
}

export function footer(ctx: Ctx, account: Account, dateText: string, card: HTMLImageElement | null, rank: HTMLImageElement | null = null) {
  const y = H - 92;
  ctx.fillStyle = C.line;
  ctx.fillRect(M, y, W - M * 2, 1);
  let x = M;
  if (card) {
    clipRounded(ctx, x, y + 24, 152, 44, 8, () => cover(ctx, card, x, y + 24, 152, 44));
    x += 152 + 18;
  }
  if (rank) {
    contain(ctx, rank, x, y + 26, 40);
    x += 40 + 14;
  }
  const name = text(ctx, account.name, x, y + 55, { font: font(700, 22) });
  const tag = text(ctx, `#${account.tag}`, x + name + 6, y + 55, { font: font(500, 22), color: C.text3 });
  if (account.tierName) {
    text(ctx, tierLabel(account.tierName), x + name + 6 + tag + 18, y + 55, { font: font(600, 20), color: C.text2 });
  }
  text(ctx, dateText, W - M, y + 55, { font: font(500, 20), color: C.text3, align: "right" });
}

export function rankName(rank: RankPoint): string {
  return tierNameById(rank.tier);
}

export function rankLine(rank: RankPoint): string {
  if (!rank.tier || rank.tier < 3) return t("Non classé", "Unranked");
  return rank.rr === null ? rankName(rank) : `${rankName(rank)}, ${rank.rr} RR`;
}

export function signedRr(value: number): string {
  if (value === 0) return "0 RR";
  return `${value > 0 ? "+" : "-"}${Math.abs(value)} RR`;
}

export function playTime(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang() === "en") return rest ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${hours}h`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function dayLabel(iso: string | null | undefined, year = false): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale(), year ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" });
}

export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function today(): string {
  return new Date().toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${fmt(count)} ${(lang() === "en" ? count !== 1 : count > 1) ? many : one}`;
}

export function resultColor(won: boolean, draw: boolean): string {
  if (won) return C.win;
  return draw ? C.text2 : C.bad;
}

export function stat(ctx: Ctx, x: number, y: number, title: string, value: string, options: { size?: number; color?: string; sub?: string; subColor?: string; align?: CanvasTextAlign } = {}) {
  const size = options.size ?? 44;
  const align = options.align ?? "left";
  label(ctx, title, x, y, C.text3, align);
  text(ctx, value, x, y + size + 10, { font: font(800, size), color: options.color ?? C.text, align, spacing: -0.5 });
  if (options.sub) text(ctx, options.sub, x, y + size + 36, { font: font(500, 17), color: options.subColor ?? C.text2, align });
}

export type Cell = { title: string; value: string; suffix?: string; color?: string; sub?: string; subColor?: string };

export function statRow(ctx: Ctx, x: number, y: number, width: number, cells: Cell[], size: number) {
  const suffixFont = font(600, Math.round(size * 0.46));
  const widths = cells.map((cell) =>
    Math.max(
      measure(ctx, cell.value, font(800, size), -0.5) + (cell.suffix ? 6 + measure(ctx, cell.suffix, suffixFont) : 0),
      measure(ctx, cell.title.toUpperCase(), font(700, 14), 1.6),
      cell.sub ? measure(ctx, cell.sub, font(500, 17)) : 0,
    ),
  );
  const gap = cells.length > 1 ? (width - widths.reduce((sum, value) => sum + value, 0)) / (cells.length - 1) : 0;
  let cx = x;
  cells.forEach((cell, index) => {
    stat(ctx, cx, y, cell.title, cell.value, { size, color: cell.color, sub: cell.sub, subColor: cell.subColor });
    if (cell.suffix) {
      const valueWidth = measure(ctx, cell.value, font(800, size), -0.5);
      text(ctx, cell.suffix, cx + valueWidth + 6, y + size + 10, { font: suffixFont, color: C.text3 });
    }
    if (index < cells.length - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(Math.round(cx + widths[index] + gap / 2), y - 14, 1, size + 30);
    }
    cx += widths[index] + gap;
  });
}
