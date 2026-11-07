import { useSyncExternalStore } from "react";

type Size = { width: number; height: number };

let size: Size = { width: window.innerWidth, height: window.innerHeight };
const listeners = new Set<() => void>();

window.addEventListener("resize", () => {
  if (size.width === window.innerWidth && size.height === window.innerHeight) return;
  size = { width: window.innerWidth, height: window.innerHeight };
  listeners.forEach((listener) => listener());
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useViewport(): Size {
  return useSyncExternalStore(subscribe, () => size);
}
