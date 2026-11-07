import { invoke } from "@tauri-apps/api/core";

export type RangeSplit = {
  short: number;
  medium: number;
  long: number;
};

export type WeaponLine = {
  name: string;
  ability: boolean;
  kills: number;
  killShare: number;
  avgKillDistance: number | null;
  killRanges: RangeSplit;
  deaths: number;
  avgDeathDistance: number | null;
  deathRanges: RangeSplit;
  roundsHeld: number;
  killsHeld: number;
  killsPerRoundHeld: number | null;
  headshots: number;
  bodyshots: number;
  legshots: number;
  hsPct: number | null;
};

export type KillerLine = {
  name: string;
  ability: boolean;
  deaths: number;
  deathShare: number;
  avgDistance: number | null;
  ranges: RangeSplit;
};

export type WeaponReport = {
  matches: number;
  analyzedMatches: number;
  kills: number;
  deaths: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
  hsPct: number;
  bodyPct: number;
  legPct: number;
  weapons: WeaponLine[];
  killers: KillerLine[];
};

export const getWeaponStats = (puuid: string, season: string | null) =>
  invoke<WeaponReport>("get_weapon_stats", { puuid, season });

const CATEGORIES: Record<string, string> = {
  Classic: "Pistolet",
  Shorty: "Pistolet",
  Frenzy: "Pistolet",
  Ghost: "Pistolet",
  Sheriff: "Pistolet",
  Bandit: "Pistolet",
  Stinger: "SMG",
  Spectre: "SMG",
  Bucky: "Fusil à pompe",
  Judge: "Fusil à pompe",
  Bulldog: "Fusil d'assaut",
  Guardian: "Fusil d'assaut",
  Phantom: "Fusil d'assaut",
  Vandal: "Fusil d'assaut",
  Marshal: "Sniper",
  Outlaw: "Sniper",
  Operator: "Sniper",
  Ares: "Mitrailleuse",
  Odin: "Mitrailleuse",
  Couteau: "Corps à corps",
  "Capacités": "Compétences et ultimes",
  Spike: "Explosion",
};

export function weaponCategory(name: string): string {
  return CATEGORIES[name] ?? "Arme";
}

export function rangeTotal(ranges: RangeSplit): number {
  return ranges.short + ranges.medium + ranges.long;
}

export const RANGES: { id: keyof RangeSplit; label: string; detail: string }[] = [
  { id: "short", label: "Courte", detail: "moins de 10 m" },
  { id: "medium", label: "Moyenne", detail: "10 à 25 m" },
  { id: "long", label: "Longue", detail: "plus de 25 m" },
];
