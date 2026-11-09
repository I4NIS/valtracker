import { useMemo, useState } from "react";
import { locale } from "./i18n";

export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir };
export type SortValue = number | string | null | undefined;
export type SortColumn<T> = { value: (row: T) => SortValue; first?: SortDir };
export type SortColumns<T> = Record<string, SortColumn<T>>;
export type Sorter = { sort: Sort; toggle: (key: string) => void };

const remembered = new Map<string, Sort>();

const blank = (value: SortValue) => value === null || value === undefined || value === "" || value === "-" || (typeof value === "number" && !Number.isFinite(value));

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), locale(), { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: T[], column: SortColumn<T>, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: column.value(row) }))
    .sort((a, b) => {
      const emptyA = blank(a.value);
      const emptyB = blank(b.value);
      if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
      return compare(a.value, b.value) * sign || a.index - b.index;
    })
    .map((entry) => entry.row);
}

function firstDir<T>(rows: T[], column: SortColumn<T>): SortDir {
  if (column.first) return column.first;
  const sample = rows.map(column.value).find((value) => !blank(value));
  return typeof sample === "string" ? "asc" : "desc";
}

export function useSort<T>(id: string, rows: T[], columns: SortColumns<T>, initial: Sort) {
  const [, refresh] = useState(0);
  const sort = remembered.get(id) ?? initial;
  const column = columns[sort.key];
  const sorted = useMemo(() => (column ? sortRows(rows, column, sort.dir) : rows), [rows, column, sort.dir]);

  const toggle = (key: string) => {
    const target = columns[key];
    if (!target) return;
    const dir = sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : firstDir(rows, target);
    remembered.set(id, { key, dir });
    refresh((count) => count + 1);
  };

  return { rows: sorted, sort, toggle, isDefault: sort.key === initial.key && sort.dir === initial.dir };
}
