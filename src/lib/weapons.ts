import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

export type RangeSplit = {
  short: number;
  medium: number;
  long: number;
};

export type AbilityPart = {
  name: string | null;
  agentId: string | null;
  count: number;
};

export type WeaponLine = {
  id: string | null;
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
  parts: AbilityPart[];
};

export type KillerLine = {
  id: string | null;
  name: string;
  ability: boolean;
  deaths: number;
  deathShare: number;
  avgDistance: number | null;
  ranges: RangeSplit;
  parts: AbilityPart[];
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
  Warden: "Fusil d'assaut",
  Marshal: "Sniper",
  Outlaw: "Sniper",
  Operator: "Sniper",
  Ares: "Mitrailleuse",
  Odin: "Mitrailleuse",
  Couteau: "Corps à corps",
  Knife: "Corps à corps",
  Melee: "Corps à corps",
  "Capacités": "Compétences et ultimes",
  Abilities: "Compétences et ultimes",
  Spike: "Explosion",
  Chute: "Environnement",
};

const CATEGORIES_EN: Record<string, string> = {
  Pistolet: "Sidearm",
  SMG: "SMG",
  "Fusil à pompe": "Shotgun",
  "Fusil d'assaut": "Rifle",
  Sniper: "Sniper",
  Mitrailleuse: "Machine Gun",
  "Corps à corps": "Melee",
  "Compétences et ultimes": "Abilities and ultimates",
  Explosion: "Explosion",
  Environnement: "Environment",
};

export function weaponCategory(name: string): string {
  const category = CATEGORIES[name];
  return category ? t(category, CATEGORIES_EN[category] ?? category) : t("Arme", "Weapon");
}

export function rangeTotal(ranges: RangeSplit): number {
  return ranges.short + ranges.medium + ranges.long;
}

function range(id: keyof RangeSplit, label: [string, string], detail: [string, string]) {
  return {
    id,
    get label() {
      return t(label[0], label[1]);
    },
    get detail() {
      return t(detail[0], detail[1]);
    },
  };
}

export const RANGES: { id: keyof RangeSplit; label: string; detail: string }[] = [
  range("short", ["Courte", "Short"], ["moins de 10 m", "under 10 m"]),
  range("medium", ["Moyenne", "Medium"], ["10 à 25 m", "10 to 25 m"]),
  range("long", ["Longue", "Long"], ["plus de 25 m", "over 25 m"]),
];

export type WeaponDuel = {
  matchId: string;
  mapId: string | null;
  mapName: string | null;
  startedAt: string;
  roundIndex: number;
  timeMs: number;
  opponent: string;
  opponentAgentId: string | null;
  agentId: string | null;
  ability: string | null;
  distance: number | null;
  roundWon: boolean | null;
};

export const getWeaponHistory = (puuid: string, season: string | null, weapon: string, deaths: boolean) =>
  invoke<WeaponDuel[]>("get_weapon_history", { puuid, season, weapon, deaths });
