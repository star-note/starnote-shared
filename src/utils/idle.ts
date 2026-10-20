/** Runs `fn` when the browser is idle (or after a short delay where `requestIdleCallback` is missing). Returns a cancel. */
export function whenIdle(fn: () => void, timeout = 4000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(fn, 1500);
  return () => window.clearTimeout(t);
}
