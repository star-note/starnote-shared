const CJK = '　-〿㐀-鿿＀-￯';
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'g');

/**
 * Split copy into the units that arrive one by one: every CJK character (and CJK punctuation) on
 * its own, Latin words with their trailing space, so English still wraps at word boundaries.
 */
export function splitTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Tokens, then characters inside each token, for the headline whose characters rise one at a time. */
export function splitChars(text: string): string[][] {
  return splitTokens(text).map((w) => Array.from(w));
}

/** How many characters `Rise` will stagger for `text`, so what follows can wait for the last one. */
export function riseCount(text: string): number {
  return splitChars(text).reduce((n, w) => n + w.length, 0);
}

/** Milliseconds per typed token: a little slower than reading, fast enough not to wait on. */
export const TYPE_MS = 22;
