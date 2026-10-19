/**
 * Title fitting for generated covers: wrap with CJK-aware breaks, shrink the font between
 * `minSize` and `maxSize` until the text fits `maxLines`, and only then truncate with "…".
 * Measurement is injected so the rules are unit-testable without a canvas.
 */

/** Width of `text` at `fontSize`, in canvas pixels. */
export type Measure = (text: string, fontSize: number) => number;

export interface FitOptions {
  text: string;
  maxWidth: number;
  measure: Measure;
  maxLines?: number;
  minSize?: number;
  maxSize?: number;
  /** Font-size decrement per attempt. */
  step?: number;
}

export interface Fitted {
  size: number;
  lines: string[];
  truncated: boolean;
}

const CJK =
  /[\u2E80-\u2EFF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
/** May not start a line (kinsoku): closing brackets, pause/full stops, middle dots, ellipsis. */
const NO_LINE_START = /^[，。、；：？！）」』】》〉〕］｝…·,.;:?!)\]}'"”’]$/;
/** May not end a line: opening brackets and quotes. */
const NO_LINE_END = /^[（「『【《〈〔［｛([{'"“‘]$/;

/**
 * Split text into atomic units: a CJK character, a run of non-CJK non-space characters
 * (a Latin word, a number), or a single space. Punctuation glues to its neighbour per kinsoku.
 */
export function tokenize(text: string): string[] {
  const raw: string[] = [];
  let latin = '';
  const flush = () => {
    if (latin) raw.push(latin);
    latin = '';
  };
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const isWordChar = (c: string | undefined) =>
    Boolean(c) && c !== ' ' && !CJK.test(c!) && !NO_LINE_START.test(c!) && !NO_LINE_END.test(c!);
  chars.forEach((ch, i) => {
    if (ch === ' ') {
      flush();
      raw.push(' ');
    } else if (CJK.test(ch)) {
      flush();
      raw.push(ch);
    } else if (NO_LINE_START.test(ch) || NO_LINE_END.test(ch)) {
      // "2.0", "v1,5", "a/b": ASCII punctuation inside a Latin run is part of the word.
      if (ch.charCodeAt(0) < 128 && latin && isWordChar(chars[i + 1])) latin += ch;
      else {
        flush();
        raw.push(ch);
      }
    } else {
      latin += ch;
    }
  });
  flush();
  // Glue: closing punctuation onto the previous unit, opening punctuation onto the next.
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (NO_LINE_START.test(t) && out.length) {
      out[out.length - 1] += t;
    } else if (NO_LINE_END.test(t) && i + 1 < raw.length) {
      raw[i + 1] = t + raw[i + 1];
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Greedy wrap of `text` into lines no wider than `maxWidth` at `size`. Over-long single units are split by character. */
export function wrapText(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const units = tokenize(text);
  const lines: string[] = [];
  let line = '';
  const push = () => {
    const t = line.trim();
    if (t) lines.push(t);
    line = '';
  };
  for (const u of units) {
    if (u === ' ') {
      if (line) line += ' ';
      continue;
    }
    const candidate = line + u;
    if (measure(candidate, size) <= maxWidth || !line.trim()) {
      if (measure(candidate, size) > maxWidth && !line.trim()) {
        // One unit wider than the whole line: break it character by character.
        for (const ch of u) {
          if (measure(line + ch, size) > maxWidth && line) push();
          line += ch;
        }
      } else {
        line = candidate;
      }
    } else {
      push();
      line = u;
    }
  }
  push();
  return lines;
}

/** Shorten `line` with a trailing "…" until it fits. */
export function ellipsize(line: string, maxWidth: number, size: number, measure: Measure): string {
  if (measure(line, size) <= maxWidth) return line;
  const chars = Array.from(line.replace(/…$/, ''));
  while (chars.length) {
    chars.pop();
    const t = `${chars.join('').replace(/[\s，。、；：]+$/, '')}…`;
    if (measure(t, size) <= maxWidth) return t;
  }
  return '…';
}

const BREAK_AFTER = /[，、：；。！？,:;!?）」』】》]$/;

/**
 * Re-wraps `text` into the same number of lines as a greedy wrap at `maxWidth`, but balanced: no one- or
 * two-character last line, line lengths as even as possible, and breaks after punctuation (「，」「：」…) preferred.
 */
export function balanceLines(
  text: string,
  maxWidth: number,
  size: number,
  measure: Measure,
): string[] {
  const greedy = wrapText(text, maxWidth, size, measure);
  const n = greedy.length;
  if (n < 2) return greedy;
  const chars = (l: string) => Array.from(l.replace(/\s/g, '')).length;
  const score = (lines: string[]) => {
    const widths = lines.map((l) => measure(l, size));
    const widest = Math.max(...widths);
    let sc = 0;
    lines.forEach((l, i) => {
      if (i < lines.length - 1) {
        sc += ((widest - widths[i]) / size) ** 2;
        if (BREAK_AFTER.test(l)) sc -= 6;
      }
    });
    const last = chars(lines[lines.length - 1]);
    if (last <= 2) sc += 400;
    else if (last <= 3) sc += 20;
    // the last line may be a little shorter, but not much longer than the others
    sc += Math.max(0, (widths[widths.length - 1] - widest) / size) ** 2;
    return sc;
  };
  let best = greedy;
  let bestScore = score(greedy);
  const stepPx = Math.max(4, maxWidth / 48);
  for (let w = maxWidth - stepPx; w > maxWidth * 0.4; w -= stepPx) {
    const lines = wrapText(text, w, size, measure);
    if (lines.length > n) break;
    if (lines.length < n) continue;
    const sc = score(lines);
    if (sc < bestScore) {
      best = lines;
      bestScore = sc;
    }
  }
  return best;
}

/** One line first: the largest size down to 85 % of `maxSize` (never below `minSize`) at which `text` fits unwrapped. */
export function fitOneLine(
  text: string,
  maxWidth: number,
  measure: Measure,
  minSize: number,
  maxSize: number,
  step = 2,
): number | null {
  const floor = Math.max(minSize, Math.round(maxSize * 0.85));
  for (let size = maxSize; size >= floor; size -= step)
    if (measure(text, size) <= maxWidth) return size;
  return null;
}

export function fitTitle({
  text,
  maxWidth,
  measure,
  maxLines = 3,
  minSize = 34,
  maxSize = 72,
  step = 2,
}: FitOptions): Fitted {
  const clean = text.replace(/\s+/g, ' ').trim() || '无标题';
  const one = fitOneLine(clean, maxWidth, measure, minSize, maxSize, step);
  if (one !== null) return { size: one, lines: [clean], truncated: false };
  for (let size = maxSize; size >= minSize; size -= step) {
    const lines = wrapText(clean, maxWidth, size, measure);
    if (lines.length <= maxLines)
      return { size, lines: balanceLines(clean, maxWidth, size, measure), truncated: false };
  }
  const lines = wrapText(clean, maxWidth, minSize, measure).slice(0, maxLines);
  const rest = lines.length === maxLines;
  if (rest) lines[maxLines - 1] = ellipsize(`${lines[maxLines - 1]}…`, maxWidth, minSize, measure);
  return { size: minSize, lines, truncated: true };
}

export interface FitBoxOptions extends FitOptions {
  /** Height available for the block, in px. */
  maxHeight: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
}

/**
 * Like `fitTitle`, but the block must also fit `maxHeight`: the largest size whose wrapped
 * lines fit both `maxLines` and the height wins; otherwise the text is cut with "…" at
 * `minSize`, keeping as many lines as the height allows (never fewer than one).
 */
export function fitTitleBox({
  text,
  maxWidth,
  maxHeight,
  lineHeight,
  measure,
  maxLines = 3,
  minSize = 34,
  maxSize = 72,
  step = 2,
}: FitBoxOptions): Fitted {
  const clean = text.replace(/\s+/g, ' ').trim() || '无标题';
  const linesFor = (size: number) =>
    Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (size * lineHeight) + 1e-6)));
  const one = fitOneLine(clean, maxWidth, measure, minSize, maxSize, step);
  if (one !== null && one * lineHeight <= maxHeight + 1e-6)
    return { size: one, lines: [clean], truncated: false };
  for (let size = maxSize; size >= minSize; size -= step) {
    const lines = wrapText(clean, maxWidth, size, measure);
    if (lines.length <= linesFor(size))
      return { size, lines: balanceLines(clean, maxWidth, size, measure), truncated: false };
  }
  const limit = linesFor(minSize);
  const all = wrapText(clean, maxWidth, minSize, measure);
  const lines = all.slice(0, limit);
  if (all.length > limit)
    lines[limit - 1] = ellipsize(`${lines[limit - 1]}…`, maxWidth, minSize, measure);
  return { size: minSize, lines, truncated: all.length > limit };
}

/** Largest size (≤ maxSize, ≥ minSize) at which `text` fits on one line; below `minSize` the caller ellipsizes. */
export function fitLine(
  text: string,
  maxWidth: number,
  measure: Measure,
  minSize: number,
  maxSize: number,
): number {
  const w = measure(text, maxSize);
  if (w <= maxWidth) return maxSize;
  const size = Math.floor((maxSize * maxWidth) / w);
  // Widths do not scale perfectly linearly (hinting, kerning): step down until it really fits.
  let s = Math.max(minSize, size);
  while (s > minSize && measure(text, s) > maxWidth) s -= 1;
  return s;
}
