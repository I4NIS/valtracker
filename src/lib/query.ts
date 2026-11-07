import { useEffect, useRef, useSyncExternalStore } from "react";
import { errorMessage } from "./api";

export type Query<T> = { key: string; fetch: () => Promise<T> };

type Entry = {
  data?: unknown;
  error?: string;
  promise?: Promise<void>;
  generation: number;
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let generation = 0;
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(query: Query<unknown>): Promise<void> {
  const current = entries.get(query.key);
  if (current?.promise) return current.promise;
  const started = generation;
  const entry: Entry = { ...current, generation: current?.generation ?? -1 };
  entry.promise = query
    .fetch()
    .then((data) => {
      entries.set(query.key, { data, generation: started });
    })
    .catch((err) => {
      entries.set(query.key, { ...entries.get(query.key), error: errorMessage(err), promise: undefined, generation: started });
    })
    .finally(notify);
  entries.set(query.key, entry);
  return entry.promise;
}

function fresh(key: string) {
  const entry = entries.get(key);
  return entry !== undefined && entry.promise === undefined && entry.generation === generation;
}

export function peek<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined;
}

export function prefetch<T>(query: Query<T>): Promise<void> {
  return fresh(query.key) ? Promise.resolve() : load(query as Query<unknown>);
}

export function invalidate(prefix?: string) {
  if (prefix === undefined) {
    generation += 1;
  } else {
    for (const [key, entry] of entries) if (key.startsWith(prefix)) entries.set(key, { ...entry, generation: -1 });
  }
  notify();
}

export function setQueryData<T>(key: string, data: T) {
  entries.set(key, { data, generation });
  notify();
}

export function useQuery<T>(query: Query<T> | null): { data: T | undefined; error: string | null; pending: boolean } {
  useSyncExternalStore(subscribe, () => version);
  const last = useRef<T | undefined>(undefined);
  const key = query?.key ?? null;
  const entry = key === null ? undefined : entries.get(key);

  useEffect(() => {
    if (query && !fresh(query.key)) load(query as Query<unknown>);
  });

  if (entry && "data" in entry && entry.data !== undefined) last.current = entry.data as T;
  return {
    data: (entry?.data as T | undefined) ?? last.current,
    error: entry?.error ?? null,
    pending: entry?.data === undefined,
  };
}
