/**
 * Magazine cover layouts as plain data: every element is an absolutely positioned item in a w×h
 * frame, computed here (pure, testable with a fake `measure`) and painted by `MagazineCover.tsx`.
 *
 * Every cover is one continuous picture. A photo is scaled so its subject sits under the masthead;
 * wherever the sharp photo does not reach the frame edge, the renderer fills in a blurred copy of
 * the same photo and feathers the seam. The masthead is always English and sits between the photo
 * and its foreground cutout, so a head, a peak or a tree rises in front of the letters. Text never
 * sits on an opaque block: legibility comes from soft scrims in the photo's own tone. Text is
 * fitted line by line in advance (≤3 lines, shrink, then "…"), no two text blocks touch, and no
 * text crosses a face (or a landscape's subject).
 */
import { ellipsize, fitLine, fitTitleBox, type Measure, wrapText } from '../fitText';
import { CAP_RATIO, type FontKey, MASTHEAD_FONTS } from './fonts';
import { pickMaterial, pickVariant, type Variant } from './pick';
import { placeFrom, placeLabel } from './place';
import {
  isTall,
  MAG_DIMENSIONS,
  type MagazineInput,
  type MagSize,
  type Material,
  type Rect,
  type TemplateKey,
} from './types';
import type { ArtMaterial } from '../materials/art';
import type { PhotoMaterial } from '../materials/photos';

export type MeasureFor = (font: FontKey) => Measure;

export interface TextDeco {
  /** `marker`: highlighter under the lower half of each line; `box`: a slab behind each line. */
  type: 'marker' | 'box';
  color: string;
}

/** Feather widths (px) of the sharp photo's edges; 0 where it meets the frame edge. */
export interface Feather {
  l: number;
  r: number;
  t: number;
  b: number;
}

export type Item =
  | {
      kind: 'photo';
      key: string;
      layer: 'base' | 'cut';
      clip: Rect;
      img: Rect;
      src: string;
      feather: Feather;
      backdrop: boolean;
    }
  | { kind: 'artBg'; key: string; clip: Rect; id: string }
  | { kind: 'artFg'; key: string; clip: Rect; box: Rect; id: string }
  | { kind: 'fill'; key: string; rect: Rect; background: string; radius?: number }
  | {
      kind: 'masthead';
      key: string;
      /** Visual box of the capitals. */
      rect: Rect;
      text: string;
      font: FontKey;
      size: number;
      baseline: number;
      color: string;
      /** Letter spacing in em. */
      tracking: number;
      shadow?: 'dark' | 'light';
    }
  | {
      kind: 'text';
      key: string;
      rect: Rect;
      lines: string[];
      size: number;
      /** Line height as a multiple of size. */
      lh: number;
      font: FontKey;
      color: string;
      align: 'left' | 'right' | 'center';
      /** Letter spacing in em. */
      tracking?: number;
      shadow?: 'dark' | 'light';
      deco?: TextDeco;
      /** Colour for numbers inside the text (the cover's accent). */
      accent?: string;
    }
  | { kind: 'barcode'; key: string; rect: Rect; code: string }
  /** 地理志: a thin map scale bar (hairline, end ticks, a distance label) — purely decorative. */
  | { kind: 'scalebar'; key: string; rect: Rect; color: string; label: string }
  | {
      kind: 'sticker';
      key: string;
      rect: Rect;
      text: string;
      size: number;
      background: string;
      color: string;
      rotate: number;
    }
  | {
      kind: 'byline';
      key: string;
      rect: Rect;
      text: string;
      initial: string;
      size: number;
      background: string;
      color: string;
      dot: string;
      dotInk: string;
    };

export type TextItem = Extract<Item, { kind: 'text' }>;
export type MastItem = Extract<Item, { kind: 'masthead' }>;

export interface MagazineLayout {
  template: TemplateKey;
  size: MagSize;
  w: number;
  h: number;
  material: Material;
  variant: Variant;
  items: Item[];
  /** Faces in frame coordinates; no text may cross them (the masthead included). */
  faces: Rect[];
  /** Landscape subjects in frame coordinates; cover lines keep clear (the masthead may overlap). */
  keep: Rect[];
}

const DARK = '#16121c';
const LIGHT = '#ffffff';
const BRAND = '#6918b4';
const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];
const SEASONS = [
  'Winter',
  'Winter',
  'Spring',
  'Spring',
  'Spring',
  'Summer',
  'Summer',
  'Summer',
  'Autumn',
  'Autumn',
  'Autumn',
  'Winter',
];

/* ------------------------------------------------------------------ content */

/** The masthead is always the platform's English name; the author's handle goes small in the dateline. */
export const MASTHEAD = 'STARNOTE';

export function mastheadText(): string {
  return MASTHEAD;
}

/** `@handle` for the dateline when the handle is a plain Latin id, else nothing. */
function handleTag(handle?: string): string {
  const h = (handle ?? '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_.-]{2,24}$/.test(h) ? `@${h.toLowerCase()}` : '';
}

/** First sentence of the summary, unless it merely repeats the title. */
export function deckFrom(summary: string | undefined, title: string): string {
  const s = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const first = s
    .split(/(?<=[。！？!?；;])|\n/)[0]
    .trim()
    .replace(/[。；;]$/, '');
  if (!first || first === title.trim()) return '';
  return first;
}

/** Secondary cover lines: the article's own headings first, then the summary, then the category. */
export function coverLinesFrom(input: MagazineInput, max = 5): string[] {
  const seen = new Set([input.title.trim()]);
  const out: string[] = [];
  const add = (s?: string) => {
    const t = (s ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^[\d一二三四五六七八九十]+[、.．)]\s*/, '')
      .trim();
    if (t && !seen.has(t) && out.length < max) {
      seen.add(t);
      out.push(t);
    }
  };
  (input.headings ?? []).forEach(add);
  if (out.length < 2) add(deckFrom(input.summary, input.title));
  if (out.length < 2) add(input.category);
  // Extra headings beyond `max` stay available as spares for lines that do not fit.
  return out;
}

export function dateline(date: Date, issue?: number, handle?: string): string {
  const parts = [`${MONTHS[date.getMonth()]} ${date.getFullYear()}`];
  if (issue && issue > 0) parts.push(`NO. ${issue}`);
  const tag = handleTag(handle);
  if (tag) parts.push(tag.toUpperCase());
  return parts.join('  ·  ');
}

function journalDateline(date: Date, issue?: number, handle?: string): string {
  const base = `${SEASONS[date.getMonth()]} ${date.getFullYear()}`;
  const withIssue = issue && issue > 0 ? `${base} — Issue ${issue}` : base;
  const tag = handleTag(handle);
  return tag ? `${withIssue} · ${tag}` : withIssue;
}

function barcodeDigits(date: Date, issue?: number): string {
  const n = String(issue ?? date.getDate()).padStart(3, '0');
  return `977 ${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')} ${n}`;
}

/* ----------------------------------------------------------------- geometry */

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function intersects(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
  );
}

const boxOf = ([x0, y0, x1, y1]: [number, number, number, number], img: Rect): Rect => ({
  x: img.x + x0 * img.w,
  y: img.y + y0 * img.h,
  w: (x1 - x0) * img.w,
  h: (y1 - y0) * img.h,
});

function inFrame(r: Rect, w: number, h: number): Rect | null {
  const x = Math.max(r.x, 0);
  const y = Math.max(r.y, 0);
  const x1 = Math.min(r.x + r.w, w);
  const y1 = Math.min(r.y + r.h, h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

export interface Composition {
  img: Rect;
  feather: Feather;
  backdrop: boolean;
  faces: Rect[];
  keep: Rect[];
  /** Full-figure bodies (soft obstacles). */
  body: Rect[];
  ok: boolean;
}

export interface ComposeOptions {
  /** Frame y where the foreground's top (`cutTop`) should land — the head-over-masthead line. */
  top?: number;
  /** Frame x for the subject's focus. */
  cx: number;
  /** Faces must start below this y. */
  faceTopMin?: number;
  /** …and end above this y. */
  faceBottomMax?: number;
  /** Largest face height, as a fraction of the frame height. */
  maxFace?: number;
  /** Margin faces keep from the frame's sides. */
  sideMargin?: number;
  /** Without `top`: where the focus sits vertically (fraction of the frame). */
  focusY?: number;
}

/** Most a photo is upscaled (frame px per source px) before it would look soft. */
const MAX_UPSCALE = 1.3;

/**
 * Place a photo in the frame. With `top`, the photo is anchored so its foreground starts at that
 * line, scaled as large as the face limits allow (running off the bottom edge when it can); otherwise it covers
 * the frame around its focus. Any edge that falls short of the frame is feathered over a blurred
 * copy of the photo (`backdrop`).
 */
export function composePhoto(
  w: number,
  h: number,
  p: PhotoMaterial,
  o: ComposeOptions,
): Composition {
  const iw = p.width;
  const ih = p.height;
  const margin = o.sideMargin ?? 24;
  const build = (s: number, y: number): Composition => {
    const W = iw * s;
    const H = ih * s;
    const want = o.cx - p.focus.x * W;
    const x = W >= w ? clamp(want, w - W, 0) : clamp(want, 0, w - W);
    const img = { x, y, w: W, h: H };
    const faces = p.faces.map((f) => boxOf(f, img));
    const keep = p.keep.map((f) => boxOf(f, img)).flatMap((r) => inFrame(r, w, h) ?? []);
    const gapL = x > 0.5;
    const gapR = x + W < w - 0.5;
    const gapT = y > 0.5;
    const gapB = y + H < h - 0.5;
    const feather = {
      l: gapL ? Math.min(W * 0.22, 200) : 0,
      r: gapR ? Math.min(W * 0.22, 200) : 0,
      t: gapT ? Math.min(H * 0.16, 160) : 0,
      b: gapB ? Math.min(H * 0.22, 220) : 0,
    };
    const f = faces[0];
    const ok =
      !f ||
      ((o.faceTopMin === undefined || f.y >= o.faceTopMin - 0.5) &&
        (o.faceBottomMax === undefined || f.y + f.h <= o.faceBottomMax + 0.5) &&
        f.h <= (o.maxFace ?? 0.6) * h + 0.5 &&
        f.x >= margin - 0.5 &&
        f.x + f.w <= w - margin + 0.5);
    const body = (p.body ?? []).map((f) => boxOf(f, img)).flatMap((r) => inFrame(r, w, h) ?? []);
    return {
      img,
      feather,
      backdrop: gapL || gapR || gapT || gapB,
      faces: faces.flatMap((r) => inFrame(r, w, h) ?? []),
      keep,
      body,
      ok,
    };
  };

  if (o.top !== undefined) {
    const t = p.cutTop ?? Math.max(0, (p.faces[0]?.[1] ?? 0.05) - 0.06);
    const sMin = (h - o.top) / ((1 - t) * ih);
    const sMax = Math.max(sMin, MAX_UPSCALE);
    let last: Composition | null = null;
    // k < 1 lifts the photo off the bottom edge; the blurred backdrop carries on below it.
    for (const k of [2.4, 2.1, 1.85, 1.65, 1.5, 1.35, 1.2, 1.1, 1, 0.9, 0.8, 0.72, 0.64]) {
      const s = Math.min(sMin * k, sMax);
      const c = build(s, o.top - t * ih * s);
      last = c;
      if (c.ok) return c;
    }
    return { ...last!, ok: false };
  }
  // Cover the frame around the focus.
  const s = Math.max(w / iw, h / ih);
  const H = ih * s;
  const y = clamp(h * (o.focusY ?? 0.45) - p.focus.y * H, h - H, 0);
  return build(s, y);
}

/** Minimum clear rows (source px) above the cutout's silhouette before it may overlap a masthead. */
export const CUT_HEADROOM_PX = 4;

/** True when the foreground mask starts below the photo's top edge (a real silhouette, not a crop line). */
export function hasCutoutHeadroom(p: PhotoMaterial): boolean {
  return Boolean(p.cutout) && (p.cutTop ?? 0) * p.height >= CUT_HEADROOM_PX;
}

/** Mean luminance (0–100) of the photo under `rect`, from the material's 8×8 grid. */
export function areaLum(rect: Rect, img: Rect, p: PhotoMaterial): number {
  const N = 8;
  const u0 = clamp((rect.x - img.x) / img.w, 0, 0.999);
  const u1 = clamp((rect.x + rect.w - img.x) / img.w, 0.001, 1);
  const v0 = clamp((rect.y - img.y) / img.h, 0, 0.999);
  const v1 = clamp((rect.y + rect.h - img.y) / img.h, 0.001, 1);
  let sum = 0;
  let n = 0;
  for (let r = Math.floor(v0 * N); r <= Math.min(N - 1, Math.floor(v1 * N - 1e-9)); r++) {
    for (let c = Math.floor(u0 * N); c <= Math.min(N - 1, Math.floor(u1 * N - 1e-9)); c++) {
      sum += p.lum[r * N + c];
      n++;
    }
  }
  return n ? sum / n : 50;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexLum(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55;
}

const inkFor = (lum: number) => (lum > 60 ? DARK : LIGHT);

/** The photo's accent when it stands out against the text's background; else plain ink. */
function accentOn(accent: string, ink: string): string {
  const l = hexLum(accent);
  const [r, g, b] = hexRgb(accent);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat < 60) return ink;
  return ink === LIGHT ? (l >= 48 ? accent : ink) : l <= 45 ? accent : ink;
}
const shadowFor = (ink: string): 'dark' | 'light' => (ink === LIGHT ? 'dark' : 'light');

/** Scrim tint from the photo's own colour: deep for light ink, pale for dark ink. */
function tint(avg: string, ink: string): string {
  const [r, g, b] = hexRgb(avg);
  const mix = (v: number) => Math.round(ink === LIGHT ? v * 0.22 : 255 - (255 - v) * 0.2);
  return `${mix(r)},${mix(g)},${mix(b)}`;
}

/** A soft gradient toward an edge (never an opaque block). */
function scrim(key: string, rect: Rect, direction: string, rgb: string, strength: number): Item {
  return {
    kind: 'fill',
    key,
    rect,
    background: `linear-gradient(${direction}, rgba(${rgb},${strength}) 0%, rgba(${rgb},${(strength * 0.55).toFixed(2)}) 45%, rgba(${rgb},0) 100%)`,
  };
}

/** A soft radial pool of shade behind a block of text. */
function pool(key: string, rect: Rect, rgb: string, strength: number): Item {
  const pad = 120;
  return {
    kind: 'fill',
    key,
    rect: { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad },
    background: `radial-gradient(closest-side, rgba(${rgb},${strength}), rgba(${rgb},${(strength * 0.5).toFixed(2)}) 55%, rgba(${rgb},0))`,
  };
}

/* --------------------------------------------------------------- text flow */

interface Ctx {
  input: MagazineInput;
  w: number;
  h: number;
  size: MagSize;
  measure: MeasureFor;
  date: Date;
}

function widthWith(m: Measure, tracking: number): Measure {
  return (t, s) => m(t, s) + Math.max(0, Array.from(t).length - 1) * tracking * s;
}

function line(
  ctx: Ctx,
  key: string,
  text: string,
  font: FontKey,
  size: number,
  rect: Omit<Rect, 'h'>,
  color: string,
  align: TextItem['align'],
  extra: Partial<TextItem> = {},
): TextItem {
  const tracking = extra.tracking ?? 0;
  const widthOf = widthWith(ctx.measure(font), tracking);
  const fitted = widthOf(text, size) <= rect.w ? text : ellipsize(text, rect.w, size, widthOf);
  const lh = extra.lh ?? 1.3;
  return {
    kind: 'text',
    key,
    rect: { ...rect, h: Math.ceil(size * lh) },
    lines: [fitted],
    size,
    lh,
    font,
    color,
    align,
    ...extra,
  };
}

function block(
  ctx: Ctx,
  key: string,
  text: string,
  font: FontKey,
  rect: Rect,
  sizes: { min: number; max: number },
  lh: number,
  color: string,
  align: TextItem['align'],
  maxLines: number,
  extra: Partial<TextItem> = {},
): TextItem {
  const fit = fitTitleBox({
    text,
    maxWidth: rect.w,
    maxHeight: rect.h,
    lineHeight: lh,
    measure: ctx.measure(font),
    maxLines,
    minSize: sizes.min,
    maxSize: sizes.max,
  });
  return {
    kind: 'text',
    key,
    rect: { ...rect, h: Math.ceil(fit.lines.length * fit.size * lh) },
    lines: fit.lines,
    size: fit.size,
    lh,
    font,
    color,
    align,
    ...extra,
  };
}

/** Moves a stack of text items so the stack ends at `bottom` (they were laid out from y = 0). */
function shiftItems(items: Item[], dy: number) {
  for (const it of items) if ('rect' in it) it.rect = { ...it.rect, y: it.rect.y + dy };
}

function stackHeight(items: Item[]): number {
  let max = 0;
  for (const it of items) if ('rect' in it) max = Math.max(max, it.rect.y + it.rect.h);
  return max;
}

/** Where a one-line title may run: frame bounds, things it must keep clear of, and soft areas (bodies, landscape
 * subjects) it may cross only while its scrim keeps the text at WCAG contrast. */
interface LineExt {
  limit: [number, number];
  hard: Rect[];
  soft?: Rect[];
  softOk?: (r: Rect) => boolean;
  gap: number;
}

/** WCAG contrast of the ink over a photo area (0–100 brightness) darkened / lightened by a scrim of `alpha`. */
export function contrastOk(lum: number, ink: string, alpha: number): boolean {
  const v = Math.min(1, Math.max(0, lum / 100));
  if (ink === LIGHT) {
    const L = Math.pow(v * (1 - alpha), 2.2);
    return 1.05 / (L + 0.05) >= 4.5;
  }
  const L = Math.pow(v + (1 - v) * alpha, 2.2);
  return (L + 0.05) / (0.0065 + 0.05) >= 4.5;
}

function lineBlocked(r: Rect, ext: LineExt): boolean {
  if (r.x < ext.limit[0] - 0.5 || r.x + r.w > ext.limit[1] + 0.5) return true;
  if (ext.hard.some((o) => intersects(o, r, ext.gap))) return true;
  const soft = (ext.soft ?? []).filter((o) => intersects(o, r, 0));
  return soft.length > 0 && !(ext.softOk?.(r) ?? false);
}

/**
 * One line before wrapping: the title at its target size (down to 85 %) on a single line, measured with the real
 * font, and allowed to run past the column as far as the free space on its own rows goes (`ext`). `stack` places
 * the title together with its kicker / byline etc. and returns them; the first size whose line is clear wins.
 */
function tryOneLine(
  ctx: Ctx,
  font: FontKey,
  sizes: { min: number; max: number },
  lh: number,
  align: TextItem['align'],
  col: Rect,
  ext: LineExt,
  stack: (title: TextItem) => Item[],
  base: Partial<TextItem> & { color: string },
  pad = 0,
  /** Left-aligned text in a column against the right margin: slide the whole block left to make room. */
  slide = false,
): { items: Item[]; title: TextItem } | null {
  const text = ctx.input.title.replace(/\s+/g, ' ').trim() || '无标题';
  const m = ctx.measure(font);
  const floor = Math.max(sizes.min, Math.round(sizes.max * 0.85));
  for (let size = sizes.max; size >= floor; size -= 2) {
    const tw = Math.ceil(m(text, size) + pad * size) + 2;
    const th = Math.ceil(size * lh);
    let x =
      align === 'right'
        ? col.x + col.w - tw
        : align === 'center'
          ? col.x + (col.w - tw) / 2
          : col.x;
    if (slide && align === 'left' && x + tw > ext.limit[1])
      x = Math.max(ext.limit[0], ext.limit[1] - tw);
    const title = {
      kind: 'text',
      key: 'title',
      rect: { x, y: 0, w: tw, h: th },
      lines: [text],
      size,
      lh,
      font,
      align,
      ...base,
    } as TextItem;
    const items = stack(title);
    const top = Math.min(...items.map((i) => ('rect' in i ? i.rect.y : Infinity)));
    const bottom = Math.max(...items.map((i) => ('rect' in i ? i.rect.y + i.rect.h : -Infinity)));
    if (top < col.y - 0.5 || bottom > col.y + col.h + 0.5) continue;
    if (lineBlocked(title.rect, ext)) continue;
    return { items, title };
  }
  return null;
}

/** Bottom-right corner kept clear (barcode offset / breathing room). */
const AI_CLEAR: Record<MagSize, number> = { card: 46, og: 44, wide: 38, square: 60, portrait: 62 };

function barcode(ctx: Ctx, rect: Rect): Item {
  return { kind: 'barcode', key: 'barcode', rect, code: barcodeDigits(ctx.date, ctx.input.issue) };
}

/** The issue line under the masthead, as tight as its text, on whichever side is clear of faces. */
function datelineItem(
  ctx: Ctx,
  y: number,
  size: number,
  color: string,
  shadow: 'dark' | 'light' | undefined,
  prefer: 'left' | 'right',
  faces: Rect[],
  m: number,
): Item[] {
  const text = dateline(ctx.date, ctx.input.issue, ctx.input.handle);
  const tracking = 0.22;
  const tw = Math.ceil(widthWith(ctx.measure('cond'), tracking)(text, size)) + 4;
  for (const side of prefer === 'left'
    ? (['left', 'right'] as const)
    : (['right', 'left'] as const)) {
    const it = line(
      ctx,
      'dateline',
      text,
      'cond',
      size,
      { x: side === 'left' ? m : ctx.w - m - tw, y, w: tw },
      color,
      side,
      { tracking, shadow },
    );
    if (!faces.some((f) => intersects(f, it.rect, 6))) return [it];
  }
  return [];
}

/* ----------------------------------------------------------------- masthead */

/** The English masthead fitted to `width` (cap height ≤ maxCap), its caps' top at `capTop`. */
function masthead(
  ctx: Ctx,
  font: FontKey,
  x: number,
  capTop: number,
  width: number,
  maxCap: number,
  color: string,
  tracking: number,
  align: 'left' | 'center' = 'center',
): MastItem {
  const text = mastheadText();
  const cap = CAP_RATIO[font] ?? 0.7;
  const widthOf = widthWith(ctx.measure(font), tracking);
  const size = fitLine(text, width, widthOf, 24, Math.floor(maxCap / cap));
  const tw = widthOf(text, size);
  const capH = Math.round(size * cap);
  const left = align === 'center' ? x + (width - tw) / 2 : x;
  return {
    kind: 'masthead',
    key: 'masthead',
    rect: { x: left, y: capTop, w: tw, h: capH },
    text,
    font,
    size,
    baseline: capTop + capH,
    color,
    tracking,
  };
}

/* ------------------------------------------------------------------ fashion */

const FASHION = {
  card: {
    m: 40,
    capTop: 26,
    maxCap: 120,
    main: { min: 38, max: 78 },
    small: 22,
    kicker: 17,
    by: 15,
    date: 14,
    bar: { w: 96, h: 52 },
    mainW: 0.42,
    smallW: 0.25,
    minMain: 300,
  },
  og: {
    m: 36,
    capTop: 22,
    maxCap: 96,
    main: { min: 34, max: 64 },
    small: 19,
    kicker: 15,
    by: 14,
    date: 13,
    bar: { w: 88, h: 46 },
    mainW: 0.42,
    smallW: 0.25,
    minMain: 280,
  },
  wide: {
    m: 30,
    capTop: 16,
    maxCap: 78,
    main: { min: 26, max: 48 },
    small: 16,
    kicker: 13,
    by: 12,
    date: 11,
    bar: { w: 74, h: 40 },
    mainW: 0.4,
    smallW: 0.24,
    minMain: 250,
  },
  square: {
    m: 52,
    capTop: 38,
    maxCap: 168,
    main: { min: 48, max: 98 },
    small: 28,
    kicker: 22,
    by: 20,
    date: 18,
    bar: { w: 116, h: 62 },
    mainW: 0.86,
    smallW: 0.3,
    minMain: 300,
  },
  portrait: {
    m: 56,
    capTop: 44,
    maxCap: 210,
    main: { min: 56, max: 118 },
    small: 32,
    kicker: 26,
    by: 22,
    date: 22,
    bar: { w: 132, h: 70 },
    mainW: 0.86,
    smallW: 0.3,
    minMain: 300,
  },
} as const;

interface Palette {
  ink: string;
  accent: string;
  rgb: string;
}

/** Cover lines down one side: an italic English accent, then the smaller lines. */
function smallLines(
  ctx: Ctx,
  col: Rect,
  lines: string[],
  pal: Palette,
  align: TextItem['align'],
  label = true,
  prefix = 'small',
  max = 3,
  used: Set<string> = new Set(),
): Item[] {
  const c = FASHION[ctx.size];
  if (!lines.length || col.w < 200) return [];
  const items: Item[] = [];
  let y = 0;
  if (label) {
    const l = line(
      ctx,
      `${prefix}-inside`,
      'Inside',
      'accentItalic',
      Math.round(c.small * 1.25),
      { x: col.x, y, w: col.w },
      pal.accent,
      align,
      { shadow: shadowFor(pal.ink), lh: 1.2 },
    );
    items.push(l);
    y += l.rect.h + Math.round(c.small * 0.35);
  }
  let n = 0;
  for (const t of lines) {
    if (n >= max || used.has(t)) continue;
    // Up to two lines, never an ellipsis: a heading that does not fit is left out.
    const fit = fitTitleBox({
      text: t,
      maxWidth: col.w,
      maxHeight: c.small * 1.3 * 2,
      lineHeight: 1.3,
      measure: ctx.measure('lineSerif'),
      maxLines: 2,
      minSize: Math.round(c.small * 0.82),
      maxSize: c.small,
    });
    if (fit.truncated) continue;
    if (fit.lines.length === 2) {
      // Balance the two lines (no one-character orphan): the narrowest width that still makes two.
      const m = ctx.measure('lineSerif');
      let bw = col.w;
      while (bw > 60 && wrapText(t, bw - 8, fit.size, m).length === 2) bw -= 8;
      fit.lines = wrapText(t, bw, fit.size, m);
    }
    const hh = Math.ceil(fit.lines.length * fit.size * 1.3);
    used.add(t);
    items.push({
      kind: 'text',
      key: `${prefix}${n++}`,
      rect: { x: col.x, y, w: col.w, h: hh },
      lines: fit.lines,
      size: fit.size,
      lh: 1.3,
      font: 'lineSerif',
      color: pal.ink,
      align,
      shadow: shadowFor(pal.ink),
      accent: pal.accent,
    });
    y += hh + Math.round(c.small * 0.9);
  }
  if (!n) return [];
  const total = stackHeight(items);
  if (total > col.h) {
    // Drop lines from the end until the stack fits.
    while (items.length > (label ? 2 : 1) && stackHeight(items) > col.h) items.pop();
    if (stackHeight(items) > col.h) return [];
  }
  shiftItems(items, col.y + Math.max(0, (col.h - stackHeight(items)) * 0.35));
  return items;
}

/** Category kicker, the big Chinese cover line, byline — bottom-aligned in `col`. With `ext`, a title that fits on
 * one line may run beyond the column along its own rows (kicker and byline keep the same edge). */
function mainLine(
  ctx: Ctx,
  col: Rect,
  pal: Palette,
  align: TextItem['align'],
  sizes: { min: number; max: number },
  withKicker = true,
  ext?: LineExt,
): Item[] {
  const c = FASHION[ctx.size];
  const kicker = withKicker ? ctx.input.category?.trim() : undefined;
  const byH = ctx.input.author?.trim() ? Math.ceil(c.by * 1.3) + 12 : 0;
  const lh = 1.1;
  const sh = shadowFor(pal.ink);
  const stack = (title: TextItem): Item[] => {
    const items: Item[] = [];
    let y = 0;
    if (kicker) {
      const k = line(
        ctx,
        'kicker',
        kicker.toUpperCase(),
        'cond',
        c.kicker,
        { x: col.x, y, w: col.w },
        pal.accent,
        align,
        { tracking: 0.16, shadow: sh, lh: 1.25 },
      );
      items.push(k);
      y += k.rect.h + 6;
    }
    title.rect = { ...title.rect, y };
    items.push(title);
    y += title.rect.h + 12;
    if (byH)
      items.push(
        line(
          ctx,
          'byline',
          `文 / ${ctx.input.author!.trim()}`,
          'sansBold',
          c.by,
          { x: col.x, y, w: col.w },
          pal.ink,
          align,
          { shadow: sh, tracking: 0.04 },
        ),
      );
    shiftItems(items, col.y + col.h - stackHeight(items));
    return items;
  };
  if (ext) {
    const one = tryOneLine(ctx, 'coverSerif', sizes, lh, align, col, ext, stack, {
      color: pal.ink,
      shadow: sh,
      accent: pal.accent,
    });
    if (one) return one.items;
  }
  const kH = kicker ? Math.ceil(c.kicker * 1.25) + 6 : 0;
  const room = Math.max(col.h - kH - byH, sizes.min * lh);
  const title = block(
    ctx,
    'title',
    ctx.input.title,
    'coverSerif',
    { x: col.x, y: 0, w: col.w, h: room },
    sizes,
    lh,
    pal.ink,
    align,
    3,
    { shadow: sh, accent: pal.accent },
  );
  const items = stack(title);
  // Too tall for the column (a short band at the minimum size): drop the kicker rather than overflow.
  if (
    stackHeight(items) - Math.min(...items.map((i) => ('rect' in i ? i.rect.y : 0))) >
      col.h + 0.5 &&
    kicker
  )
    return mainLine(ctx, col, pal, align, sizes, false, ext);
  return items;
}

/** The title item of a stack (for the scrim and neighbours). */
function titleOf(items: Item[]): TextItem | undefined {
  return items.find((i): i is TextItem => i.kind === 'text' && i.key === 'title');
}

interface Sides {
  left: number;
  right: number;
}

/** Free width beside the obstacles that intersect the band [y0, y1]. */
function freeSides(
  w: number,
  m: number,
  obstacles: Rect[],
  y0: number,
  y1: number,
  gap = 24,
): Sides {
  let left = w - 2 * m;
  let right = w - 2 * m;
  for (const o of obstacles) {
    if (o.y + o.h < y0 || o.y > y1) continue;
    left = Math.min(left, o.x - m - gap);
    right = Math.min(right, w - m - (o.x + o.w) - gap);
  }
  return { left: Math.max(0, left), right: Math.max(0, right) };
}

function fashionPhoto(
  ctx: Ctx,
  p: PhotoMaterial,
  v: Variant,
): { items: Item[]; faces: Rect[]; keep: Rect[] } {
  const { w, h, size } = ctx;
  const c = FASHION[size];
  const font = MASTHEAD_FONTS[v.style % MASTHEAD_FONTS.length];
  const mast = masthead(ctx, font, c.m, c.capTop, w - 2 * c.m, c.maxCap, LIGHT, -0.02);
  const capBottom = mast.rect.y + mast.rect.h;
  const dateY = capBottom + Math.round(c.date * 0.9);
  const dateH = Math.ceil(c.date * 1.3);
  const colTop = dateY + dateH + Math.round(c.date * 1.6);
  const portrait = isTall(size);
  const overlapTop = capBottom - mast.rect.h * 0.32;

  // The cutout may only stand in front of the masthead when its silhouette has headroom in the
  // source image; a head cropped by the photo's top edge would show a straight line through the letters.
  const useCut = hasCutoutHeadroom(p);
  // Try subject positions (the variant decides which side first) until the cover lines fit.
  const cxs = portrait ? [0.5, 0.56, 0.44] : v.flip ? [0.36, 0.64, 0.5] : [0.64, 0.36, 0.5];
  const compose = (cx: number, maxFace: number, faceBottomMax: number) =>
    composePhoto(w, h, p, {
      top: useCut || p.subject === 'people' ? overlapTop : colTop,
      cx: w * cx,
      // With a cutout the head may rise into the masthead (it is drawn in front of the letters).
      faceTopMin: useCut ? overlapTop - mast.rect.h * 0.25 : capBottom + 8,
      faceBottomMax,
      maxFace,
      sideMargin: c.m,
    });
  const sidesOf = (cand: Composition) => {
    // Prefer a side clear of the whole figure; settle for clear of the face.
    const strict = freeSides(w, c.m, [...cand.faces, ...cand.keep, ...cand.body], colTop, h - c.m);
    return Math.max(strict.left, strict.right) >= c.minMain
      ? strict
      : freeSides(w, c.m, [...cand.faces, ...cand.keep], colTop, h - c.m);
  };
  const cands = cxs
    .map((cx) => compose(cx, portrait ? 0.42 : 0.6, portrait ? h * 0.6 : h - c.m))
    .map((cand) => ({ cand, s: sidesOf(cand) }));
  let pick =
    cands.find((x) => x.cand.ok && (portrait || Math.max(x.s.left, x.s.right) >= c.minMain)) ??
    cands.find((x) => x.cand.ok) ??
    cands[cands.length - 1];
  if (!portrait && Math.max(pick.s.left, pick.s.right) < c.minMain) {
    // Bottom band: make sure every face ends high enough to leave room for two title lines.
    const need = c.main.min * 1.1 * 2 + c.by * 1.3 + 36;
    const fits = (x: typeof pick) =>
      Math.max(0, ...x.cand.faces.map((f) => f.y + f.h)) + 24 <= h - c.m - need;
    for (const mf of [0.5, 0.42, 0.34, 0.27, 0.2]) {
      if (fits(pick)) break;
      const cand = compose(0.5, mf, h - c.m - need - 24);
      pick = { cand, s: sidesOf(cand) };
    }
  }
  let comp: Composition | null = pick.cand;
  let sides: Sides = pick.s;
  if (!useCut && p.subject === 'nature') {
    // Landscapes without a cutout: cover the frame; the masthead sits in the sky.
    comp = composePhoto(w, h, p, { cx: w * 0.5, focusY: 0.55 });
    sides = freeSides(w, c.m, comp.keep, colTop, h - c.m);
  }
  const { img } = comp!;
  const faces = comp!.faces;
  const keep = comp!.keep;
  const items: Item[] = [
    {
      kind: 'photo',
      key: 'photo',
      layer: 'base',
      clip: { x: 0, y: 0, w, h },
      img,
      src: p.src,
      feather: comp!.feather,
      backdrop: comp!.backdrop,
    },
  ];

  // Masthead ink from what is behind it, with a whisper of shade for legibility.
  const mastLum = areaLum(mast.rect, img, p);
  mast.color = inkFor(mastLum);
  mast.shadow = shadowFor(mast.color);
  items.push(
    scrim(
      'scrimTop',
      { x: 0, y: 0, w, h: capBottom + 120 },
      'to bottom',
      tint(p.avg, mast.color),
      mast.color === LIGHT ? 0.38 : 0.3,
    ),
  );

  const accent = p.accent;
  const textItems: Item[] = [];
  const scrims: Item[] = [];
  const obstacles = [...faces, ...keep];
  const body = comp!.body;
  // A one-line title may run along its own rows up to the barcode / faces; bodies only while contrast holds.
  const extFor = (ink: string, bar: Rect): LineExt => ({
    limit: [c.m, w - c.m],
    hard: [...faces, bar],
    soft: [...keep, ...body],
    softOk: (r) => contrastOk(areaLum(r, img, p), ink, (ink === LIGHT ? 0.62 : 0.5) * 0.6),
    gap: 24,
  });
  const lineScrim = (items: Item[], col: Rect, pal: Palette) => {
    const t = titleOf(items);
    if (!t || (t.rect.x >= col.x - 1 && t.rect.x + t.rect.w <= col.x + col.w + 1)) return;
    scrims.push(
      scrim(
        'scrimLine',
        { x: 0, y: t.rect.y - 140, w, h: h - t.rect.y + 140 },
        'to top',
        pal.rgb,
        pal.ink === LIGHT ? 0.62 : 0.5,
      ),
    );
  };
  if (portrait) {
    const faceBottom = Math.max(0, ...faces.map((f) => f.y + f.h));
    const mainTop = Math.max(faceBottom + 36, Math.round(h * 0.6));
    const main = { x: c.m, y: mainTop, w: w - 2 * c.m - c.bar.w - 24, h: h - c.m - mainTop };
    const ink = inkFor(areaLum(main, img, p));
    const pal = { ink, accent: accentOn(accent, ink), rgb: tint(p.avg, ink) };
    scrims.push(
      scrim(
        'scrimBottom',
        { x: 0, y: mainTop - 220, w, h: h - mainTop + 220 },
        'to top',
        pal.rgb,
        ink === LIGHT ? 0.62 : 0.5,
      ),
    );
    const bar = {
      x: w - c.m - c.bar.w,
      y: h - c.m - c.bar.h - AI_CLEAR[size] + 8,
      w: c.bar.w,
      h: c.bar.h,
    };
    const mainItems = mainLine(ctx, main, pal, 'left', c.main, true, extFor(ink, bar));
    lineScrim(mainItems, main, pal);
    textItems.push(...mainItems);
    // Small lines in the free band beside the head and shoulders.
    const band = { y0: colTop, y1: mainTop - 40 };
    const s = freeSides(w, c.m, obstacles, band.y0, band.y1);
    const lines = coverLinesFrom(ctx.input);
    const leftW = Math.min(s.left, w * c.smallW);
    const rightW = Math.min(s.right, w * c.smallW);
    const split = leftW >= 200 && rightW >= 200 && lines.length > 1;
    const leftMax = split ? 2 : leftW >= rightW ? 3 : 0;
    const rightMax = split ? 1 : leftW >= rightW ? 0 : 3;
    const used = new Set<string>();
    let labelled = false;
    for (const [side, mx, cw] of [
      ['left', leftMax, leftW],
      ['right', rightMax, rightW],
    ] as const) {
      if (!mx || cw < 200) continue;
      const ls = lines;
      const col = {
        x: side === 'left' ? c.m : w - c.m - cw,
        y: band.y0,
        w: cw,
        h: band.y1 - band.y0,
      };
      const sInk = inkFor(areaLum(col, img, p));
      const sPal = { ink: sInk, accent: accentOn(accent, sInk), rgb: tint(p.avg, sInk) };
      const sm = smallLines(ctx, col, ls, sPal, side, !labelled, `small-${side}`, mx, used);
      if (sm.length) {
        labelled = true;
        scrims.push(
          pool(
            `pool-${side}`,
            {
              x: col.x,
              y: sm[0].kind === 'text' ? sm[0].rect.y : col.y,
              w: cw,
              h: stackHeight(sm) - (sm[0].kind === 'text' ? sm[0].rect.y : col.y),
            },
            sPal.rgb,
            sInk === LIGHT ? 0.42 : 0.36,
          ),
        );
        textItems.push(...sm);
      }
    }
    textItems.push(barcode(ctx, bar));
    textItems.push(
      ...datelineItem(ctx, dateY, c.date, mast.color, mast.shadow, 'left', faces, c.m),
    );
  } else if (Math.max(sides.left, sides.right) < c.minMain) {
    // No side column beside the subject: the cover line runs along the bottom, under the faces.
    const faceBottom = Math.max(0, ...faces.map((f) => f.y + f.h));
    const barY = h - c.m - c.bar.h - AI_CLEAR[size] + c.m - 6;
    const top = Math.max(faceBottom + 24, Math.round(h * 0.5));
    const main = { x: c.m, y: top, w: w - 2 * c.m - c.bar.w - 32, h: h - c.m - top };
    const ink = inkFor(areaLum(main, img, p));
    const pal = { ink, accent: accentOn(accent, ink), rgb: tint(p.avg, ink) };
    scrims.push(
      scrim(
        'scrimBottom',
        { x: 0, y: top - 160, w, h: h - top + 160 },
        'to top',
        pal.rgb,
        ink === LIGHT ? 0.62 : 0.5,
      ),
    );
    const bar = { x: w - c.m - c.bar.w, y: barY, w: c.bar.w, h: c.bar.h };
    const mainItems = mainLine(
      ctx,
      main,
      pal,
      'left',
      { min: c.main.min, max: Math.min(c.main.max, Math.floor((h - c.m - top) / 1.1 / 1.4)) },
      true,
      extFor(ink, bar),
    );
    lineScrim(mainItems, main, pal);
    textItems.push(...mainItems);
    textItems.push(barcode(ctx, bar));
    textItems.push(
      ...datelineItem(ctx, dateY, c.date, mast.color, mast.shadow, 'left', faces, c.m),
    );
  } else {
    const mainSide: 'left' | 'right' = sides.left >= sides.right ? 'left' : 'right';
    const mainW = Math.min(mainSide === 'left' ? sides.left : sides.right, w * c.mainW);
    const otherW = Math.min(mainSide === 'left' ? sides.right : sides.left, w * c.smallW);
    const bottom = h - c.m;
    const barSide = otherW >= c.bar.w + 10 ? (mainSide === 'left' ? 'right' : 'left') : mainSide;
    const barX = barSide === 'left' ? c.m : w - c.m - c.bar.w;
    const barY = h - c.m - c.bar.h - (barSide === 'right' ? AI_CLEAR[size] - c.m + 6 : 0);
    const mainBottom =
      barSide === mainSide ? barY - 16 : mainSide === 'right' ? h - AI_CLEAR[size] - 8 : bottom;
    const main = {
      x: mainSide === 'left' ? c.m : w - c.m - mainW,
      y: colTop,
      w: mainW,
      h: mainBottom - colTop,
    };
    const ink = inkFor(areaLum(main, img, p));
    const pal = { ink, accent: accentOn(accent, ink), rgb: tint(p.avg, ink) };
    const lines = coverLinesFrom(ctx.input);
    const align = mainSide;
    const bar = { x: barX, y: barY, w: c.bar.w, h: c.bar.h };
    const mainItems = mainLine(ctx, main, pal, align, c.main, true, extFor(ink, bar));
    const mainTop = Math.min(...mainItems.map((i) => ('rect' in i ? i.rect.y : h)));
    const titleRect = titleOf(mainItems)?.rect;
    scrims.push(
      scrim(
        'scrimSide',
        { x: mainSide === 'left' ? 0 : w - mainW - 2 * c.m - 80, y: 0, w: mainW + 2 * c.m + 80, h },
        mainSide === 'left' ? 'to right' : 'to left',
        pal.rgb,
        ink === LIGHT ? 0.55 : 0.45,
      ),
    );
    lineScrim(mainItems, main, pal);
    textItems.push(...mainItems);
    // The other side carries the smaller lines and the barcode; with no room there, they stack above the main line.
    if (otherW >= 180) {
      const col = {
        x: mainSide === 'left' ? w - c.m - otherW : c.m,
        y: colTop,
        w: otherW,
        h: barY - 24 - colTop,
      };
      // A one-line title running into this side: the small lines stay above it.
      if (titleRect && titleRect.x < col.x + col.w && titleRect.x + titleRect.w > col.x)
        col.h = Math.min(col.h, mainTop - 28 - colTop);
      const sInk = inkFor(areaLum(col, img, p));
      const sPal = { ink: sInk, accent: accentOn(accent, sInk), rgb: tint(p.avg, sInk) };
      const sm = smallLines(ctx, col, lines, sPal, mainSide === 'left' ? 'right' : 'left');
      if (sm.length) {
        const y0 = Math.min(...sm.map((i) => ('rect' in i ? i.rect.y : h)));
        scrims.push(
          pool(
            'pool-small',
            { x: col.x, y: y0, w: otherW, h: stackHeight(sm) - y0 },
            sPal.rgb,
            sInk === LIGHT ? 0.42 : 0.36,
          ),
        );
      }
      textItems.push(...sm);
    } else {
      const col = {
        x: main.x,
        y: colTop,
        w: Math.min(mainW, w * c.smallW + 40),
        h: mainTop - 28 - colTop,
      };
      textItems.push(...smallLines(ctx, col, lines, pal, align, true, 'small', 2));
    }
    // Dateline under the masthead, on the side that is clear of the face.
    textItems.push(
      ...datelineItem(ctx, dateY, c.date, mast.color, mast.shadow, mainSide, faces, c.m),
    );
    textItems.push(barcode(ctx, { x: barX, y: barY, w: c.bar.w, h: c.bar.h }));
  }
  items.push(...scrims, mast);
  if (useCut && comp!.ok)
    items.push({
      kind: 'photo',
      key: 'cutout',
      layer: 'cut',
      clip: { x: 0, y: 0, w, h },
      img,
      src: p.cutout!,
      feather: comp!.feather,
      backdrop: false,
    });
  items.push(...textItems);
  return { items, faces, keep };
}

/** Drawn material: backdrop, masthead, then the subject in front of the masthead. */
function fashionArt(ctx: Ctx, a: ArtMaterial, v: Variant): Item[] {
  const { w, h, size } = ctx;
  const c = FASHION[size];
  const frame = { x: 0, y: 0, w, h };
  const font = MASTHEAD_FONTS[v.style % MASTHEAD_FONTS.length];
  const mast = masthead(ctx, font, c.m, c.capTop, w - 2 * c.m, c.maxCap, a.ink, -0.02);
  const capBottom = mast.rect.y + mast.rect.h;
  const dateY = capBottom + Math.round(c.date * 0.9);
  const colTop = dateY + Math.ceil(c.date * 1.3) + Math.round(c.date * 1.6);
  const portrait = isTall(size);
  const subjectTop = capBottom - mast.rect.h * 0.34;
  let boxH = (h - subjectTop) / (1 - a.top);
  let boxW = boxH * a.fgAspect;
  const room = portrait ? w : w * 0.5;
  if (boxW > room) {
    boxH *= room / boxW;
    boxW = room;
  }
  const subjectLeft = portrait ? false : v.flip;
  const cx = portrait ? w * 0.56 : subjectLeft ? w * 0.3 : w * 0.7;
  const box = { x: cx - a.cx * boxW, y: h - boxH, w: boxW, h: boxH };
  const rgbDark = hexLum(a.ink) > 58 ? tint(a.tone, LIGHT) : tint('#ffffff', DARK);
  const pal = {
    ink: a.ink,
    accent: accentOn(a.accent === a.ink ? a.hi : a.accent, a.ink),
    rgb: rgbDark,
  };
  const items: Item[] = [
    { kind: 'artBg', key: 'bg', clip: frame, id: a.id },
    mast,
    { kind: 'artFg', key: 'fg', clip: frame, box, id: a.id },
  ];
  const lines = coverLinesFrom(ctx.input);
  if (portrait) {
    const main = {
      x: c.m,
      y: Math.round(h * 0.66),
      w: Math.round(w * 0.5),
      h: h - c.m - Math.round(h * 0.66),
    };
    const lightPal = { ink: LIGHT, accent: accentOn(a.accent, LIGHT), rgb: tint(a.tone, LIGHT) };
    items.push(
      scrim(
        'scrimBottom',
        { x: 0, y: main.y - 260, w, h: h - main.y + 260 },
        'to top',
        lightPal.rgb,
        0.6,
      ),
    );
    const bar = {
      x: w - c.m - c.bar.w,
      y: h - c.m - c.bar.h - AI_CLEAR[size] + 8,
      w: c.bar.w,
      h: c.bar.h,
    };
    // The bottom scrim keeps light ink legible across the figure, so a single line may run over it.
    items.push(
      ...mainLine(ctx, main, lightPal, 'left', c.main, true, {
        limit: [c.m, w - c.m],
        hard: [bar],
        gap: 24,
      }),
    );
    items.push(barcode(ctx, bar));
    items.push(...datelineItem(ctx, dateY, c.date, a.ink, undefined, 'left', [], c.m));
  } else {
    const side: 'left' | 'right' = subjectLeft ? 'right' : 'left';
    const cw = Math.round(w * c.mainW);
    const main = {
      x: side === 'left' ? c.m : w - c.m - cw,
      y: colTop,
      w: cw,
      h: (side === 'right' ? h - AI_CLEAR[size] - 8 : h - c.m) - colTop,
    };
    items.push(
      scrim(
        'scrimSide',
        { x: side === 'left' ? 0 : w - cw - 2 * c.m - 60, y: 0, w: cw + 2 * c.m + 60, h },
        side === 'left' ? 'to right' : 'to left',
        pal.rgb,
        0.4,
      ),
    );
    const barX = side === 'left' ? w - c.m - c.bar.w : c.m;
    const bar = {
      x: barX,
      y: h - c.m - c.bar.h - (side === 'left' ? AI_CLEAR[size] - c.m + 6 : 0),
      w: c.bar.w,
      h: c.bar.h,
    };
    // The figure is a hard edge here (flat artwork, no scrim behind it).
    const mainItems = mainLine(ctx, main, pal, side, c.main, true, {
      limit: [c.m, w - c.m],
      hard: [bar, box],
      gap: 24,
    });
    const mainTop = Math.min(...mainItems.map((i) => ('rect' in i ? i.rect.y : h)));
    items.push(...mainItems);
    items.push(
      ...smallLines(
        ctx,
        { x: main.x, y: colTop, w: Math.round(w * c.smallW) + 40, h: mainTop - 28 - colTop },
        lines,
        pal,
        side,
        true,
        'small',
        2,
      ),
    );
    items.push(...datelineItem(ctx, dateY, c.date, a.ink, undefined, side, [], c.m));
    items.push(barcode(ctx, bar));
  }
  return items;
}

/* ------------------------------------------------------------------ journal */

const JOURNAL = {
  card: {
    m: 56,
    capTop: 40,
    maxCap: 46,
    title: { min: 30, max: 52 },
    date: 18,
    deck: 17,
    by: 14,
    titleW: 0.44,
  },
  og: {
    m: 48,
    capTop: 34,
    maxCap: 40,
    title: { min: 28, max: 46 },
    date: 16,
    deck: 15,
    by: 13,
    titleW: 0.44,
  },
  wide: {
    m: 40,
    capTop: 26,
    maxCap: 30,
    title: { min: 24, max: 40 },
    date: 13,
    deck: 13,
    by: 11,
    titleW: 0.42,
  },
  square: {
    m: 72,
    capTop: 60,
    maxCap: 60,
    title: { min: 42, max: 74 },
    date: 22,
    deck: 22,
    by: 18,
    titleW: 0.76,
  },
  portrait: {
    m: 80,
    capTop: 72,
    maxCap: 72,
    title: { min: 48, max: 84 },
    date: 26,
    deck: 26,
    by: 20,
    titleW: 0.76,
  },
} as const;

function journal(
  ctx: Ctx,
  mat: Material,
  v: Variant,
): { items: Item[]; faces: Rect[]; keep: Rect[] } {
  const { w, h, size } = ctx;
  const c = JOURNAL[size];
  const frame = { x: 0, y: 0, w, h };
  const mast = masthead(ctx, 'mastPrata', c.m, c.capTop, w - 2 * c.m, c.maxCap, LIGHT, 0.34);
  const capBottom = mast.rect.y + mast.rect.h;
  const dateY = capBottom + Math.round(c.date * 0.8);
  const dateH = Math.ceil(c.date * 1.35);
  const clearTop = dateY + dateH + 28;
  const items: Item[] = [];
  let faces: Rect[] = [];
  let keep: Rect[] = [];
  let body: Rect[] = [];
  let lumAt: (r: Rect) => number;
  let rgbFor: (ink: string) => string;
  const portrait = isTall(size);
  const subjectLeft = !v.flip;
  if (mat.kind === 'photo') {
    const comp =
      mat.subject === 'people'
        ? composePhoto(w, h, mat, {
            top: clearTop + 10,
            cx: portrait ? w * 0.5 : w * (subjectLeft ? 0.36 : 0.64),
            faceTopMin: clearTop,
            maxFace: portrait ? 0.32 : 0.6,
            faceBottomMax: portrait ? h * 0.58 : h - c.m,
            sideMargin: c.m,
          })
        : composePhoto(w, h, mat, { cx: w * 0.5, focusY: 0.55 });
    faces = comp.faces;
    keep = comp.keep;
    body = comp.body;
    items.push({
      kind: 'photo',
      key: 'photo',
      layer: 'base',
      clip: frame,
      img: comp.img,
      src: mat.src,
      feather: comp.feather,
      backdrop: comp.backdrop,
    });
    lumAt = (r) => areaLum(r, comp.img, mat);
    rgbFor = (ink) => tint(mat.avg, ink);
  } else {
    items.push({ kind: 'artBg', key: 'bg', clip: frame, id: mat.id });
    const subjectTop = clearTop + 24;
    let boxH = (h - subjectTop) / (1 - mat.top);
    let boxW = boxH * mat.fgAspect;
    if (!portrait && boxW > w * 0.5) {
      boxH *= (w * 0.5) / boxW;
      boxW = w * 0.5;
    }
    const cx = portrait ? w * 0.5 : w * (subjectLeft ? 0.32 : 0.68);
    const box = { x: cx - mat.cx * boxW, y: h - boxH, w: boxW, h: boxH };
    items.push({ kind: 'artFg', key: 'fg', clip: frame, box, id: mat.id });
    keep = portrait
      ? []
      : [{ x: box.x + box.w * 0.1, y: box.y, w: box.w * 0.8, h: box.h }].flatMap(
          (r) => inFrame(r, w, h) ?? [],
        );
    lumAt = () => (hexLum(mat.ink) > 58 ? 20 : 80);
    rgbFor = (ink) => tint(ink === LIGHT ? mat.tone : '#ffffff', ink);
  }
  mast.color = inkFor(lumAt(mast.rect));
  const quiet = mast.color === LIGHT ? 'dark' : 'light';
  mast.shadow = quiet;
  items.push(
    scrim('scrimTop', { x: 0, y: 0, w, h: clearTop + 60 }, 'to bottom', rgbFor(mast.color), 0.28),
  );
  items.push(mast);
  items.push(
    line(
      ctx,
      'dateline',
      journalDateline(ctx.date, ctx.input.issue, ctx.input.handle),
      'accentItalic',
      c.date,
      { x: c.m, y: dateY, w: w - 2 * c.m },
      mast.color,
      'center',
      { shadow: quiet },
    ),
  );

  // One quiet title block with a lot of air, on the side away from the subject.
  const obstacles = [...faces, ...keep];
  let tw = Math.round(w * c.titleW);
  let col: Rect;
  let valignTop = false;
  if (portrait) {
    // Below the faces, or — when a landscape's subject fills the lower frame — up in the sky.
    const faceBottom = Math.max(0, ...faces.map((f) => f.y + f.h));
    const below = Math.max(faceBottom + 40, Math.round(h * 0.62));
    const keepTop = Math.min(h, ...keep.map((k) => k.y));
    const belowClear = keepTop >= below ? h - c.m - AI_CLEAR[size] - below : 0;
    const above = keepTop - 40 - (clearTop + 60);
    if (keep.length && belowClear < 300 && above > belowClear) {
      col = { x: c.m, y: clearTop + 60, w: tw, h: above };
      valignTop = true;
    } else {
      col = { x: c.m, y: below, w: tw, h: h - c.m - AI_CLEAR[size] - below };
    }
  } else {
    const strict = freeSides(w, c.m, [...obstacles, ...body], clearTop, h - c.m);
    const s =
      Math.max(strict.left, strict.right) >= 300
        ? strict
        : freeSides(w, c.m, obstacles, clearTop, h - c.m);
    const side: 'left' | 'right' = s.left >= s.right ? 'left' : 'right';
    tw = Math.max(240, Math.min(tw, side === 'left' ? s.left : s.right));
    col = {
      x: side === 'left' ? c.m : w - c.m - tw,
      y: clearTop + 40,
      w: tw,
      h: h - c.m - AI_CLEAR[size] - clearTop - 40,
    };
  }
  let ink = inkFor(lumAt(col));
  let sh = shadowFor(ink);
  const lh = 1.32;
  const deckText = deckFrom(ctx.input.summary, ctx.input.title);
  let deck = deckText;
  const byH = Math.ceil(c.by * 1.4) + 14;
  const by = [ctx.input.author?.trim(), ctx.input.category?.trim()].filter(Boolean).join('  ·  ');
  const stack = (title: TextItem): Item[] => {
    const out: Item[] = [];
    let y = 0;
    // Rule, deck and byline share the title's left edge (it may have slid left to stay on one line).
    const x0 = title.rect.x;
    title.rect = { ...title.rect, y };
    out.push(title);
    y += title.rect.h + 18;
    out.push({
      kind: 'fill',
      key: 'rule',
      rect: { x: x0, y, w: 40, h: 2 },
      background: ink === LIGHT ? 'rgba(255,255,255,0.8)' : 'rgba(22,18,28,0.75)',
    });
    y += 2 + 16;
    if (deck) {
      const fit = fitTitleBox({
        text: deck,
        maxWidth: col.w,
        maxHeight: c.deck * 1.5 * 2,
        lineHeight: 1.5,
        measure: ctx.measure('accentItalic'),
        maxLines: 2,
        minSize: Math.round(c.deck * 0.9),
        maxSize: c.deck,
      });
      if (!fit.truncated) {
        const dh = Math.ceil(fit.lines.length * fit.size * 1.5);
        out.push({
          kind: 'text',
          key: 'deck',
          rect: { x: x0, y, w: col.w, h: dh },
          lines: fit.lines,
          size: fit.size,
          lh: 1.5,
          font: 'accentItalic',
          color: ink,
          align: 'left',
          shadow: sh,
        });
        y += dh + 14;
      }
    }
    if (by)
      out.push(
        line(ctx, 'byline', by, 'cond', c.by, { x: x0, y, w: col.w }, ink, 'left', {
          tracking: 0.16,
          shadow: sh,
        }),
      );
    shiftItems(out, valignTop ? col.y : col.y + col.h - stackHeight(out));
    return out;
  };
  // One line first, along the free part of its own rows (faces are hard; bodies / landscape subjects only while the
  // pool behind the title keeps contrast).
  const ext: LineExt = {
    limit: [c.m, w - c.m],
    hard: mat.kind === 'photo' ? faces : [...faces, ...keep],
    soft: mat.kind === 'photo' ? [...keep, ...body] : [],
    softOk: (r) => contrastOk(lumAt(r), ink, (ink === LIGHT ? 0.52 : 0.62) * 0.6),
    gap: 24,
  };
  const layoutText = (): { items: Item[]; truncated: boolean } => {
    const one = tryOneLine(
      ctx,
      'journalSerif',
      c.title,
      lh,
      'left',
      col,
      ext,
      stack,
      { color: ink, shadow: sh },
      0,
      true,
    );
    if (one) return { items: one.items, truncated: false };
    const deckH = deck ? Math.ceil(c.deck * 1.5 * 2) + 16 : 0;
    const t = block(
      ctx,
      'title',
      ctx.input.title,
      'journalSerif',
      { x: col.x, y: 0, w: col.w, h: Math.max(col.h - deckH - byH - 24, c.title.min * lh) },
      c.title,
      lh,
      ink,
      'left',
      3,
      { shadow: sh },
    );
    return {
      items: stack(t),
      truncated: t.lines.some((l) => l.endsWith('…')) && !ctx.input.title.trim().endsWith('…'),
    };
  };
  // The whole title wins over the deck and over the preferred spot: try without the deck, then the other
  // placements, and only accept an ellipsis when nothing shows it in full.
  const placements: { col: Rect; top: boolean }[] = [{ col, top: valignTop }];
  if (portrait) {
    const faceBottom = Math.max(0, ...faces.map((f) => f.y + f.h));
    const below = Math.max(faceBottom + 40, Math.round(h * 0.62));
    const lower = { x: c.m, y: below, w: tw, h: h - c.m - AI_CLEAR[size] - below };
    const sky = {
      x: c.m,
      y: clearTop + 60,
      w: w - 2 * c.m,
      h: Math.max(lower.y - 40 - (clearTop + 60), 0),
    };
    if (valignTop)
      placements.push({ col: lower, top: false }, { col: { ...col, w: w - 2 * c.m }, top: true });
    else
      placements.push({ col: { ...lower, w: w - 2 * c.m }, top: false }, { col: sky, top: true });
  }
  let chosen: { items: Item[]; truncated: boolean } | null = null;
  const first = { col, top: valignTop };
  outer: for (const pl of placements) {
    for (const withDeck of deckText ? [true, false] : [false]) {
      col = pl.col;
      valignTop = pl.top;
      deck = withDeck ? deckText : '';
      ink = inkFor(lumAt(col));
      sh = shadowFor(ink);
      const r = layoutText();
      if (!r.truncated) {
        chosen = r;
        break outer;
      }
    }
  }
  if (!chosen) {
    col = first.col;
    valignTop = first.top;
    deck = deckText;
    ink = inkFor(lumAt(col));
    sh = shadowFor(ink);
    chosen = layoutText();
  }
  const text: Item[] = chosen.items;
  const ty = Math.min(...text.map((i) => ('rect' in i ? i.rect.y : h)));
  const tb = Math.max(...text.map((i) => ('rect' in i ? i.rect.y + i.rect.h : 0)));
  // Ink from what is really behind the text block (not the whole column), then recolour.
  const tw2 = Math.max(
    ...text.map((i) =>
      i.kind === 'text' ? Math.max(...i.lines.map((l) => ctx.measure(i.font)(l, i.size))) : 0,
    ),
  );
  const tx = Math.min(...text.map((i) => ('rect' in i ? i.rect.x : w)));
  const real = inkFor(lumAt({ x: tx, y: ty, w: Math.max(40, tw2), h: tb - ty }));
  if (real !== ink) {
    ink = real;
    sh = shadowFor(ink);
    for (const it of text) {
      if (it.kind === 'text') Object.assign(it, { color: ink, shadow: sh });
      if (it.kind === 'fill')
        it.background = ink === LIGHT ? 'rgba(255,255,255,0.8)' : 'rgba(22,18,28,0.75)';
    }
  }
  items.push(
    pool(
      'pool-title',
      { x: tx, y: ty, w: Math.min(Math.max(col.w, tw2), tw2 + 24), h: tb - ty },
      rgbFor(ink),
      ink === LIGHT ? 0.52 : 0.62,
    ),
  );
  items.push(...text);
  return { items, faces, keep };
}

/* ---------------------------------------------------------------------- 小红书 */

const XHS = {
  card: { m: 48, title: { min: 44, max: 96 }, sticker: 26, by: 22 },
  og: { m: 40, title: { min: 38, max: 84 }, sticker: 24, by: 20 },
  wide: { m: 30, title: { min: 30, max: 66 }, sticker: 18, by: 15 },
  square: { m: 64, title: { min: 64, max: 120 }, sticker: 30, by: 26 },
  portrait: { m: 72, title: { min: 76, max: 140 }, sticker: 34, by: 30 },
} as const;

function xhsTitle(
  ctx: Ctx,
  col: Rect,
  v: Variant,
  ink: string,
  hi: string,
  valign: 'top' | 'bottom' | 'center',
  accent: string,
  ext?: LineExt,
): { items: Item[]; top: number } {
  const c = XHS[ctx.size];
  const style = (['marker', 'plain', 'box'] as const)[v.style];
  const pad = style === 'box' ? 0.4 : style === 'marker' ? 0.14 : 0;
  const lh = style === 'box' ? 1.3 : 1.18;
  const color0 = style === 'box' ? DARK : ink;
  const base = {
    color: color0,
    deco: (style === 'box'
      ? { type: 'box', color: 'rgba(255,255,255,0.92)' }
      : style === 'marker'
        ? { type: 'marker', color: hi }
        : undefined) as TextDeco | undefined,
    shadow: style === 'box' ? undefined : shadowFor(color0),
    accent: style === 'plain' ? accentOn(accent, color0) : undefined,
  };
  if (ext) {
    const place = (t: TextItem): Item[] => {
      const th = t.rect.h;
      t.rect = {
        ...t.rect,
        y:
          valign === 'top'
            ? col.y
            : valign === 'center'
              ? col.y + Math.round((col.h - th) * 0.45)
              : col.y + col.h - th,
      };
      return [t];
    };
    const one = tryOneLine(ctx, 'heavy', c.title, lh, 'left', col, ext, place, base, pad, true);
    if (one) return { items: one.items, top: one.title.rect.y };
  }
  const fit = fitTitleBox({
    text: ctx.input.title,
    maxWidth: col.w - pad * c.title.max,
    maxHeight: col.h,
    lineHeight: lh,
    measure: ctx.measure('heavy'),
    maxLines: 3,
    minSize: c.title.min,
    maxSize: c.title.max,
  });
  const th = Math.ceil(fit.lines.length * fit.size * lh);
  const y =
    valign === 'top'
      ? col.y
      : valign === 'center'
        ? col.y + Math.round((col.h - th) * 0.45)
        : col.y + col.h - th;
  const color = style === 'box' ? DARK : ink;
  const deco: TextDeco | undefined =
    style === 'box'
      ? { type: 'box', color: 'rgba(255,255,255,0.92)' }
      : style === 'marker'
        ? { type: 'marker', color: hi }
        : undefined;
  return {
    items: [
      {
        kind: 'text',
        key: 'title',
        rect: { x: col.x, y, w: col.w, h: th },
        lines: fit.lines,
        size: fit.size,
        lh,
        font: 'heavy',
        color,
        align: 'left',
        deco,
        shadow: style === 'box' ? undefined : shadowFor(color),
        accent: style === 'plain' ? accentOn(accent, color) : undefined,
      },
    ],
    top: y,
  };
}

function sticker(ctx: Ctx, x: number, y: number, bg: string, fg: string, tilt: number): Item {
  const c = XHS[ctx.size];
  const text = ctx.input.category?.trim() || '笔记';
  const tw = Math.min(
    ctx.measure('heavy')(text, c.sticker) + Array.from(text).length * 0.04 * c.sticker,
    ctx.w * 0.5,
  );
  return {
    kind: 'sticker',
    key: 'sticker',
    rect: { x, y, w: Math.ceil(tw + c.sticker * 1.4), h: Math.round(c.sticker * 1.9) },
    text,
    size: c.sticker,
    background: bg,
    color: fg,
    rotate: tilt,
  };
}

function byline(ctx: Ctx, x: number, y: number, maxW: number, dark: boolean): Item {
  const c = XHS[ctx.size];
  const handle = ctx.input.handle?.trim();
  const name = ctx.input.author?.trim() || '辰记作者';
  const text = handle ? `@${handle}` : name;
  const dot = Math.round(c.by * 1.6);
  const tw = Math.min(ctx.measure('sansBold')(text, c.by), maxW - dot - c.by * 2);
  return {
    kind: 'byline',
    key: 'byline',
    rect: { x, y, w: Math.ceil(dot + tw + c.by * 2), h: Math.round(dot + c.by * 0.5) },
    text,
    initial: Array.from(name)[0] ?? '辰',
    size: c.by,
    background: dark ? 'rgba(18,12,28,0.45)' : 'rgba(255,255,255,0.7)',
    color: dark ? LIGHT : DARK,
    dot: BRAND,
    dotInk: LIGHT,
  };
}

/**
 * A portrait photo beside a side title (3:2 / OG / 2.35:1): the subject goes to one side, and shrinks (the blurred
 * extension takes over) until every face leaves a column of at least 300 px free.
 */
function sidePeople(
  w: number,
  h: number,
  p: PhotoMaterial,
  m: number,
  subjectLeft: boolean,
): Composition {
  let last: Composition | null = null;
  for (const mf of [0.55, 0.44, 0.34, 0.26, 0.2, 0.15]) {
    for (const left of [subjectLeft, !subjectLeft]) {
      const comp = composePhoto(w, h, p, {
        top: m,
        cx: w * (left ? 0.3 : 0.7),
        faceTopMin: m,
        maxFace: mf,
        faceBottomMax: h - m,
        sideMargin: m,
      });
      const s = freeSides(w, m, comp.faces, m, h - m);
      last = comp;
      if (comp.ok && Math.max(s.left, s.right) >= 300) return comp;
    }
  }
  return last!;
}

function xhs(ctx: Ctx, mat: Material, v: Variant): { items: Item[]; faces: Rect[]; keep: Rect[] } {
  const { w, h, size } = ctx;
  const c = XHS[size];
  const frame = { x: 0, y: 0, w, h };
  const stickerH = Math.round(c.sticker * 1.9);
  const byH = Math.round(c.by * 1.6 + c.by * 0.5);
  const portrait = isTall(size);
  const items: Item[] = [];
  let faces: Rect[] = [];
  let keep: Rect[] = [];
  let body: Rect[] = [];
  let lumAt: (r: Rect) => number;
  let rgbFor: (ink: string) => string;
  let accent: string;
  let accentInk: string;
  let hiFor: (ink: string) => string;
  const subjectLeft = v.flip;
  // Where the title goes: above the subject in 3:4, beside it in 3:2 / OG.
  const titleTop = c.m + stickerH + 26;
  const titleBottom = Math.round(h * 0.38);
  if (mat.kind === 'photo') {
    const comp = portrait
      ? mat.subject === 'people' || mat.cutout
        ? composePhoto(w, h, mat, {
            top: titleBottom + 24,
            cx: w * 0.5,
            faceTopMin: titleBottom + 24,
            maxFace: 0.34,
            sideMargin: c.m,
          })
        : composePhoto(w, h, mat, { cx: w * 0.5, focusY: 0.6 })
      : mat.subject === 'people'
        ? sidePeople(w, h, mat, c.m, subjectLeft)
        : composePhoto(w, h, mat, { cx: w * 0.5, focusY: 0.5 });
    faces = comp.faces;
    keep = comp.keep;
    body = comp.body;
    items.push({
      kind: 'photo',
      key: 'photo',
      layer: 'base',
      clip: frame,
      img: comp.img,
      src: mat.src,
      feather: comp.feather,
      backdrop: comp.backdrop,
    });
    lumAt = (r) => areaLum(r, comp.img, mat);
    rgbFor = (ink) => tint(mat.avg, ink);
    accent = mat.accent;
    accentInk = mat.accentInk;
    hiFor = (ink) =>
      ink === LIGHT ? (hexLum(mat.accent) > 58 ? BRAND : mat.accent) : 'rgba(255,255,255,0.85)';
  } else {
    items.push({ kind: 'artBg', key: 'bg', clip: frame, id: mat.id });
    const subjectTop = portrait ? titleBottom + 30 : h * 0.08;
    let boxH = (h - subjectTop) / (1 - mat.top);
    let boxW = boxH * mat.fgAspect;
    if (!portrait && boxW > w * 0.5) {
      boxH *= (w * 0.5) / boxW;
      boxW = w * 0.5;
    }
    const cx = portrait ? w * (subjectLeft ? 0.42 : 0.58) : w * (subjectLeft ? 0.26 : 0.74);
    const box = { x: cx - mat.cx * boxW, y: h - boxH, w: boxW, h: boxH };
    items.push({ kind: 'artFg', key: 'fg', clip: frame, box, id: mat.id });
    keep = portrait
      ? []
      : [{ x: box.x + box.w * 0.1, y: box.y, w: box.w * 0.8, h: box.h }].flatMap(
          (r) => inFrame(r, w, h) ?? [],
        );
    lumAt = () => (hexLum(mat.ink) > 58 ? 20 : 80);
    rgbFor = (ink) => tint(ink === LIGHT ? mat.tone : '#ffffff', ink);
    accent = mat.accent;
    accentInk = mat.accentInk;
    hiFor = () => mat.hi;
  }
  const obstacles = [...faces, ...keep];
  let col: Rect;
  let valign: 'top' | 'bottom' | 'center';
  if (portrait) {
    const faceTop = Math.min(h, ...faces.map((f) => f.y));
    col = {
      x: c.m,
      y: titleTop,
      w: w - 2 * c.m,
      h: Math.min(titleBottom, faceTop - 24) - titleTop,
    };
    valign = 'top';
  } else {
    const s = freeSides(w, c.m, obstacles, c.m, h - c.m);
    const side: 'left' | 'right' = s.left >= s.right ? 'left' : 'right';
    const cw = Math.max(260, Math.min(w * 0.5, side === 'left' ? s.left : s.right));
    col = {
      x: side === 'left' ? c.m : w - c.m - cw,
      y: titleTop,
      w: cw,
      h: h - c.m - byH - 30 - titleTop,
    };
    valign = 'center';
    // A landscape whose subject fills the width: the title takes the sky above it instead.
    const keepTop = Math.min(h, ...keep.map((k) => k.y));
    const sky = { x: c.m, y: titleTop, w: Math.round(w * 0.62), h: keepTop - 30 - titleTop };
    if (cw < 420 && !faces.length && sky.h >= c.title.min * 1.3 * 2) {
      col = sky;
      valign = 'top';
    }
  }
  const ink = inkFor(lumAt(col));
  const ext: LineExt = {
    limit: [c.m, w - c.m],
    hard: mat.kind === 'photo' ? faces : [...faces, ...keep],
    soft: mat.kind === 'photo' ? [...keep, ...body] : [],
    softOk: (r) => contrastOk(lumAt(r), ink, (ink === LIGHT ? 0.5 : 0.42) * 0.6),
    gap: 24,
  };
  let t = xhsTitle(ctx, col, v, ink, hiFor(ink), valign, accent, ext);
  {
    // A title that slid left drags the sticker and author pill with it; they must stay clear too.
    const tx0 = Math.min(col.x, (t.items[0] as TextItem).rect.x);
    const probe = [
      sticker(ctx, tx0, Math.max(c.m, t.top - stickerH - 22), accent, accentInk, v.tilt),
      byline(ctx, tx0, h - c.m - byH, col.w, true),
    ];
    if (
      tx0 < col.x &&
      probe.some((it) => 'rect' in it && ext.hard.some((o) => intersects(o, it.rect, 8)))
    )
      t = xhsTitle(ctx, col, v, ink, hiFor(ink), valign, accent);
  }
  const tItem = t.items[0] as TextItem;
  if (portrait)
    items.push(
      scrim(
        'scrimTop',
        { x: 0, y: 0, w, h: tItem.rect.y + tItem.rect.h + 200 },
        'to bottom',
        rgbFor(ink),
        ink === LIGHT ? 0.6 : 0.5,
      ),
    );
  else items.push(pool('pool-title', tItem.rect, rgbFor(ink), ink === LIGHT ? 0.5 : 0.42));
  const byY = h - c.m - byH;
  items.push(
    scrim(
      'scrimBottom',
      { x: 0, y: byY - 120, w, h: h - byY + 120 },
      'to top',
      rgbFor(LIGHT),
      0.35,
    ),
  );
  // Sticker and author pill share the title's left edge (it may have slid left to stay on one line).
  const tx = Math.min(col.x, tItem.rect.x);
  items.push(sticker(ctx, tx, Math.max(c.m, t.top - stickerH - 22), accent, accentInk, v.tilt));
  items.push(...t.items);
  items.push(byline(ctx, tx, byY, col.w, true));
  return { items, faces, keep };
}

/* --------------------------------------------------------------------- 风景 */

const SCENIC = {
  card: { m: 56, title: { min: 40, max: 86 }, kicker: 16, by: 15 },
  og: { m: 48, title: { min: 36, max: 74 }, kicker: 15, by: 14 },
  wide: { m: 34, title: { min: 28, max: 52 }, kicker: 12, by: 11 },
  square: { m: 72, title: { min: 52, max: 96 }, kicker: 22, by: 19 },
  portrait: { m: 80, title: { min: 60, max: 112 }, kicker: 24, by: 21 },
} as const;

type Zone = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * 风景: a colourful landscape photo, full bleed, with the title laid over its quietest area (sky, water, sand)
 * on a soft scrim — no masthead, no cover lines: a category kicker, the title and a small byline.
 */
function scenic(ctx: Ctx, mat: Material): { items: Item[]; faces: Rect[]; keep: Rect[] } {
  const { w, h, size } = ctx;
  const c = SCENIC[size];
  const frame = { x: 0, y: 0, w, h };
  const tall = isTall(size);
  const items: Item[] = [];
  let lumAt: (r: Rect) => number = () => 30;
  let rgbFor: (ink: string) => string = (ink) => tint('#2a2a2a', ink);
  let keep: Rect[] = [];
  let zone: Zone = 'bottom';
  let accent = '#ffffff';
  if (mat.kind === 'photo') {
    const comp = composePhoto(w, h, mat, {
      cx: w * mat.focus.x,
      focusY: mat.zone === 'top' ? 0.62 : mat.zone === 'bottom' ? 0.4 : 0.5,
    });
    keep = comp.keep;
    items.push({
      kind: 'photo',
      key: 'photo',
      layer: 'base',
      clip: frame,
      img: comp.img,
      src: mat.src,
      feather: comp.feather,
      backdrop: comp.backdrop,
    });
    lumAt = (r) => areaLum(r, comp.img, mat);
    rgbFor = (ink) => tint(mat.avg, ink);
    zone = mat.zone ?? 'bottom';
    accent = mat.accent;
  } else {
    items.push({ kind: 'artBg', key: 'bg', clip: frame, id: mat.id });
  }
  if (tall && (zone === 'left' || zone === 'right')) zone = 'bottom';
  const sideW = tall ? 0.5 : 0.46;

  const colFor = (z: Zone): Rect => {
    if (z === 'top')
      return {
        x: c.m,
        y: c.m,
        w: tall ? w - 2 * c.m : Math.round(w * 0.7),
        h: Math.round(h * 0.48) - c.m,
      };
    if (z === 'bottom')
      return {
        x: c.m,
        y: Math.round(h * 0.46),
        w: tall ? w - 2 * c.m : Math.round(w * 0.7),
        h: Math.round(h * 0.54) - c.m,
      };
    if (z === 'left') return { x: c.m, y: c.m, w: Math.round(w * sideW), h: h - 2 * c.m };
    if (z === 'right')
      return {
        x: w - c.m - Math.round(w * sideW),
        y: c.m,
        w: Math.round(w * sideW),
        h: h - 2 * c.m,
      };
    return {
      x: c.m + Math.round(w * 0.08),
      y: c.m,
      w: w - 2 * c.m - Math.round(w * 0.16),
      h: h - 2 * c.m,
    };
  };
  // A zone that would cross the landscape's subject gives way to the opposite one.
  const opposite: Record<Zone, Zone> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
    center: 'top',
  };
  const clash = (r: Rect) => keep.some((k) => intersects(k, r, 8));
  // Tall frames try the side columns last (narrower, but better than crossing the subject).
  const order: Zone[] = [
    zone,
    opposite[zone],
    ...((tall ? ['top', 'bottom', 'left', 'right'] : ['left', 'right', 'top', 'bottom']) as Zone[]),
  ];
  zone = order.find((z) => !clash(colFor(z))) ?? zone;
  const col = colFor(zone);
  const align: TextItem['align'] =
    zone === 'center' ? 'center' : zone === 'right' ? 'right' : 'left';

  const kicker = ctx.input.category?.trim();
  const byText = [
    ctx.input.author?.trim(),
    handleTag(ctx.input.handle),
    `${ctx.date.getFullYear()}.${String(ctx.date.getMonth() + 1).padStart(2, '0')}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  const byH = Math.ceil(c.by * 1.4) + Math.round(c.by * 1.1);
  const kH = kicker ? Math.ceil(c.kicker * 1.25) + Math.round(c.kicker * 0.7) : 0;
  const lh = 1.16;
  const stack = (title: TextItem): Item[] => {
    const out: Item[] = [];
    let y = 0;
    if (kicker) {
      out.push(
        line(
          ctx,
          'kicker',
          kicker.toUpperCase(),
          'cond',
          c.kicker,
          { x: col.x, y, w: col.w },
          LIGHT,
          align,
          { tracking: 0.24, lh: 1.25 },
        ),
      );
      y += kH;
    }
    title.rect = { ...title.rect, y };
    out.push(title);
    y += title.rect.h + Math.round(c.by * 1.1);
    out.push(
      line(ctx, 'byline', byText, 'sansBold', c.by, { x: col.x, y, w: col.w }, LIGHT, align, {
        tracking: 0.04,
      }),
    );
    const total = stackHeight(out);
    shiftItems(
      out,
      zone === 'bottom'
        ? col.y + col.h - total
        : zone === 'top'
          ? col.y
          : col.y + Math.max(0, (col.h - total) / 2),
    );
    return out;
  };
  // One line first: a short title may run across the sky / water beyond the column, keeping clear of the subject
  // unless the scrim keeps it legible there.
  const ink0 = inkFor(lumAt(col));
  const ext: LineExt = {
    limit: [c.m, w - c.m],
    hard: [],
    soft: keep,
    softOk: (r) => contrastOk(lumAt(r), ink0, (ink0 === LIGHT ? 0.55 : 0.5) * 0.6),
    gap: 24,
  };
  const one = tryOneLine(ctx, 'coverSerif', c.title, lh, align, col, ext, stack, { color: LIGHT });
  const text: Item[] = one
    ? one.items
    : stack(
        block(
          ctx,
          'title',
          ctx.input.title,
          'coverSerif',
          { x: col.x, y: 0, w: col.w, h: Math.max(col.h - kH - byH, c.title.min * lh) },
          c.title,
          lh,
          LIGHT,
          align,
          3,
        ),
      );

  // Ink from what is really under the text; the scrim leans into the photo's own tone.
  const t0 = Math.min(...text.map((i) => ('rect' in i ? i.rect.y : h)));
  const t1 = Math.max(...text.map((i) => ('rect' in i ? i.rect.y + i.rect.h : 0)));
  const ink = inkFor(lumAt({ x: col.x, y: t0, w: col.w, h: t1 - t0 }));
  const sh = shadowFor(ink);
  for (const it of text)
    if (it.kind === 'text')
      Object.assign(it, { color: it.key === 'kicker' ? accentOn(accent, ink) : ink, shadow: sh });
  const rgb = rgbFor(ink);
  const strength = ink === LIGHT ? 0.55 : 0.5;
  const tr0 = titleOf(text)!.rect;
  if (zone === 'top')
    items.push(scrim('scrim', { x: 0, y: 0, w, h: t1 + 140 }, 'to bottom', rgb, strength));
  else if (zone === 'bottom')
    items.push(scrim('scrim', { x: 0, y: t0 - 160, w, h: h - t0 + 160 }, 'to top', rgb, strength));
  else if (zone === 'left')
    items.push(
      scrim(
        'scrim',
        { x: 0, y: 0, w: Math.max(col.x + col.w, tr0.x + tr0.w) + 160, h },
        'to right',
        rgb,
        strength,
      ),
    );
  else if (zone === 'right')
    items.push(
      scrim(
        'scrim',
        { x: Math.min(col.x, tr0.x) - 160, y: 0, w: w - Math.min(col.x, tr0.x) + 160, h },
        'to left',
        rgb,
        strength,
      ),
    );
  else
    items.push(
      pool(
        'pool',
        { x: Math.min(col.x, tr0.x), y: t0, w: Math.max(col.w, tr0.w), h: t1 - t0 },
        rgb,
        strength,
      ),
    );
  // A short hairline above the kicker anchors the block.
  const ruleW = 44;
  const tr = titleOf(text)!.rect;
  const ruleX =
    align === 'center'
      ? tr.x + (tr.w - ruleW) / 2
      : align === 'right'
        ? col.x + col.w - ruleW
        : col.x;
  items.push({
    kind: 'fill',
    key: 'rule',
    rect: { x: ruleX, y: t0 - 14, w: ruleW, h: 2 },
    background: ink === LIGHT ? 'rgba(255,255,255,0.85)' : 'rgba(22,18,28,0.8)',
  });
  items.push(...text);
  return { items, faces: [], keep };
}

/* ---------------------------------------------------------------------- geo */

const GEO = {
  card: {
    m: 48,
    capTop: 30,
    maxCap: 28,
    date: 15,
    tag: 15,
    title: { min: 36, max: 64 },
    deck: 19,
    by: 14,
    scale: 150,
  },
  og: {
    m: 44,
    capTop: 26,
    maxCap: 26,
    date: 14,
    tag: 14,
    title: { min: 32, max: 56 },
    deck: 17,
    by: 13,
    scale: 140,
  },
  wide: {
    m: 34,
    capTop: 20,
    maxCap: 21,
    date: 12,
    tag: 12,
    title: { min: 26, max: 44 },
    deck: 14,
    by: 11,
    scale: 120,
  },
  square: {
    m: 64,
    capTop: 48,
    maxCap: 36,
    date: 19,
    tag: 19,
    title: { min: 44, max: 78 },
    deck: 24,
    by: 18,
    scale: 180,
  },
  portrait: {
    m: 72,
    capTop: 56,
    maxCap: 40,
    date: 22,
    tag: 21,
    title: { min: 50, max: 88 },
    deck: 27,
    by: 20,
    scale: 200,
  },
} as const;

export type GeoPaletteKey = 'moss' | 'stone' | 'sand';

export interface GeoPalette {
  key: GeoPaletteKey;
  /** Band colour (hex) and its rgb triplet for gradients. */
  band: string;
  rgb: string;
  /** Title ink on the band, the quieter ink for the deck / byline, and the accent for rules and the scale bar. */
  ink: string;
  muted: string;
  accent: string;
}

/** 地理志 colourways: 深墨绿 / 岩石灰 / 暖沙色 — the band, its inks and the accent. */
export const GEO_PALETTES: Record<GeoPaletteKey, GeoPalette> = {
  moss: {
    key: 'moss',
    band: '#1d3a31',
    rgb: '29,58,49',
    ink: '#f2efe6',
    muted: 'rgba(242,239,230,0.74)',
    accent: '#cdbb87',
  },
  stone: {
    key: 'stone',
    band: '#3f444a',
    rgb: '63,68,74',
    ink: '#f3f1ec',
    muted: 'rgba(243,241,236,0.74)',
    accent: '#d9c8a4',
  },
  sand: {
    key: 'sand',
    band: '#d9c6a3',
    rgb: '217,198,163',
    ink: '#2b241c',
    muted: 'rgba(43,36,28,0.74)',
    accent: '#6d4f2e',
  },
};

function hexHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return [hue, sat, l];
}

/** Which colourway a picture gets: greens and teals → 深墨绿, warm light → 暖沙色, cold / dim / grey → 岩石灰. */
export function geoPalette(m: Material): GeoPalette {
  if (m.kind === 'art') {
    const [hue, sat] = hexHsl(m.tone);
    return GEO_PALETTES[sat < 0.15 ? 'stone' : hue >= 70 && hue < 200 ? 'moss' : 'stone'];
  }
  if (m.family === 'green' || m.family === 'teal') return GEO_PALETTES.moss;
  if (m.family === 'warm' || m.family === 'gold') return GEO_PALETTES.sand;
  if (m.family === 'night' || m.family === 'blue' || m.family === 'mono') return GEO_PALETTES.stone;
  const [hue, sat, l] = hexHsl(m.avg);
  if (sat < 0.12) return GEO_PALETTES.stone;
  if (hue >= 70 && hue < 200) return GEO_PALETTES.moss;
  // Warm hues: sand when the picture itself is light enough to carry a pale band, else the grey.
  if ((hue < 70 || hue >= 300) && l >= 0.3) return GEO_PALETTES.sand;
  return GEO_PALETTES.stone;
}

function geoDateline(date: Date, issue?: number): string {
  const ym = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  return issue && issue > 0 ? `第 ${issue} 期  ·  ${ym}` : ym;
}

/**
 * 地理志: a full-bleed landscape with the masthead centred at the top, 「期号 · 日期」 under it, a place tag
 * (name and lat/long, when the title or summary names one) in the top-left corner, and an information band
 * along the bottom — a short rule, the title, one deck line, a byline and a map scale bar at the right. The
 * band is the colourway's colour fading into the photo at its top edge; no masthead font is bundled for it:
 * everything is the system stack.
 */
function geo(ctx: Ctx, mat: Material, v: Variant): { items: Item[]; faces: Rect[]; keep: Rect[] } {
  const { w, h, size } = ctx;
  const c = GEO[size];
  const frame = { x: 0, y: 0, w, h };
  const tall = isTall(size);
  const pal = geoPalette(mat);
  const items: Item[] = [];

  /* Top: masthead, dateline, place tag. */
  const mastW = Math.round(w * 0.6);
  const mast = masthead(
    ctx,
    'geoMast',
    Math.round((w - mastW) / 2),
    c.capTop,
    mastW,
    c.maxCap,
    LIGHT,
    0.32,
  );
  const dateText = geoDateline(ctx.date, ctx.input.issue);
  const dateTracking = 0.16;
  const dateW = Math.ceil(widthWith(ctx.measure('geoLabel'), dateTracking)(dateText, c.date)) + 4;
  const dateItem = line(
    ctx,
    'dateline',
    dateText,
    'geoLabel',
    c.date,
    {
      x: Math.round((w - dateW) / 2),
      y: mast.rect.y + mast.rect.h + Math.round(c.date * 0.75),
      w: dateW,
    },
    LIGHT,
    'center',
    { tracking: dateTracking, lh: 1.3 },
  );
  const topBottom = dateItem.rect.y + dateItem.rect.h;
  const tagText = placeLabel(placeFrom(ctx.input.title, ctx.input.summary));
  const tagItems: Item[] = [];
  if (tagText) {
    const tag = line(
      ctx,
      'place',
      `◎ ${tagText}`,
      'geoLabel',
      c.tag,
      { x: c.m, y: c.capTop - Math.round(c.tag * 0.25), w: Math.round(w * 0.3) },
      LIGHT,
      'left',
      { tracking: 0.08, lh: 1.3 },
    );
    const tw = Math.ceil(widthWith(ctx.measure('geoLabel'), 0.08)(tag.lines[0], c.tag)) + 2;
    tag.rect = { ...tag.rect, w: Math.min(tag.rect.w, tw) };
    // A masthead long enough to reach the corner wins; the corner is then simply left empty.
    if (!intersects(tag.rect, mast.rect, 16)) tagItems.push(tag);
  }

  /* Bottom band: rule · title · deck · (byline | scale bar). Heights first, so the band's top is known
   * before the photo is placed. */
  const titleW = w - 2 * c.m;
  const padTop = Math.round(c.title.max * 0.5);
  const padBottom = Math.round(c.title.max * 0.42);
  const ruleH = 2;
  const ruleGap = Math.round(c.title.min * 0.42);
  const deck = deckFrom(ctx.input.summary, ctx.input.title);
  const deckH = deck ? Math.ceil(c.deck * 1.4) : 0;
  const deckGap = deck ? Math.round(c.deck * 0.75) : 0;
  const byText = [
    ctx.input.author?.trim() ? `文 / ${ctx.input.author!.trim()}` : '',
    ctx.input.category?.trim(),
  ]
    .filter(Boolean)
    .join('  ·  ');
  const rowGap = Math.round(c.by * 1.3);
  const rowH = Math.max(Math.ceil(c.by * 1.3), Math.round(c.by * 1.7));
  const lh = 1.18;
  const fixed = padTop + ruleH + ruleGap + deckGap + deckH + rowGap + rowH + padBottom;
  const titleRoom = Math.max(Math.round(h * (tall ? 0.4 : 0.46)) - fixed, c.title.min * lh);
  const title = block(
    ctx,
    'title',
    ctx.input.title,
    'geoSerif',
    { x: c.m, y: 0, w: titleW, h: titleRoom },
    c.title,
    lh,
    pal.ink,
    'left',
    tall ? 3 : 2,
  );
  const bandH = fixed + title.rect.h;
  const bandTop = h - bandH;
  const fade = Math.round(c.title.max * 0.9);

  /* The picture: cover the frame, choosing the vertical focus that keeps the landscape's subject out of the
   * band and the masthead block. */
  let lumAt: (r: Rect) => number = () => 30;
  let rgbFor: (ink: string) => string = (ink) => tint('#2a2a2a', ink);
  let keep: Rect[] = [];
  if (mat.kind === 'photo') {
    const band = { x: 0, y: bandTop, w, h: bandH };
    const head = { x: 0, y: 0, w, h: topBottom + 24 };
    const covered = (r: Rect, zone: Rect) => {
      const x0 = Math.max(r.x, zone.x);
      const y0 = Math.max(r.y, zone.y);
      const x1 = Math.min(r.x + r.w, zone.x + zone.w);
      const y1 = Math.min(r.y + r.h, zone.y + zone.h);
      return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    };
    const base = mat.zone === 'bottom' ? 0.38 : mat.zone === 'top' ? 0.52 : 0.45;
    let best: Composition | null = null;
    let bestScore = Infinity;
    for (const fy of [base, 0.42, 0.36, 0.5, 0.3, 0.58]) {
      const comp = composePhoto(w, h, mat, { cx: w * mat.focus.x, focusY: fy });
      const score = comp.keep.reduce((s, k) => s + covered(k, band) + covered(k, head) * 0.5, 0);
      if (score < bestScore - 0.5) {
        best = comp;
        bestScore = score;
      }
    }
    const comp = best!;
    keep = comp.keep;
    items.push({
      kind: 'photo',
      key: 'photo',
      layer: 'base',
      clip: frame,
      img: comp.img,
      src: mat.src,
      feather: comp.feather,
      backdrop: comp.backdrop,
    });
    lumAt = (r) => areaLum(r, comp.img, mat);
    rgbFor = (ink) => tint(mat.avg, ink);
  } else {
    items.push({ kind: 'artBg', key: 'bg', clip: frame, id: mat.id });
  }

  /* Inks over the picture at the top; the soft scrim behind them in the photo's own tone. */
  const topInk = inkFor(lumAt({ x: 0, y: 0, w, h: topBottom + 20 }));
  const topShadow = shadowFor(topInk);
  mast.color = topInk;
  mast.shadow = topShadow;
  dateItem.color = topInk;
  dateItem.shadow = topShadow;
  for (const t of tagItems)
    if (t.kind === 'text') Object.assign(t, { color: topInk, shadow: topShadow });
  items.push(
    scrim(
      'scrimTop',
      { x: 0, y: 0, w, h: topBottom + Math.round(h * 0.12) },
      'to bottom',
      rgbFor(topInk),
      topInk === LIGHT ? 0.34 : 0.3,
    ),
  );

  /* The band, then its contents. */
  items.push({
    kind: 'fill',
    key: 'band',
    rect: { x: 0, y: bandTop - fade, w, h: bandH + fade },
    background: `linear-gradient(to bottom, rgba(${pal.rgb},0) 0%, rgba(${pal.rgb},0.6) ${Math.round((fade / (bandH + fade)) * 60)}%, rgba(${pal.rgb},0.94) ${Math.round((fade / (bandH + fade)) * 100) + 4}%, rgba(${pal.rgb},0.96) 100%)`,
  });
  let y = bandTop + padTop;
  items.push({
    kind: 'fill',
    key: 'rule',
    rect: { x: c.m, y, w: 44, h: ruleH },
    background: pal.accent,
  });
  y += ruleH + ruleGap;
  title.rect = { ...title.rect, y };
  items.push(mast, dateItem, ...tagItems, title);
  y += title.rect.h;
  if (deck) {
    y += deckGap;
    items.push(
      line(ctx, 'deck', deck, 'sans', c.deck, { x: c.m, y, w: titleW }, pal.muted, 'left', {
        lh: 1.4,
      }),
    );
    y += deckH;
  }
  y += rowGap;
  const scaleW = c.scale;
  const scaleH = rowH;
  const scaleX = w - c.m - scaleW;
  if (byText) {
    const byW = scaleX - 24 - c.m;
    const by = line(
      ctx,
      'byline',
      byText,
      'geoLabel',
      c.by,
      { x: c.m, y: y + Math.round((rowH - Math.ceil(c.by * 1.3)) / 2), w: byW },
      pal.muted,
      'left',
      {
        tracking: 0.06,
      },
    );
    const bw = Math.ceil(widthWith(ctx.measure('geoLabel'), 0.06)(by.lines[0], c.by)) + 2;
    by.rect = { ...by.rect, w: Math.min(byW, bw) };
    items.push(by);
  }
  const km = [20, 50, 100][v.style % 3];
  items.push({
    kind: 'scalebar',
    key: 'scalebar',
    rect: { x: scaleX, y, w: scaleW, h: scaleH },
    color: pal.accent,
    label: `${km} km`,
  });
  return { items, faces: [], keep };
}

/* ------------------------------------------------------------------- entry */

export function layoutMagazine(
  template: TemplateKey,
  input: MagazineInput,
  size: MagSize,
  measure: MeasureFor,
  material?: Material,
): MagazineLayout {
  const { w, h } = MAG_DIMENSIONS[size];
  const round = input.round ?? 0;
  const mat = material ?? pickMaterial(template, input.seed, round);
  const variant = pickVariant(template, input.seed, round);
  const ctx: Ctx = { input, w, h, size, measure, date: input.date ?? new Date() };
  let out: { items: Item[]; faces: Rect[]; keep: Rect[] };
  if (template === 'fashion')
    out =
      mat.kind === 'photo'
        ? fashionPhoto(ctx, mat, variant)
        : { items: fashionArt(ctx, mat, variant), faces: [], keep: [] };
  else if (template === 'journal') out = journal(ctx, mat, variant);
  else if (template === 'scenic') out = scenic(ctx, mat);
  else if (template === 'geo') out = geo(ctx, mat, variant);
  else out = xhs(ctx, mat, variant);
  return {
    template,
    size,
    w,
    h,
    material: mat,
    variant,
    items: out.items,
    faces: out.faces,
    keep: out.keep,
  };
}
