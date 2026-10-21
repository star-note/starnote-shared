import {
  formatWatermarkDate,
  QR_QUIET,
  type WatermarkImage,
  watermarkHandle,
  watermarkLayout,
  watermarkMeta,
  type WatermarkMetrics,
  type WatermarkPlan,
} from './layout';
import { LOCKUP, MARK } from '../brand/paths.gen';

/**
 * Paints the watermark planned by `watermarkPlan` on any 2D context — a browser canvas or a Node canvas
 * (`@napi-rs/canvas`, `skia-canvas`): only standard 2D calls, letter spacing done by hand, the mark through `Path2D`
 * when there is one (a dot otherwise).
 */

/** System sans (BRAND.md). */
export const WATERMARK_FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

export type WatermarkTone = 'light' | 'dark';

export interface WatermarkContent {
  /** Author handle (with or without @). */
  handle?: string | null;
  /** Defaults to today. */
  date?: Date | string | number;
  /** The optional item on the right (a title or a column); cut to 12 characters. */
  meta?: string | null;
  /** Text line wording: the 辰记 lockup or 「Shot on」 + the StarNote lockup. */
  lang?: 'zh' | 'en';
}

export interface DrawWatermarkOptions extends WatermarkContent {
  plan: WatermarkPlan;
  /** Ground under the strip: `light` = dark type. Default: measured from the picture (inset) / white (frame). */
  tone?: WatermarkTone | 'auto';
  /**
   * The text line at a fixed spot in a designed footer (cards): no scrim, the card's own ink. `right` = where the
   * line ends (or its centre with `align: 'center'`), `baseline` = its vertical centre.
   */
  place?: { x: number; y: number; ink: string; align?: 'right' | 'center' };
  /** `frame`: paint the band this tall (a caller that keeps a fixed canvas fills it to the edge). */
  band?: number;
  fontFamily?: string;
}

/** What a renderer needs to watermark a picture: the plan and the words. */
export type WatermarkSpec = WatermarkContent & {
  plan: WatermarkPlan;
  tone?: WatermarkTone | 'auto';
};

type Ctx = CanvasRenderingContext2D;

interface Palette {
  ground: string;
  ink: string;
  sub: string;
  rule: string;
  mark: string;
  scrim: [number, number, number];
  scrimAlpha: number;
}

const PALETTES: Record<WatermarkTone, Palette> = {
  // light ground: near-black type, brand purple mark
  light: {
    ground: '#ffffff',
    ink: '#151515',
    sub: 'rgba(21,21,21,0.62)',
    rule: 'rgba(21,21,21,0.26)',
    mark: '#6918b4',
    scrim: [255, 255, 255],
    scrimAlpha: 0.62,
  },
  // dark ground: white type, the lifted violet of the dark logo
  dark: {
    ground: '#0e0e10',
    ink: '#ffffff',
    sub: 'rgba(255,255,255,0.74)',
    rule: 'rgba(255,255,255,0.4)',
    mark: '#b88cff',
    scrim: [0, 0, 0],
    scrimAlpha: 0.5,
  },
};

/* ------------------------------------------------------------------ tone */

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Mean relative luminance of a region (null when the canvas cannot be read, e.g. tainted). */
export function regionLuminance(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
): number | null {
  try {
    const t = ctx.getTransform?.();
    const k = t ? Math.hypot(t.a, t.b) : 1;
    const X = Math.max(0, Math.floor((t?.e ?? 0) + x * k));
    const Y = Math.max(0, Math.floor((t?.f ?? 0) + y * k));
    const W = Math.max(1, Math.min(ctx.canvas.width - X, Math.ceil(w * k)));
    const H = Math.max(1, Math.min(ctx.canvas.height - Y, Math.ceil(h * k)));
    if (W <= 0 || H <= 0) return null;
    const data = ctx.getImageData(X, Y, W, H).data;
    const step = Math.max(4, Math.floor(data.length / 4 / 4000)) * 4;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3]! < 8) continue;
      sum += 0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!);
      n++;
    }
    return n ? sum / n : null;
  } catch {
    return null;
  }
}

/** Mean luminance under which a frame turns black. */
export const DARK_PICTURE = 0.1;

/** Light ground when the strip area is bright (luminance ≥ 0.42 ≈ L* 71). */
export const toneOf = (lum: number | null, fallback: WatermarkTone): WatermarkTone =>
  lum === null ? fallback : lum >= 0.42 ? 'light' : 'dark';

/* ------------------------------------------------------------------ text helpers */

function setFont(ctx: Ctx, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size.toFixed(2)}px ${family}`;
}

/** Width of `text` with `track` px between letters. */
function trackedWidth(ctx: Ctx, text: string, track: number): number {
  const chars = Array.from(text);
  if (!track) return ctx.measureText(text).width;
  return (
    chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + track * Math.max(0, chars.length - 1)
  );
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * The alphabetic baseline that puts a run's letters optically on `cy`: the centre of a capital (or, for Chinese, of
 * a full-width character) — not the em box `textBaseline: 'middle'` centres, which sits Latin capitals and CJK
 * glyphs at different heights next to the mark. Descenders (j, g, @) hang below as in any set line.
 */
export function baselineFor(ctx: Ctx, text: string, cy: number): number {
  // ascent/descent are measured from the *current* textBaseline, so measure against the one we draw with
  const prev = ctx.textBaseline;
  ctx.textBaseline = 'alphabetic';
  const ref = ctx.measureText(CJK.test(text) ? '辰' : 'H');
  ctx.textBaseline = prev;
  const asc = ref.actualBoundingBoxAscent;
  const desc = ref.actualBoundingBoxDescent;
  if (typeof asc !== 'number' || typeof desc !== 'number' || !(asc + desc > 0)) return cy;
  return cy + (asc - desc) / 2;
}

function drawTracked(ctx: Ctx, text: string, x: number, y: number, track: number) {
  const prev = ctx.textBaseline;
  const by = baselineFor(ctx, text, y);
  if (by !== y) ctx.textBaseline = 'alphabetic';
  if (!track) {
    ctx.fillText(text, x, by);
  } else {
    let cx = x;
    for (const c of Array.from(text)) {
      ctx.fillText(c, cx, by);
      cx += ctx.measureText(c).width + track;
    }
  }
  ctx.textBaseline = prev;
}

/** Ink box of absolute path data (every coordinate pair; the mark's curves are dense enough for that). */
function pathYs(d: string): { lo: number; hi: number } {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < n.length; i += 2) {
    lo = Math.min(lo, n[i]!);
    hi = Math.max(hi, n[i]!);
  }
  return { lo, hi };
}

/** Centre of the mark's C in its 100-unit space — the line the official lockups set their words on. */
const BODY = pathYs(MARK.body);
export const MARK_BODY_MID = (BODY.lo + BODY.hi) / 2;
/** The small cut's crop width: `markPx` is the drawn width of that crop, as it was for the bare mark. */
const SMALL_W = Number(MARK.small.viewBox.split(/\s+/)[2]);
/** Lockup padding around the ink (scripts/brand/compose.mjs `layoutLockup`). */
const LOCKUP_PAD = 6;
/** Mark size of the brand item against `metrics.mark` (the bare mark's size). */
const LOCKUP_SCALE = 1.15;

type LockupLang = keyof typeof LOCKUP;

/**
 * The official lockup (mark + lettered 辰记 / StarNote, outlines from paths.gen — the same shapes as the header,
 * the blog and the icons), its C centred on `cy`. Returns the drawn width; without Path2D, a dot and set type.
 */
export function lockupWidth(lang: LockupLang, markPx: number): number {
  return (LOCKUP[lang].plain.w - LOCKUP_PAD * 2) * (markPx / SMALL_W);
}

function drawLockup(
  ctx: Ctx,
  lang: LockupLang,
  x: number,
  cy: number,
  markPx: number,
  pal: { mark: string; ink: string },
) {
  const L = LOCKUP[lang].plain;
  const k = markPx / SMALL_W;
  ctx.save();
  if (typeof Path2D === 'function') {
    ctx.translate(x - LOCKUP_PAD * k, cy - (L.ty + MARK_BODY_MID) * k);
    ctx.scale(k, k);
    ctx.fillStyle = pal.ink;
    ctx.fill(new Path2D(L.word));
    ctx.fillStyle = pal.mark;
    if (L.accent) ctx.fill(new Path2D(L.accent));
    ctx.translate(L.tx, L.ty);
    ctx.fill(new Path2D(MARK.small.body));
    ctx.fill(new Path2D(MARK.small.pen), 'evenodd');
  } else {
    ctx.fillStyle = pal.mark;
    ctx.beginPath();
    ctx.arc(x + markPx / 2, cy, markPx * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    drawTracked(ctx, lang === 'en' ? 'StarNote' : '辰记', x + markPx * 1.3, cy, 0);
  }
  ctx.restore();
}

function hairline(ctx: Ctx, x: number, cy: number, h: number, w: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - w / 2), Math.round(cy - h / 2), w, Math.round(h));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ pieces */

/** An item of a line: something measured and then drawn at x. */
interface Item {
  w: number;
  draw(x: number): void;
  /** Dropped first when the line is too long (higher = sooner). */
  drop?: number;
}

function layoutLine(items: (Item | null)[], gap: number, rule: (x: number) => void, ruleW: number) {
  const list = items.filter((i): i is Item => Boolean(i));
  const width = (l: Item[]) =>
    l.reduce((s, i) => s + i.w, 0) + Math.max(0, l.length - 1) * (gap * 2 + ruleW);
  return {
    list,
    width: () => width(list),
    /** Drops the most expendable item; false when nothing more can go. */
    shrink(): boolean {
      let at = -1;
      list.forEach((it, i) => {
        if ((it.drop ?? 0) > 0 && (at < 0 || (it.drop ?? 0) > (list[at]!.drop ?? 0))) at = i;
      });
      if (at < 0) return false;
      list.splice(at, 1);
      return true;
    },
    draw(x: number) {
      let cx = x;
      list.forEach((it, i) => {
        if (i) {
          rule(cx + gap);
          cx += gap * 2 + ruleW;
        }
        it.draw(cx);
        cx += it.w;
      });
    },
  };
}

function brandItem(
  ctx: Ctx,
  m: WatermarkMetrics,
  cy: number,
  pal: Palette,
  family: string,
  words: 'zh' | 'en' | 'shot',
): Item {
  const lang: LockupLang = words === 'zh' ? 'zh-CN' : 'en';
  // the lockup keeps its own proportions (word ≈ 0.4 of the mark); this size sets its word level with the line's text
  const markPx = m.mark * LOCKUP_SCALE;
  let lead = 0;
  if (words === 'shot') {
    setFont(ctx, 300, m.font, family);
    lead = ctx.measureText('Shot on ').width;
  }
  return {
    w: lead + lockupWidth(lang, markPx),
    draw(x) {
      if (lead) {
        ctx.fillStyle = pal.ink;
        setFont(ctx, 300, m.font, family);
        drawTracked(ctx, 'Shot on ', x, cy, 0);
      }
      drawLockup(ctx, lang, x + lead, cy, markPx, pal);
    },
  };
}

function textItem(
  ctx: Ctx,
  text: string,
  size: number,
  weight: number,
  color: string,
  family: string,
  cy: number,
  track = 0,
  drop = 0,
): Item | null {
  if (!text) return null;
  setFont(ctx, weight, size, family);
  const w = trackedWidth(ctx, text, track);
  return {
    w,
    drop,
    draw(x) {
      setFont(ctx, weight, size, family);
      ctx.fillStyle = color;
      drawTracked(ctx, text, x, cy, track);
    },
  };
}

/** Under the code on a dark ground: near-white with a touch of the brand's warm grey, almost opaque. */
export const QR_PLATE_ON_DARK = 'rgba(244,241,236,0.96)';
/** The code's dark modules, on every ground (scanners such as WeChat read inverted codes unreliably). */
export const QR_INK = '#151515';

function drawQr(ctx: Ctx, m: WatermarkMetrics, x: number, y: number, pal: Palette) {
  const code = m.code;
  if (!code) return;
  const s = m.qr;
  const r = m.module * 0.9;
  // the plate holds the quiet zone and is always light, so the code is dark-on-light everywhere; on a light
  // ground it is the ground colour with a hairline edge, on a dark ground a small warm-white tile
  const dark = pal === PALETTES.dark;
  ctx.fillStyle = dark ? QR_PLATE_ON_DARK : pal.ground;
  roundRect(ctx, x, y, s, s, r);
  ctx.fill();
  if (!dark) {
    ctx.strokeStyle = pal.rule;
    ctx.lineWidth = m.hair;
    roundRect(ctx, x + m.hair / 2, y + m.hair / 2, s - m.hair, s - m.hair, r);
    ctx.stroke();
  }
  // modules on whole pixels
  ctx.fillStyle = QR_INK;
  const q = QR_QUIET * m.module;
  const x0 = Math.round(x + q);
  const y0 = Math.round(y + q);
  for (let row = 0; row < code.size; row++)
    for (let c = 0; c < code.size; c++)
      if (code.modules[row]![c])
        ctx.fillRect(x0 + c * m.module, y0 + row * m.module, m.module, m.module);
}

/* ------------------------------------------------------------------ main */

/**
 * Draws the watermark for a picture of `size` already painted at (0, 0). `inset` paints over its bottom edge;
 * `frame` paints the band below it (y = size.h … size.h + band), so the canvas must be `watermarkLayout().out`
 * tall. Returns the metrics used. A plan that is not `enabled` draws nothing.
 */
export function drawWatermark(
  ctx: Ctx,
  size: WatermarkImage,
  opts: DrawWatermarkOptions,
): WatermarkMetrics {
  const { plan } = opts;
  const m = watermarkLayout(size, plan);
  if (!plan.enabled) return m;
  const family = opts.fontFamily ?? WATERMARK_FONT;
  const date = formatWatermarkDate(opts.date ?? new Date());
  const handle = watermarkHandle(opts.handle);
  const lang = opts.lang ?? 'zh';
  const band = plan.layout === 'frame' ? Math.max(m.band, opts.band ?? 0) : 0;
  const midY = plan.layout === 'frame' ? size.h + band / 2 : m.midY;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // the designed footer of a card: the text line only, in the card's ink
  if (opts.place && plan.variant === 'text' && plan.layout === 'inset') {
    const ink = opts.place.ink;
    const pal: Palette = { ...PALETTES.light, ink, sub: ink, rule: ink, mark: ink };
    ctx.globalAlpha = 0.78;
    const line = textLine(ctx, m, opts.place.y, pal, family, handle, date, lang);
    const avail = opts.place.align === 'center' ? size.w - m.margin * 2 : opts.place.x - m.margin;
    while (line.width() > avail && line.shrink());
    const w = line.width();
    line.draw(opts.place.align === 'center' ? opts.place.x - w / 2 : opts.place.x - w);
    ctx.restore();
    return m;
  }

  // ground
  let tone: WatermarkTone;
  if (opts.tone && opts.tone !== 'auto') tone = opts.tone;
  else if (plan.layout === 'frame') {
    // a print border is white; it turns black only under a clearly dark picture
    const l = regionLuminance(ctx, 0, 0, size.w, size.h);
    tone = l !== null && l < DARK_PICTURE ? 'dark' : 'light';
  } else tone = toneOf(regionLuminance(ctx, 0, size.h - m.scrim, size.w, m.scrim), 'dark');
  const pal = PALETTES[tone];

  if (plan.layout === 'frame') {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, size.h, size.w, band);
    // a hairline where the picture ends, only when picture and border are close in tone
    ctx.fillStyle = tone === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, size.h, size.w, m.hair);
  } else {
    const [r, g, b] = pal.scrim;
    const top = size.h - m.scrim;
    const grad = ctx.createLinearGradient(0, top, 0, size.h);
    const a = pal.scrimAlpha;
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},${(a * 0.38).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, size.w, m.scrim);
  }

  if (plan.variant === 'text') {
    const line = textLine(ctx, m, midY, pal, family, handle, date, lang);
    while (line.width() > size.w - m.margin * 2 && line.shrink());
    line.draw((size.w - line.width()) / 2);
    ctx.restore();
    return m;
  }

  // camera strip: left = StarNote lockup │ @handle; right = meta │ date [QR]
  const rule = (h: number) => (x: number) =>
    hairline(ctx, x + m.hair / 2, midY, h, m.hair, pal.rule);
  const left = layoutLine(
    [
      brandItem(ctx, m, midY, pal, family, 'en'),
      textItem(ctx, handle, m.font, 400, pal.sub, family, midY, m.font * 0.02, 1),
    ],
    m.gap,
    rule(m.font * 1.05),
    m.hair,
  );
  const qrX = size.w - m.margin - m.qr;
  const qrY = Math.round(midY - m.qr / 2);
  const meta = watermarkMeta(opts.meta);
  const rightEdge = qrX - m.gap * 1.3;
  let rightW: number;
  let drawRight: () => void;
  if (plan.layout === 'frame' && meta) {
    // a print border has room for two lines: the item over the date, a rule before the code
    const l1 = textItem(ctx, meta, m.font, 500, pal.ink, family, midY - m.font * 0.72, 0, 2)!;
    const l2 = textItem(
      ctx,
      date,
      m.font * 0.86,
      400,
      pal.sub,
      family,
      midY + m.font * 0.78,
      m.font * 0.06,
    )!;
    const textEdge = rightEdge - m.gap - m.hair;
    rightW = Math.max(l1.w, l2.w) + m.gap * 1.3 + m.hair;
    drawRight = () => {
      hairline(ctx, rightEdge - m.hair / 2, midY, m.qr * 0.62, m.hair, pal.rule);
      l1.draw(textEdge - l1.w - m.gap * 0.3);
      l2.draw(textEdge - l2.w - m.gap * 0.3);
    };
    const room = qrX - m.margin - left.width() - m.gap * 3;
    if (rightW > room) {
      // too long for the border: one line, date only
      const d = textItem(ctx, date, m.font, 400, pal.sub, family, midY, m.font * 0.06)!;
      rightW = d.w;
      drawRight = () => d.draw(rightEdge - d.w);
    }
  } else {
    const right = layoutLine(
      [
        textItem(ctx, meta, m.font, 500, pal.ink, family, midY, 0, 2),
        textItem(ctx, date, m.font, 400, pal.sub, family, midY, m.font * 0.06),
      ],
      m.gap,
      rule(m.font * 1.05),
      m.hair,
    );
    const room = () => qrX - m.gap * 1.3 - m.margin - left.width() - m.gap * 2;
    while (right.width() > room() && right.shrink());
    rightW = right.width();
    drawRight = () => right.draw(rightEdge - right.width());
  }
  while (left.width() + rightW + m.gap * 2 > rightEdge - m.margin && left.shrink());

  left.draw(m.margin);
  drawRight();
  drawQr(ctx, m, qrX, qrY, pal);
  ctx.restore();
  return m;
}

/** 「辰记 │ @handle │ 2026.10.21」 (or 「Shot on StarNote │ …」). */
function textLine(
  ctx: Ctx,
  m: WatermarkMetrics,
  cy: number,
  pal: Palette,
  family: string,
  handle: string,
  date: string,
  lang: 'zh' | 'en',
) {
  return layoutLine(
    [
      brandItem(ctx, m, cy, pal, family, lang === 'en' ? 'shot' : 'zh'),
      textItem(ctx, handle, m.font, 400, pal.sub, family, cy, m.font * 0.04, 2),
      textItem(ctx, date, m.font, 400, pal.sub, family, cy, m.font * 0.08, 1),
    ],
    m.gap,
    (x) => hairline(ctx, x + m.hair / 2, cy, m.font * 0.95, m.hair, pal.rule),
    m.hair,
  );
}

/* ------------------------------------------------------------------ compositing */

/** A decoded picture and its pixel size. */
export interface WatermarkSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The picture with its watermark on a new canvas. `keepSize`: the output stays `width × height` (cards, covers):
 * a frame band is made room for by cover-cropping the picture into the space above it.
 * `createCanvas` lets Node canvases in (default: `document.createElement('canvas')`).
 */
export function watermarkCanvas<
  C extends { width: number; height: number; getContext(type: '2d'): unknown },
>(
  src: WatermarkSource,
  opts: DrawWatermarkOptions & { keepSize?: boolean },
  createCanvas?: (w: number, h: number) => C,
): C {
  const make =
    createCanvas ??
    ((w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c as unknown as C;
    });
  const size = { w: src.width, h: src.height };
  const frame = opts.plan.enabled && opts.plan.layout === 'frame';
  const full = watermarkLayout(size, opts.plan);
  const out = opts.keepSize ? size : full.out;
  const canvas = make(out.w, out.h);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('当前环境不支持 Canvas');
  const area = frame && opts.keepSize ? { w: size.w, h: size.h - full.band } : size;
  if (area.h === size.h) ctx.drawImage(src.source, 0, 0, size.w, size.h);
  else {
    // cover-crop, centred
    const k = Math.max(area.w / size.w, area.h / size.h);
    const sw = area.w / k;
    const sh = area.h / k;
    ctx.drawImage(src.source, (size.w - sw) / 2, (size.h - sh) / 2, sw, sh, 0, 0, area.w, area.h);
  }
  drawWatermark(ctx, area, { ...opts, band: frame ? out.h - area.h : undefined });
  return canvas;
}
