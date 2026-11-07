import { useEffect, useReducer } from "react";
import { makeThumb, thumbKey, type ThumbJob, type ThumbReply } from "./thumbCore";

const LIMIT = 48;
const PARALLEL = 2;

type Waiting = { job: ThumbJob; resolve: (blob: Blob) => void; reject: (error: unknown) => void };

const ready = new Map<string, string>();
const failed = new Set<string>();
const users = new Map<string, number>();
const pending = new Map<string, Promise<void>>();
const waiting = new Map<number, Waiting>();
const queue: (() => void)[] = [];
let active = 0;
let nextId = 0;
let worker: Worker | null | undefined;

function fallback(entry: Waiting) {
  makeThumb(entry.job.url, entry.job.width, entry.job.height).then(entry.resolve, entry.reject);
}

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const created = new Worker(new URL("./thumbs.worker.ts", import.meta.url), { type: "module" });
    created.addEventListener("message", (event: MessageEvent<ThumbReply>) => {
      const reply = event.data;
      const entry = waiting.get(reply.id);
      if (!entry) return;
      waiting.delete(reply.id);
      if ("blob" in reply) entry.resolve(reply.blob);
      else entry.reject(new Error(reply.error));
    });
    created.addEventListener("error", () => {
      worker = null;
      created.terminate();
      const stranded = [...waiting.values()];
      waiting.clear();
      stranded.forEach(fallback);
    });
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

function render(url: string, width: number, height: number): Promise<Blob> {
  const target = startWorker();
  if (!target) return makeThumb(url, width, height);
  return new Promise((resolve, reject) => {
    nextId += 1;
    const job = { id: nextId, url, width, height };
    waiting.set(job.id, { job, resolve, reject });
    target.postMessage(job);
  });
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          queue.shift()?.();
        });
    };
    if (active < PARALLEL) start();
    else queue.push(start);
  });
}

function trim() {
  for (const [key, objectUrl] of ready) {
    if (ready.size <= LIMIT) return;
    if (users.has(key)) continue;
    ready.delete(key);
    URL.revokeObjectURL(objectUrl);
  }
}

function load(key: string, url: string, width: number, height: number): Promise<void> {
  const running = pending.get(key);
  if (running) return running;
  const promise = schedule(() => render(url, width, height))
    .then((blob) => {
      ready.set(key, URL.createObjectURL(blob));
      trim();
    })
    .catch(() => {
      failed.add(key);
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

function lookup(key: string | null, url: string | undefined): string | undefined {
  if (key === null) return undefined;
  if (failed.has(key)) return url;
  const objectUrl = ready.get(key);
  if (objectUrl !== undefined) {
    ready.delete(key);
    ready.set(key, objectUrl);
  }
  return objectUrl;
}

export function useThumb(url: string | undefined, width: number, height: number): string | undefined {
  const key = url ? thumbKey(url, width, height) : null;
  const [, refresh] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (key === null || url === undefined) return;
    users.set(key, (users.get(key) ?? 0) + 1);
    let alive = true;
    if (!ready.has(key) && !failed.has(key)) {
      load(key, url, width, height).then(() => {
        if (alive) refresh();
      });
    }
    return () => {
      alive = false;
      const count = (users.get(key) ?? 1) - 1;
      if (count > 0) users.set(key, count);
      else users.delete(key);
      trim();
    };
  }, [key]);

  return lookup(key, url);
}
