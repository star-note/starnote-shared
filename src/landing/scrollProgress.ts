import { clamp01 } from './keyframes';

/** How far the page has been scrolled, 0 at the top and 1 at the bottom; 0 when it cannot scroll. */
export function pageProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const range = scrollHeight - viewportHeight;
  return range > 0 ? clamp01(scrollY / range) : 0;
}

/**
 * The page progress at which a screen snaps into place (`at`, its top at the top of the viewport) and
 * at which a screen taller than the viewport has scrolled through to its bottom (`until`).
 */
export function screenSpan(
  top: number,
  height: number,
  scrollHeight: number,
  viewportHeight: number,
): { at: number; until: number } {
  return {
    at: pageProgress(top, scrollHeight, viewportHeight),
    until: pageProgress(top + Math.max(0, height - viewportHeight), scrollHeight, viewportHeight),
  };
}
