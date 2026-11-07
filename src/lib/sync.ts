import { useSyncExternalStore } from "react";

export type SyncView = {
  running: boolean;
  stage: string;
  newMatches: number;
  error: string | null;
  lastSyncAt: string | null;
};

let state: SyncView = { running: false, stage: "", newMatches: 0, error: null, lastSyncAt: null };
const listeners = new Set<() => void>();

export function updateSync(patch: Partial<SyncView>) {
  const next = { ...state, ...patch };
  if ((Object.keys(next) as (keyof SyncView)[]).every((key) => next[key] === state[key])) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

export function useSync(): SyncView {
  return useSyncExternalStore(subscribe, snapshot);
}

export function useSyncRunning(): boolean {
  return useSyncExternalStore(subscribe, () => state.running);
}
