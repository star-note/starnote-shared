/**
 * Fallback avatar helpers for groups without an image (contract r3 §H): the first visible
 * character of the name on a tint derived from the name, so one group keeps one colour everywhere.
 */

/** The first grapheme of a trimmed name (so a flag or emoji is not cut in half); `群` when empty. */
export function groupInitial(name?: string | null): string {
  const s = (name ?? '').trim();
  if (!s) return '群';
  const seg =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)][0]?.segment
      : undefined;
  return (seg ?? Array.from(s)[0]).toUpperCase();
}

/** Stable hue 0–359 from a string (same recipe as the blog category tints). */
export function groupHue(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n % 360;
}

/** Inline CSS variables for the fallback block: `--gh` is the hue. */
export function hueVars(name: string): Record<string, string> {
  return { '--gh': String(groupHue(name)) };
}
