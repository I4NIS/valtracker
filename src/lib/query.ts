import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { errorMessage } from "./api";

export type Query<T> = { key: string; fetch: () => Promise<T> };

type Entry = {
  data?: unknown;
  error?: string;
  promise?: Promise<void>;
  generation: number;
};

const KEEP = 40;

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const sources = new Map<string, Query<unknown>>();
let generation = 0;

function watched(key: string) {
  return listeners.has(key);
}

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function trim() {
  let idle = 0;
  for (const [key, entry] of entries) if (!entry.promise && !watched(key)) idle += 1;
  for (const [key, entry] of entries) {
    if (idle <= KEEP) return;
    if (entry.promise || watched(key)) continue;
    entries.delete(key);
    idle -= 1;
  }
}

function put(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  trim();
}

function touch(key: string) {
  const entry = entries.get(key);
  if (entry === undefined) return;
  entries.delete(key);
  entries.set(key, entry);
}

function watch(key: string, listener: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  touch(key);
  return () => {
    set.delete(listener);
    if (set.size > 0 || listeners.get(key) !== set) return;
    listeners.delete(key);
    sources.delete(key);
    trim();
  };
}

function fresh(key: string) {
  const entry = entries.get(key);
  return entry !== undefined && entry.promise === undefined && entry.generation === generation;
}

function load(query: Query<unknown>): Promise<void> {
  const key = query.key;
  const current = entries.get(key);
  if (current?.promise) return current.promise;
  const started = generation;
  const promise = query
    .fetch()
    .then(
      (data) => {
        put(key, { data, generation: started });
      },
      (err) => {
        put(key, { data: entries.get(key)?.data, error: errorMessage(err), generation: started });
      },
    )
    .finally(() => {
      notify(key);
      const source = sources.get(key);
      if (source && !fresh(key)) load(source);
    });
  put(key, { ...current, generation: current?.generation ?? -1, promise });
  return promise;
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
  for (const [key, source] of sources) {
    if ((prefix === undefined || key.startsWith(prefix)) && !fresh(key)) load(source);
  }
}

export function setQueryData<T>(key: string, data: T) {
  put(key, { data, generation });
  notify(key);
}

const idle = () => () => undefined;

export function useQuery<T>(query: Query<T> | null): { data: T | undefined; error: string | null; pending: boolean } {
  const key = query?.key ?? null;
  const latest = useRef(query);
  latest.current = query;
  const subscribe = useCallback((listener: () => void) => (key === null ? idle() : watch(key, listener)), [key]);
  const entry = useSyncExternalStore(subscribe, () => (key === null ? undefined : entries.get(key)));
  const last = useRef<T | undefined>(undefined);

  useEffect(() => {
    const source = latest.current as Query<unknown> | null;
    if (key === null || source === null) return;
    sources.set(key, source);
    if (!fresh(key)) load(source);
  }, [key]);

  if (entry && entry.data !== undefined) last.current = entry.data as T;
  return {
    data: (entry?.data as T | undefined) ?? last.current,
    error: entry?.error ?? null,
    pending: entry?.data === undefined,
  };
}
