/**
 * Pure front-end cover generator: paints a styled ground, then lays out category, title,
 * author in zones that never overlap. Deterministic per seed; each style has eight distinct looks.
 *
 * Sizes: `og` 1200×630 (share cards / Open Graph) and `card` 1200×800 (3:2 list cards). The
 * text layer keeps to the central 630px band in both, so one image survives 16:9, 3:2 and
 * 1.91:1 crops without losing a word.
 */
import { fitTitle, type Measure } from './fitText';
import { createRng } from './rng';
import { type CoverStyle, COVER_STYLES, VARIANTS } from './styles';
import { drawWatermark, watermarkCanvas, type WatermarkSpec } from '../watermark/draw';

export type { CoverStyle } from './styles';
export { COVER_STYLES } from './styles';

/** `card` 3:2 (main cover) · `og` 1200×630 · `wide` 900×383 (公众号头条) · `square` 1080² · `portrait` 1080×1440. */
export type CoverSize = 'og' | 'card' | 'wide' | 'square' | 'portrait';

export interface CoverOptions {
  title: string;
  author?: string;
  category?: string;
  style?: CoverStyle;
  /** Any string; the same seed + options paint the same image. `noteId:round` lets 换一张 step through looks. */
  seed?: string;
  /** 换一张 round; defaults to the number after `:` in `seed`. */
  variant?: number;
  /** 渐变: the footer line 「博客名 · @handle」. */
  blogName?: string;
  handle?: string;
  size?: CoverSize;
  /** 辰记水印 (`watermarkPlan` + words); a `frame` band keeps the cover's size (the design is cropped to make room). */
  watermark?: WatermarkSpec | null;
}

export const COVER_FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif';

const SIZES: Record<CoverSize, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  card: { w: 1200, h: 800 },
  wide: { w: 900, h: 383 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1440 },
};
/** Every size is painted on a design frame at least 1200×630 and scaled down, so type keeps its proportions. */
const DESIGN = { w: 1200, h: 630 };
const MARGIN = 72;
const TITLE_MIN = 34;
const TITLE_MAX = 72;
const LINE_HEIGHT = 1.22;

export function coverDimensions(size: CoverSize = 'og') {
  return SIZES[size];
}

export function isCoverStyle(s: unknown): s is CoverStyle {
  return typeof s === 'string' && COVER_STYLES.some((c) => c.key === s);
}

const FAMILIES = {
  sans: COVER_FONT,
  serif: '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
  mono: '"SF Mono", Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace',
} as const;

function font(
  ctx: CanvasRenderingContext2D,
  weight: number,
  size: number,
  family: keyof typeof FAMILIES = 'sans',
) {
  ctx.font = `${weight} ${size}px ${FAMILIES[family]}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Which of a style's eight looks a cover gets: 换一张 (`variant` = round) walks a per-note shuffled
 * order, so consecutive covers always land on different looks.
 */
export function lookIndex(style: CoverStyle, seed: string, variant: number | undefined): number {
  const n = VARIANTS[style].length;
  const base = seed.split(':')[0] || seed;
  const order = Array.from({ length: n }, (_, i) => i);
  const rng = createRng(`look|${style}|${base}`);
  // 渐变: the demo's golden palette always opens; the rest follow in a per-note order.
  const first = style === 'gradient' ? 1 : 0;
  for (let i = n - 1; i > first; i--) {
    const j = first + Math.floor(rng.next() * (i + 1 - first));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const round = variant ?? Number(seed.split(':')[1] ?? 0);
  return order[(((Number.isFinite(round) ? round : 0) % n) + n) % n];
}

/** Draws the whole cover onto `ctx` (already sized). */
export function paintCover(ctx: CanvasRenderingContext2D, opts: CoverOptions) {
  const out = SIZES[opts.size ?? 'og'];
  // Wide sizes keep the 630-tall text band; tall sizes (square / 3:4) use an 800-wide frame so the title stays big.
  const tall = out.h >= out.w;
  const k = tall ? out.w / 800 : Math.min(out.w / DESIGN.w, out.h / DESIGN.h, 1);
  ctx.save();
  ctx.scale(k, k);
  try {
    paintDesign(ctx, opts, out.w / k, out.h / k, tall);
  } finally {
    ctx.restore();
  }
}

function paintDesign(
  ctx: CanvasRenderingContext2D,
  opts: CoverOptions,
  w: number,
  h: number,
  tall: boolean,
) {
  const style: CoverStyle = isCoverStyle(opts.style) ? opts.style : 'poster';
  const seed = opts.seed ?? opts.title;
  const look = lookIndex(style, seed, opts.variant);
  const rng = createRng(`${style}|${look}|${seed}`);
  const ground = VARIANTS[style][look](ctx, w, h, rng);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (style === 'gradient') {
    paintDemoText(ctx, opts, w, h, tall);
    return;
  }

  // All text stays inside the OG-height band centred vertically; extra height is ground only.
  const bandTop = Math.max(0, (h - SIZES.og.h) / 2);
  const top = bandTop + MARGIN;
  const bottom = h - bandTop - MARGIN;
  // Tall frames are only 800 wide: the text takes the full width there.
  const [b0, b1] = tall ? [0, 1] : ground.box;
  const left = Math.max(MARGIN, b0 * w + (b0 > 0 ? 24 : 0));
  const right = Math.min(w - MARGIN, b1 * w - (b1 < 1 ? 24 : 0));
  const maxWidth = Math.max(360, right - left);
  const fam = ground.font ?? 'sans';
  const weight = ground.weight ?? 800;
  const centred = Boolean(ground.center);
  const xFor = (tw: number) => (centred ? left + (maxWidth - tw) / 2 : left);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Category: pill, square label, or tracked text.
  let titleTop = top;
  const category = opts.category?.trim();
  if (category) {
    const cs = ground.chipStyle ?? 'pill';
    if (cs === 'text') {
      font(ctx, 700, 20, fam === 'mono' ? 'mono' : 'sans');
      const label = category.split('').join(' ');
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = ground.chipInk ?? ground.sub;
      ctx.fillText(label, xFor(tw), top + 24);
      titleTop = top + 24 + 30;
    } else {
      font(ctx, 600, 22, fam === 'mono' ? 'mono' : 'sans');
      const tw = ctx.measureText(category).width;
      ctx.fillStyle = ground.chip;
      const bw = tw + 28;
      roundRect(ctx, xFor(bw), top, bw, 38, cs === 'pill' ? 19 : 3);
      ctx.fill();
      ctx.fillStyle = ground.chipInk ?? ground.ink;
      ctx.fillText(category, xFor(bw) + 14, top + 26);
      titleTop = top + 38 + 28;
    }
  }

  // Author line along the bottom.
  const footBase = bottom;
  const author = opts.author?.trim();
  let footTop = footBase - 16;
  if (author) {
    font(ctx, 500, 24, fam === 'serif' ? 'serif' : 'sans');
    ctx.fillStyle = ground.sub;
    let name = author;
    while (ctx.measureText(name).width > maxWidth && name.length > 1)
      name = `${name.slice(0, -2)}…`;
    ctx.fillText(name, xFor(ctx.measureText(name).width), footBase);
    footTop = footBase - 24;
  }

  // Title block: fits between the category and the foot line, never touching either.
  const titleBottom = footTop - 34;
  // A monospace face spaces 「3. 」 as wide as a full glyph and has no CJK: Chinese titles use the sans instead.
  const tfam = fam === 'mono' && /[\u3000-\u9fff\uff00-\uffef]/.test(opts.title) ? 'sans' : fam;
  const measure: Measure = (t, sz) => {
    font(ctx, weight, sz, tfam);
    return ctx.measureText(t).width;
  };
  const maxSize = ground.titleMax ?? TITLE_MAX;
  let fit = fitTitle({ text: opts.title, maxWidth, measure, minSize: TITLE_MIN, maxSize });
  const blockHeight = (lines: number, size: number) => lines * size * LINE_HEIGHT;
  while (blockHeight(fit.lines.length, fit.size) > titleBottom - titleTop && fit.size > 28) {
    fit = fitTitle({
      text: opts.title,
      maxWidth,
      measure,
      minSize: fit.size - 4,
      maxSize: fit.size - 4,
    });
  }
  const lh = fit.size * LINE_HEIGHT;
  const blockH = blockHeight(fit.lines.length, fit.size);
  const startBase =
    ground.align === 'bottom'
      ? titleBottom - blockH + fit.size
      : ground.align === 'center'
        ? titleTop + (titleBottom - titleTop - blockH) / 2 + fit.size
        : titleTop + fit.size;
  // Tall frames run the title across the whole width, over the motif: a soft elliptical glow in the ground's
  // contrast colour behind the text (no band). Its strength is the lowest that keeps the title at ≥ 4.5:1 against
  // the brightest 10 % of what is painted under it.
  if (tall) {
    const tws = fit.lines.map((l) => measure(l, fit.size));
    const bw = Math.max(...tws);
    const top = startBase - fit.size * 0.95;
    const bh = (fit.lines.length - 1) * lh + fit.size * 1.25;
    const box = { x: xFor(bw), y: top, w: bw, h: bh };
    const light = ground.ink === '#ffffff';
    const alpha = scrimAlpha(ctx, box, light, [0.22, 0.25, 0.28, 0.34, 0.42, 0.5]);
    if (alpha > 0) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const rx = box.w / 2 + fit.size * 1.6;
      const ry = box.h / 2 + bh; // fades over about twice the block's height
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const tint = light ? '0,0,0' : '255,255,255';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${tint},${alpha})`);
      g.addColorStop(0.55, `rgba(${tint},${(alpha * 0.85).toFixed(3)})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }
  font(ctx, weight, fit.size, tfam);
  ctx.fillStyle = ground.ink;
  fit.lines.forEach((line, i) =>
    ctx.fillText(line, xFor(measure(line, fit.size)), startBase + i * lh),
  );

  if (ground.rule) {
    ctx.fillStyle = ground.rule;
    ctx.fillRect(xFor(56), startBase + (fit.lines.length - 1) * lh + 22, 56, 4);
  }
}

/**
 * 渐变 text, after the demo SVG (1200×630): kicker at (96, 120), 26 px, letter-spacing 6, 85 % white; the title
 * 72 px bold (60 px from three lines) centred on the frame's middle with 1.2 line spacing; the footer
 * 「博客名 · @handle」 at 24 px, 80 % white, 72 px above the bottom. Other sizes keep the proportions; the
 * title is fitted (CJK-aware, ≤3 lines) between kicker and footer, so nothing ever overlaps.
 */
function paintDemoText(
  ctx: CanvasRenderingContext2D,
  opts: CoverOptions,
  w: number,
  h: number,
  tall: boolean,
) {
  const left = tall ? 64 : 96;
  const ks = tall ? 30 : 26;
  const fs = tall ? 28 : 24;
  const maxWidth = w - left * 2;
  const kickerBase = tall ? Math.round(h * 0.12) + 26 : Math.round(Math.max(120, h * 0.19));
  const footBase = h - (tall ? 88 : 72);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';

  const kicker = opts.category?.trim();
  if (kicker) {
    font(ctx, 400, ks);
    ctx.globalAlpha = 0.85;
    let x = left;
    for (const ch of Array.from(kicker)) {
      if (x > left + maxWidth - ks) break;
      ctx.fillText(ch, x, kickerBase);
      x += ctx.measureText(ch).width + 6;
    }
    ctx.globalAlpha = 1;
  }

  const handle = (opts.handle ?? '').trim().replace(/^@/, '');
  const footer = [opts.blogName?.trim() || opts.author?.trim(), handle ? `@${handle}` : '']
    .filter(Boolean)
    .join(' · ');
  if (footer) {
    font(ctx, 400, fs);
    ctx.globalAlpha = 0.8;
    let text = footer;
    while (ctx.measureText(text).width > maxWidth && text.length > 1)
      text = `${text.slice(0, -2)}…`;
    ctx.fillText(text, left, footBase);
    ctx.globalAlpha = 1;
  }

  // Title: as big as the demo (72 / 60 px on 630), centred, kept between the kicker and the footer.
  const top = kicker ? kickerBase + 44 : kickerBase - 26;
  const bottom = footBase - 24 - 40;
  const measure: Measure = (t, sz) => {
    font(ctx, 700, sz);
    return ctx.measureText(t).width;
  };
  const big = tall ? 104 : 72;
  let fit = fitTitle({
    text: opts.title,
    maxWidth,
    measure,
    minSize: 34,
    maxSize: big,
    maxLines: 3,
  });
  // Tall frames are narrow: a short title stays on one line down to the style's own 72 px before it splits.
  if (tall && fit.lines.length > 1) {
    const clean = opts.title.replace(/\s+/g, ' ').trim();
    for (let sz = big; sz >= 72; sz -= 2) {
      if (measure(clean, sz) <= maxWidth) {
        fit = { size: sz, lines: [clean], truncated: false };
        break;
      }
    }
  }
  if (fit.lines.length === 3 && fit.size > 60 && !tall)
    fit = fitTitle({ text: opts.title, maxWidth, measure, minSize: 34, maxSize: 60, maxLines: 3 });
  const lh = 1.2;
  while (fit.lines.length * fit.size * lh > bottom - top && fit.size > 28) {
    fit = fitTitle({
      text: opts.title,
      maxWidth,
      measure,
      minSize: fit.size - 4,
      maxSize: fit.size - 4,
      maxLines: 3,
    });
  }
  const blockH = fit.lines.length * fit.size * lh;
  // The demo centres the block on the middle of the frame; clamp into the free band.
  // Tall frames sit the block a little above the middle, like a poster.
  const mid = tall ? h * 0.44 : h / 2;
  let first = mid - (fit.lines.length - 1) * fit.size * 0.6 + fit.size * 0.2;
  first = Math.max(top + fit.size, Math.min(first, bottom - blockH + fit.size));
  font(ctx, 700, fit.size);
  fit.lines.forEach((l, i) => ctx.fillText(l, left, first + i * fit.size * lh));
}

/**
 * Lowest scrim strength from `steps` at which white (or near-black) text keeps ≥ 4.5:1 over the 90th-percentile
 * brightest (darkest) pixel under `box`. 0 when no scrim is needed; the last step when nothing reads (best effort).
 */
function scrimAlpha(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  lightInk: boolean,
  steps: number[],
): number {
  if (typeof ctx.getImageData !== 'function' || typeof ctx.getTransform !== 'function')
    return steps[0];
  const t = ctx.getTransform();
  const x = Math.max(0, Math.floor(box.x * t.a + t.e));
  const y = Math.max(0, Math.floor(box.y * t.d + t.f));
  const w = Math.max(1, Math.min(ctx.canvas.width - x, Math.ceil(box.w * t.a)));
  const h = Math.max(1, Math.min(ctx.canvas.height - y, Math.ceil(box.h * t.d)));
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return steps[0];
  }
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 16)
    lum.push(0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]));
  lum.sort((a, b) => a - b);
  const worst = lightInk ? lum[Math.floor(lum.length * 0.9)] : lum[Math.floor(lum.length * 0.1)];
  const ok = (a: number) => {
    // scrim blends towards black (light ink) or white (dark ink); approximate in linear light
    const L = lightInk ? worst * (1 - a) : worst + (1 - worst) * a;
    return lightInk ? 1.05 / (L + 0.05) >= 4.5 : (L + 0.05) / (0.0065 + 0.05) >= 4.5;
  };
  if (ok(0)) return 0;
  return steps.find(ok) ?? steps[steps.length - 1];
}

/** Renders onto a fresh canvas and returns it (for previews that want the element). */
export function renderCover(opts: CoverOptions): HTMLCanvasElement {
  const { w, h } = SIZES[opts.size ?? 'og'];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  paintCover(ctx, opts);
  const wm = opts.watermark;
  if (!wm?.plan.enabled) return canvas;
  if (wm.plan.layout === 'inset') {
    drawWatermark(ctx, { w, h }, wm);
    return canvas;
  }
  return watermarkCanvas({ source: canvas, width: w, height: h }, { ...wm, keepSize: true });
}

/** PNG blob of the cover. */
export function generateCover(opts: CoverOptions): Promise<Blob> {
  const canvas = renderCover(opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('封面导出失败'))), 'image/png');
  });
}

/** A `File` the asset uploader accepts. */
export async function generateCoverFile(opts: CoverOptions): Promise<File> {
  const blob = await generateCover(opts);
  const name = `cover-${opts.style ?? 'poster'}-${opts.size ?? 'og'}-${(opts.seed ?? 'x').replace(/[^a-z0-9]/gi, '').slice(0, 12)}.png`;
  return new File([blob], name, { type: 'image/png' });
}
