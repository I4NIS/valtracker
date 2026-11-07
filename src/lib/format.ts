import { locale, t } from "./i18n";

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

function number(digits: number): Intl.NumberFormat {
  const key = `${locale()}|${digits}`;
  let format = numbers.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numbers.set(key, format);
  }
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(options)}`;
  let format = dates.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale(), options);
    dates.set(key, format);
  }
  return format;
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return Number.isNaN(date.getTime()) ? String(date) : dateFormat(options).format(date);
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
const DAY_SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const HOUR_MINUTE: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

export function fmt(value: number, digits = 0): string {
  return number(digits).format(value);
}

export function pct(value: number, digits = 1): string {
  const text = fmt(value, digits);
  return t(`${text} %`, `${text}%`);
}

export function signed(value: number, digits = 0): string {
  const text = fmt(Math.abs(value), digits);
  return value >= 0 ? `+${text}` : `-${text}`;
}

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return t("jamais", "never");
  const date = new Date(iso);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return t("à l'instant", "just now");
  if (minutes < 60) return t(`il y a ${minutes} min`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`il y a ${hours} h`, `${hours}h ago`);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    const time = formatDate(date, HOUR_MINUTE);
    return t(`hier, ${time}`, `yesterday, ${time}`);
  }
  return formatDate(date, DAY_MONTH);
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour >= 18 || hour < 5) return t("Bonsoir", "Good evening");
  return t("Bonjour", hour < 12 ? "Good morning" : "Good afternoon");
}

export function scoreTone(score: number): "gold" | "good" | "bad" | "muted" {
  if (score >= 80) return "gold";
  if (score >= 50) return "good";
  if (score < 40) return "bad";
  return "muted";
}

export function duration(ms: number | null | undefined): string {
  if (!ms) return "";
  return `${Math.round(ms / 60000)} min`;
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = formatDate(date, DAY_MONTH);
  const time = formatDate(date, HOUR_MINUTE);
  return t(`${day} à ${time}`, `${day}, ${time}`);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatDate(new Date(iso), DAY_SHORT);
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const ROLES: Record<string, string> = {
  Duelist: "Duelliste",
  Initiator: "Initiateur",
  Controller: "Contrôleur",
  Sentinel: "Sentinelle",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return t(ROLES[role] ?? role, role);
}

function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  const suffix = ["th", "st", "nd", "rd"][place % 10] ?? "th";
  return `${place}${suffix}`;
}

export function placeLabel(place: number): string {
  return t(place === 1 ? "1er" : `${place}e`, ordinal(place));
}

export function tradeWindowText(ms: number): string {
  if (ms === 1000) return t("dans la seconde", "within a second");
  const seconds = fmt(ms / 1000, ms % 1000 === 0 ? 0 : 1);
  return t(`dans les ${seconds} secondes`, `within ${seconds} seconds`);
}
