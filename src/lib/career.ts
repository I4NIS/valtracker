import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fmt, pct } from "./format";
import { t } from "./i18n";
import { invalidate } from "./query";

export type AccoladeStat = { id: string; kind: string | null; count: number; best: number };

export type Accolades = { available: boolean; allTime: AccoladeStat[]; matches: number };

export type MatchAccolade = { id: string; kind: string | null; value: number; actRecord: boolean };

export const getAccolades = (puuid: string) => invoke<Accolades>("get_accolades", { puuid });

export const CAREER_PREFIXES = ["accolades|"];

listen<string>("career-changed", (event) => {
  for (const prefix of CAREER_PREFIXES) invalidate(`${prefix}${event.payload}`);
}).catch(() => undefined);

const ACCOLADE_LABELS: Record<string, [string, string]> = {
  kills: ["Kills", "Kills"],
  first_blood: ["Premiers sangs", "First bloods"],
  damage_per_round: ["Dégâts par round", "Damage per round"],
  clutches: ["Clutchs", "Clutches"],
  aces: ["Aces", "Aces"],
  trades: ["Trades", "Trades"],
  headshot_percentage: ["Headshot", "Headshot"],
  distinction: ["Distinction", "Distinction"],
  assists: ["Assists", "Assists"],
  top_frag: ["Top frag", "Top frag"],
  plants: ["Spikes posés", "Spike plants"],
  mvp: ["MVP", "MVP"],
};

export function accoladeLabel(kind: string | null): string | null {
  const label = kind ? ACCOLADE_LABELS[kind] : undefined;
  return label ? t(label[0], label[1]) : null;
}

export function accoladeValue(kind: string | null, value: number): string {
  if (kind === "headshot_percentage") return pct(value <= 1 ? value * 100 : value, 0);
  if (kind === "damage_per_round") return fmt(value);
  return Number.isInteger(value) ? String(value) : fmt(value, 1);
}
