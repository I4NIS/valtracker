import { invoke } from "@tauri-apps/api/core";

export type Crosshair = {
  id: number;
  code: string;
  label: string;
  sinceDate: string;
  sinceAt: string;
  image: string | null;
};

export type CrosshairPeriod = {
  crosshairId: number | null;
  matches: number;
  hsPct: number | null;
  kd: number | null;
  acs: number | null;
  firstDuels: number;
  firstDuelsWonPct: number | null;
};

export type CrosshairReport = {
  crosshairs: Crosshair[];
  periods: CrosshairPeriod[];
};

const MAX_CODE = 400;
const CODE_PATTERN = /^0(;[A-Za-z0-9.]+)+$/;

export function cleanCode(raw: string): string | null {
  const code = raw.trim().replace(/;+$/, "");
  return code.length <= MAX_CODE && CODE_PATTERN.test(code) ? code : null;
}

export function localDay(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

export const crosshairs = {
  list: (puuid: string) => invoke<CrosshairReport>("list_crosshairs", { puuid }),
  add: (puuid: string, code: string, label: string, sinceDate: string) =>
    invoke<void>("add_crosshair", { puuid, code, label, sinceDate, sinceAt: dayStart(sinceDate) }),
  remove: (puuid: string, id: number) => invoke<void>("delete_crosshair", { puuid, id }),
};
