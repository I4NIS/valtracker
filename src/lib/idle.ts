export function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout });
    else window.setTimeout(resolve, 1);
  });
}
