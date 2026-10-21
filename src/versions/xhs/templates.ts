import type { XhsCard, XhsCardKind } from '../../api/versions';
import { ellipsize, fitLine, fitTitleBox, type Measure, wrapText } from '../../cover/fitText';
import { COVER_FONT } from '../../cover/generateCover';
import { drawWatermark, type WatermarkSpec } from '../../watermark/draw';
import { textPlan } from '../../watermark/layout';

/**
 * 小红书卡片模板 (CONTRACTS-r9 §0: 自有 canvas, reusing the cover generator's CJK-aware fitting). Every template paints
 * all five card kinds on any frame; 3:4 1080×1440 is the export, thumbnails paint the same design scaled down, and
 * 配图建议 paints 16:9 / 4:3 inline cards with the same looks. Sizes are in design units `u` = min(w, h) / 1080.
 *
 * System sans only (苹方 / 微软雅黑): the type is the design — weight, size and the one decoration each look owns.
 */

export type XhsTemplateKey = 'cream' | 'magazine' | 'checklist' | 'gradient' | 'mono';

/** A picture on the card, decoded (an `<img>` or `ImageBitmap` plus its pixel size). */
export interface PaintImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface PaintOptions {
  /** Frame size in px (1080×1440 for the export). */
  w: number;
  h: number;
  /** 0-based position and the card count: the 「3/8」 page mark (none on the cover). */
  index?: number;
  total?: number;
  image?: PaintImage | null;
  /**
   * 辰记水印 (`watermarkPlan`): the inset text line sits in the footer, right-aligned in the card's ink; a `frame`
   * band is painted by `paintToCanvas` under a card laid out on a shorter frame. `true` = the plain text line.
   */
  watermark?: boolean | WatermarkSpec;
}

interface Geo {
  w: number;
  h: number;
  u: number;
  P: number;
}

type Align = 'left' | 'center';
type Marker = 'num' | 'plain-num' | 'check' | 'dot' | 'dash';

interface Look {
  key: XhsTemplateKey;
  label: string;
  hint: string;
  /** Two colours for the picker chip. */
  swatch: [string, string];
  ink: string;
  sub: string;
  accent: string;
  accentInk: string;
  align: Align;
  titleWeight: number;
  titleLH: number;
  /** Title size multiplier (杂志大字 runs bigger). */
  titleScale: number;
  marker: Marker;
  quote: 'mark' | 'bar' | 'rules';
  photo: 'bleed' | 'inset';
  photoRadius: number;
  /** Extra inset of the text box beyond the page margin, in u. */
  inset: number;
  /** Extra room at the top (in u) the ground's decoration takes. */
  top: number;
  ground(ctx: CanvasRenderingContext2D, g: Geo, kind: XhsCardKind): void;
  /** Drawn under the title lines (a highlighter stripe, a rule). */
  underTitle?(ctx: CanvasRenderingContext2D, g: Geo, lines: LineBox[], kind: XhsCardKind): void;
  /** 小节 page number: a small 「第 3 页」 kicker, a giant numeral (which replaces the footer mark), or none. */
  sectionNumber: 'small' | 'giant' | 'none';
}

interface LineBox {
  x: number;
  baseline: number;
  width: number;
  size: number;
}

const FONT = COVER_FONT;

function font(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${Math.max(1, Math.round(size * 10) / 10)}px ${FONT}`;
}

function measurer(ctx: CanvasRenderingContext2D, weight: number): Measure {
  return (t, s) => {
    font(ctx, weight, s);
    return ctx.measureText(t).width;
  };
}

function rgba(c: string, alpha: number): string {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ---------------------------------------------------------------- the looks */

const cream: Look = {
  key: 'cream',
  label: '奶油便签',
  hint: '横线便签纸 · 胶带 · 荧光笔划线',
  swatch: ['#FBF4E4', '#F2C230'],
  ink: '#2B2118',
  sub: '#8C7B66',
  accent: '#F2C230',
  accentInk: '#2B2118',
  align: 'left',
  titleWeight: 800,
  titleLH: 1.24,
  titleScale: 1,
  marker: 'num',
  quote: 'mark',
  photo: 'inset',
  photoRadius: 18,
  inset: 0,
  top: 40,
  sectionNumber: 'none',
  ground(ctx, { w, h, u, P }) {
    ctx.fillStyle = '#FBF4E4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(176,140,80,0.11)';
    ctx.lineWidth = Math.max(1, 2 * u);
    for (let y = P + 120 * u; y < h - P * 0.6; y += 72 * u) {
      ctx.beginPath();
      ctx.moveTo(P * 0.5, y);
      ctx.lineTo(w - P * 0.5, y);
      ctx.stroke();
    }
    // a strip of washi tape across the top edge
    ctx.save();
    ctx.translate(w / 2, P * 0.42);
    ctx.rotate(-0.05);
    ctx.fillStyle = 'rgba(242,194,48,0.78)';
    ctx.fillRect(-130 * u, -30 * u, 260 * u, 60 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = -130 * u; x < 130 * u; x += 26 * u) ctx.fillRect(x, -30 * u, 9 * u, 60 * u);
    ctx.restore();
  },
  underTitle(ctx, _g, lines) {
    // highlighter under the last line
    const l = lines[lines.length - 1];
    if (!l) return;
    ctx.fillStyle = 'rgba(242,194,48,0.62)';
    ctx.fillRect(
      l.x - l.size * 0.08,
      l.baseline - l.size * 0.36,
      l.width + l.size * 0.16,
      l.size * 0.44,
    );
  },
};

const magazine: Look = {
  key: 'magazine',
  label: '杂志大字',
  hint: '超大粗黑标题 · 钴蓝页码 · 粗线',
  swatch: ['#FFFFFF', '#2340D8'],
  ink: '#000000',
  sub: '#6B6B6B',
  accent: '#2340D8',
  accentInk: '#FFFFFF',
  align: 'left',
  titleWeight: 900,
  titleLH: 1.1,
  titleScale: 1.18,
  marker: 'plain-num',
  quote: 'bar',
  photo: 'bleed',
  photoRadius: 0,
  inset: 0,
  top: 56,
  sectionNumber: 'giant',
  ground(ctx, { w, h, u, P }) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000000';
    ctx.fillRect(P, P, w - 2 * P, 12 * u);
  },
  underTitle(ctx, { u }, lines, kind) {
    if (kind === 'quote') return;
    const l = lines[lines.length - 1];
    if (!l) return;
    ctx.fillStyle = '#2340D8';
    ctx.fillRect(l.x, l.baseline + l.size * 0.32, 96 * u, 12 * u);
  },
};

const checklist: Look = {
  key: 'checklist',
  label: '清单卡',
  hint: '薄荷底白卡片 · 勾选框 · 干净利落',
  swatch: ['#E3F1EA', '#1F9D6B'],
  ink: '#17322A',
  sub: '#5E7A70',
  accent: '#1F9D6B',
  accentInk: '#FFFFFF',
  align: 'left',
  titleWeight: 800,
  titleLH: 1.22,
  titleScale: 0.94,
  marker: 'check',
  quote: 'mark',
  photo: 'inset',
  photoRadius: 28,
  inset: 28,
  top: 24,
  sectionNumber: 'small',
  ground(ctx, { w, h, u, P }) {
    ctx.fillStyle = '#E3F1EA';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = 'rgba(23,50,42,0.10)';
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 12 * u;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, P * 0.5, P * 0.5, w - P, h - P, 44 * u);
    ctx.fill();
    ctx.restore();
  },
  underTitle(ctx, { u }, lines, kind) {
    if (kind === 'quote' || kind === 'cover') return;
    const l = lines[lines.length - 1];
    if (!l) return;
    ctx.fillStyle = '#1F9D6B';
    roundRect(ctx, l.x, l.baseline + l.size * 0.34, 72 * u, 10 * u, 5 * u);
    ctx.fill();
  },
};

const gradient: Look = {
  key: 'gradient',
  label: '渐变金句',
  hint: '珊瑚到靛紫的渐变 · 居中白字 · 大引号',
  swatch: ['#F0645A', '#5B3FD1'],
  ink: '#FFFFFF',
  sub: 'rgba(255,255,255,0.82)',
  accent: '#FFFFFF',
  accentInk: '#5B2AA8',
  align: 'center',
  titleWeight: 800,
  titleLH: 1.22,
  titleScale: 1,
  marker: 'dot',
  quote: 'mark',
  photo: 'inset',
  photoRadius: 36,
  inset: 0,
  top: 24,
  sectionNumber: 'none',
  ground(ctx, { w, h, u }) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#F0645A');
    g.addColorStop(0.55, '#C43C9E');
    g.addColorStop(1, '#5B3FD1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const glow = (x: number, y: number, r: number, a: number) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(255,255,255,${a})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(w * 0.86, h * 0.12, 460 * u, 0.22);
    glow(w * 0.08, h * 0.92, 380 * u, 0.14);
    // a light veil keeps white type above 3:1 on the coral end
    ctx.fillStyle = 'rgba(30,0,50,0.12)';
    ctx.fillRect(0, 0, w, h);
  },
};

const mono: Look = {
  key: 'mono',
  label: '极简黑白',
  hint: '纯黑底 · 细框 · 居中留白',
  swatch: ['#000000', '#FFFFFF'],
  ink: '#FFFFFF',
  sub: '#A3A3A3',
  accent: '#FFFFFF',
  accentInk: '#000000',
  align: 'center',
  titleWeight: 600,
  titleLH: 1.3,
  titleScale: 0.92,
  marker: 'dash',
  quote: 'rules',
  photo: 'inset',
  photoRadius: 0,
  inset: 12,
  top: 24,
  sectionNumber: 'none',
  ground(ctx, { w, h, u }) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, 2 * u);
    const m = 44 * u;
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  },
};

const LOOKS: Record<XhsTemplateKey, Look> = { cream, magazine, checklist, gradient, mono };

export const XHS_TEMPLATES: {
  key: XhsTemplateKey;
  label: string;
  hint: string;
  swatch: [string, string];
}[] = (Object.values(LOOKS) as Look[]).map(({ key, label, hint, swatch }) => ({
  key,
  label,
  hint,
  swatch,
}));

export function isXhsTemplate(k: unknown): k is XhsTemplateKey {
  return typeof k === 'string' && k in LOOKS;
}

export function xhsTemplateLabel(k: string): string {
  return isXhsTemplate(k) ? LOOKS[k].label : LOOKS.cream.label;
}

/* ------------------------------------------------------------- text blocks */

interface Block {
  size: number;
  lines: string[];
  lh: number;
  weight: number;
}

const blockHeight = (b: Block) => (b.lines.length ? b.size * (1 + (b.lines.length - 1) * b.lh) : 0);

function fitBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: {
    width: number;
    height: number;
    min: number;
    max: number;
    lh: number;
    weight: number;
    maxLines?: number;
  },
): Block {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || o.height <= 0) return { size: o.min, lines: [], lh: o.lh, weight: o.weight };
  const measure = measurer(ctx, o.weight);
  // fitTitleBox counts n·size·lh against the height; our blocks need size·(1 + (n−1)·lh)
  const fit = fitTitleBox({
    text: t,
    maxWidth: o.width,
    maxHeight: o.height + (o.lh - 1) * o.min,
    lineHeight: o.lh,
    measure,
    maxLines: o.maxLines ?? 14,
    minSize: o.min,
    maxSize: Math.max(o.min, o.max),
    step: 2,
  });
  return { size: fit.size, lines: fit.lines, lh: o.lh, weight: o.weight };
}

/**
 * One clause a line (「早起不是目的，」/「掌控自己的时间才是。」): how a quote is set on a poster. Used when the text
 * has 2–`maxLines` clauses and every clause fits one line at a size ≥ `min`; otherwise `null` (wrap normally).
 */
function fitClauses(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: {
    width: number;
    height: number;
    min: number;
    max: number;
    lh: number;
    weight: number;
    maxLines: number;
  },
): Block | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const clauses =
    t
      .match(/[^，。！？；：,!?;:]+[，。！？；：,!?;:」』”]*/g)
      ?.map((c) => c.trim())
      .filter(Boolean) ?? [];
  if (clauses.length < 2 || clauses.length > o.maxLines || clauses.join('') !== t.replace(/ /g, ''))
    return null;
  const measure = measurer(ctx, o.weight);
  let size = Math.min(o.max, ...clauses.map((c) => fitLine(c, o.width, measure, 1, o.max)));
  const n = clauses.length;
  size = Math.min(size, o.height / (1 + (n - 1) * o.lh));
  if (size < o.min) return null;
  return { size: Math.floor(size), lines: clauses, lh: o.lh, weight: o.weight };
}

/** Paints the block with its top at `top`; returns the line boxes. */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  b: Block,
  x0: number,
  width: number,
  top: number,
  align: Align,
  color: string,
  under?: (lines: LineBox[]) => void,
): LineBox[] {
  const measure = measurer(ctx, b.weight);
  const boxes: LineBox[] = b.lines.map((line, i) => {
    const lw = measure(line, b.size);
    return {
      x: align === 'center' ? x0 + (width - lw) / 2 : x0,
      baseline: top + b.size * 0.9 + i * b.size * b.lh,
      width: lw,
      size: b.size,
    };
  });
  under?.(boxes);
  font(ctx, b.weight, b.size);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  boxes.forEach((l, i) => ctx.fillText(b.lines[i]!, l.x, l.baseline));
  return boxes;
}

interface ItemsFit {
  size: number;
  wrapped: string[][];
  gap: number;
  lh: number;
}

function itemsHeight(f: ItemsFit) {
  return (
    f.wrapped.reduce((s, ls) => s + f.size * (1 + (ls.length - 1) * f.lh), 0) +
    f.gap * Math.max(0, f.wrapped.length - 1)
  );
}

function fitItems(
  ctx: CanvasRenderingContext2D,
  items: string[],
  o: {
    width: number;
    height: number;
    min: number;
    max: number;
    lh: number;
    weight: number;
    marker: (size: number) => number;
  },
): ItemsFit {
  const measure = measurer(ctx, o.weight);
  const list = items.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let fit: ItemsFit = { size: o.min, wrapped: [], gap: 0, lh: o.lh };
  for (let size = Math.max(o.min, o.max); size >= o.min; size -= 2) {
    const width = o.width - o.marker(size);
    fit = {
      size,
      wrapped: list.map((it) => wrapText(it, width, size, measure)),
      gap: size * 0.95,
      lh: o.lh,
    };
    if (itemsHeight(fit) <= o.height) return fit;
  }
  // still too tall at the smallest size: two lines an item, then drop the tail
  const width = o.width - o.marker(fit.size);
  fit.wrapped = fit.wrapped.map((ls) =>
    ls.length > 2 ? [ls[0]!, ellipsize(`${ls[1]}…`, width, fit.size, measure)] : ls,
  );
  while (fit.wrapped.length > 1 && itemsHeight(fit) > o.height) fit.wrapped.pop();
  return fit;
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  look: Look,
  i: number,
  x: number,
  baseline: number,
  size: number,
  u: number,
) {
  const cy = baseline - size * 0.36;
  switch (look.marker) {
    case 'num': {
      const r = size * 0.62;
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(x + r, cy, r, 0, Math.PI * 2);
      ctx.fill();
      font(ctx, 800, size * 0.72);
      ctx.fillStyle = look.accentInk;
      const t = String(i + 1);
      ctx.fillText(t, x + r - ctx.measureText(t).width / 2, cy + size * 0.26);
      return;
    }
    case 'plain-num': {
      font(ctx, 900, size);
      ctx.fillStyle = look.accent;
      ctx.fillText(String(i + 1).padStart(2, '0'), x, baseline);
      return;
    }
    case 'check': {
      const s = size * 0.98;
      const top = cy - s / 2;
      ctx.strokeStyle = look.accent;
      ctx.lineWidth = Math.max(1.5, 4 * u);
      roundRect(ctx, x, top, s, s, s * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.24, top + s * 0.52);
      ctx.lineTo(x + s * 0.43, top + s * 0.7);
      ctx.lineTo(x + s * 0.78, top + s * 0.3);
      ctx.stroke();
      return;
    }
    case 'dot': {
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(x + size * 0.22, cy, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'dash':
      ctx.fillStyle = look.accent;
      ctx.fillRect(x, cy - Math.max(1, 1.5 * u), size * 0.6, Math.max(2, 3 * u));
  }
}

const markerWidth = (look: Look, size: number) =>
  look.marker === 'plain-num'
    ? size * 1.75
    : look.marker === 'num'
      ? size * 1.24 + size * 0.5
      : look.marker === 'check'
        ? size * 1.6
        : size;

function drawItems(
  ctx: CanvasRenderingContext2D,
  look: Look,
  f: ItemsFit,
  x0: number,
  width: number,
  top: number,
  u: number,
) {
  const measure = measurer(ctx, 500);
  const mw = markerWidth(look, f.size);
  // centred looks centre the list as a block, items stay left-aligned inside it
  let x = x0;
  if (look.align === 'center') {
    const widest = Math.max(0, ...f.wrapped.flat().map((l) => measure(l, f.size)));
    x = x0 + Math.max(0, (width - widest - mw) / 2);
  }
  let y = top;
  f.wrapped.forEach((lines, i) => {
    const baseline = y + f.size * 0.9;
    drawMarker(ctx, look, i, x, baseline, f.size, u);
    font(ctx, 500, f.size);
    ctx.fillStyle = look.ink;
    lines.forEach((l, k) => ctx.fillText(l, x + mw, baseline + k * f.size * f.lh));
    y += f.size * (1 + (lines.length - 1) * f.lh) + f.gap;
  });
  return y - f.gap;
}

/* ------------------------------------------------------------------ photo */

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: PaintImage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (w <= 0 || h <= 0 || !img.width || !img.height) return;
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  try {
    ctx.drawImage(img.source, sx, sy, sw, sh, x, y, w, h);
  } catch {
    /* a tainted or broken image paints nothing */
  }
  ctx.restore();
}

/** Places the picture for `kind`; returns where the text may start. */
function placePhoto(
  ctx: CanvasRenderingContext2D,
  look: Look,
  g: Geo,
  kind: XhsCardKind,
  img: PaintImage,
  x0: number,
  x1: number,
  y0: number,
) {
  const { w, h, u } = g;
  const share = kind === 'cover' ? 0.5 : 0.34;
  if (look.photo === 'bleed') {
    const ph = h * share;
    drawPhoto(ctx, img, 0, 0, w, ph, 0);
    return ph + 72 * u;
  }
  const ph = h * (share - 0.04);
  const r = look.photoRadius * u;
  if (look.key === 'cream' || look.key === 'gradient') {
    // a white mat around the print
    const m = 12 * u;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 24 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, x0 - m, y0 - m, x1 - x0 + 2 * m, ph + 2 * m, r + m);
    ctx.fill();
    ctx.restore();
  }
  drawPhoto(ctx, img, x0, y0, x1 - x0, ph, r);
  return y0 + ph + 64 * u;
}

/* ---------------------------------------------------------------- painting */

function geo(w: number, h: number): Geo {
  const u = Math.min(w, h) / 1080;
  return { w, h, u, P: 96 * u };
}

/**
 * How far down a short block sits: a note page keeps its text near the top, but a few lines alone at the top of a
 * tall card look lost, so part of the spare room goes above (more for the centred looks). Under a picture: none.
 */
function settle(spare: number, look: Look, image: boolean): number {
  if (image || spare <= 0) return 0;
  return spare * (look.align === 'center' ? 0.4 : 0.24);
}

/** Paints `card` on `ctx`, which is already sized `opts.w × opts.h` (or scaled to it). */
export function paintXhsCard(ctx: CanvasRenderingContext2D, card: XhsCard, opts: PaintOptions) {
  const g = geo(opts.w, opts.h);
  const { w, h, u, P } = g;
  const look = isXhsTemplate(card.template) ? LOOKS[card.template] : LOOKS.cream;
  const landscape = w > h;
  ctx.save();
  ctx.globalAlpha = 1;
  look.ground(ctx, g, card.kind);

  const x0 = P + look.inset * u;
  const x1 = w - P - look.inset * u;
  const width = x1 - x0;
  let y0 = P + look.top * u;
  const y1 = h - P - look.inset * u - 40 * u;
  if (opts.image && !landscape) y0 = placePhoto(ctx, look, g, card.kind, opts.image, x0, x1, y0);
  const room = Math.max(0, y1 - y0);
  const ts = look.titleScale;
  const title = card.title?.trim() ?? '';
  const body = card.body?.trim() ?? '';
  const items = (card.items ?? []).filter((s) => s.trim());
  const under = (lines: LineBox[]) => look.underTitle?.(ctx, g, lines, card.kind);

  // wide inline cards (配图建议): the title on the left, the list / text on the right, both centred vertically
  if (landscape && (card.kind === 'points' || card.kind === 'section') && w > h * 1.2) {
    const colGap = 72 * u;
    const lw = width * 0.38;
    const rx = x0 + lw + colGap;
    const rw = width - lw - colGap;
    const t = fitBlock(ctx, title, {
      width: lw,
      height: room,
      min: 52 * u,
      max: 104 * u * ts,
      lh: look.titleLH,
      weight: look.titleWeight,
      maxLines: 4,
    });
    drawBlock(
      ctx,
      t,
      x0,
      lw,
      y0 + Math.max(0, (room - blockHeight(t)) / 2),
      'left',
      look.ink,
      under,
    );
    if (card.kind === 'points') {
      const f = fitItems(ctx, items, {
        width: rw,
        height: room,
        min: 30 * u,
        max: 56 * u,
        lh: 1.4,
        weight: 500,
        marker: (s) => markerWidth(look, s),
      });
      drawItems(
        ctx,
        { ...look, align: 'left' },
        f,
        rx,
        rw,
        y0 + Math.max(0, (room - itemsHeight(f)) / 2),
        u,
      );
    } else {
      const b = fitBlock(ctx, body, {
        width: rw,
        height: room,
        min: 30 * u,
        max: 52 * u,
        lh: 1.65,
        weight: 400,
      });
      drawBlock(ctx, b, rx, rw, y0 + Math.max(0, (room - blockHeight(b)) / 2), 'left', look.ink);
    }
  } else
    switch (card.kind) {
      case 'cover': {
        const sub = fitBlock(ctx, body, {
          width,
          height: Math.min(room * 0.3, 220 * u),
          min: 34 * u,
          max: 48 * u,
          lh: 1.5,
          weight: 400,
          maxLines: 3,
        });
        const subH = sub.lines.length ? blockHeight(sub) + 48 * u : 0;
        const t = fitBlock(ctx, title || '无标题', {
          width,
          height: room - subH,
          min: 60 * u,
          max: (opts.image ? 100 : landscape ? 120 : 136) * u * ts,
          lh: look.titleLH,
          weight: look.titleWeight,
          maxLines: 5,
        });
        const blockH = blockHeight(t) + subH;
        // no picture: the title sits a little above the middle, like a poster
        const top = opts.image
          ? y0
          : Math.max(y0, Math.min(y0 + (room - blockH) * 0.42, y1 - blockH));
        const lines = drawBlock(ctx, t, x0, width, top, look.align, look.ink, under);
        const tBottom = (lines[lines.length - 1]?.baseline ?? top) + t.size * 0.3;
        if (sub.lines.length)
          drawBlock(ctx, sub, x0, width, tBottom + 40 * u, look.align, look.sub);
        break;
      }
      case 'points': {
        const gap = 72 * u;
        const t = fitBlock(ctx, title, {
          width,
          height: Math.min(room * 0.34, 280 * u),
          min: 52 * u,
          max: 88 * u * ts,
          lh: look.titleLH,
          weight: look.titleWeight,
          maxLines: 3,
        });
        const tH = t.lines.length ? blockHeight(t) + gap : 0;
        const f = fitItems(ctx, items, {
          width,
          height: room - tH,
          min: 32 * u,
          max: 62 * u,
          lh: 1.45,
          weight: 500,
          marker: (s) => markerWidth(look, s),
        });
        const top = y0 + settle(room - tH - itemsHeight(f), look, Boolean(opts.image));
        drawBlock(ctx, t, x0, width, top, look.align, look.ink, under);
        drawItems(ctx, look, f, x0, width, top + tH, u);
        break;
      }
      case 'section': {
        const gap = 72 * u;
        const num =
          look.sectionNumber !== 'none' && opts.index !== undefined && !landscape
            ? {
                text: String(opts.index + 1).padStart(2, '0'),
                giant: look.sectionNumber === 'giant',
              }
            : null;
        const numSize = num ? (num.giant ? (opts.image ? 120 : 220) * u : 34 * u) : 0;
        const numH = num ? (num.giant ? numSize * 0.96 : numSize + 36 * u) : 0;
        const t = fitBlock(ctx, title, {
          width,
          height: Math.min((room - numH) * 0.42, 320 * u),
          min: 52 * u,
          max: 96 * u * ts,
          lh: look.titleLH,
          weight: look.titleWeight,
          maxLines: 3,
        });
        const tH = t.lines.length ? blockHeight(t) + gap : 0;
        const b = fitBlock(ctx, body, {
          width,
          height: room - numH - tH,
          min: 32 * u,
          max: 58 * u,
          lh: 1.7,
          weight: 400,
        });
        let top = y0 + settle(room - numH - tH - blockHeight(b), look, Boolean(opts.image));
        if (num) {
          font(ctx, num.giant ? 900 : 700, numSize);
          ctx.fillStyle = look.accent;
          const tw = ctx.measureText(num.text).width;
          const nx = num.giant
            ? x0 - numSize * 0.04
            : look.align === 'center'
              ? x0 + (width - tw) / 2
              : x0;
          ctx.fillText(num.text, nx, top + numSize * (num.giant ? 0.86 : 0.9));
          top += numH;
        }
        drawBlock(ctx, t, x0, width, top, look.align, look.ink, under);
        drawBlock(ctx, b, x0, width, top + tH, look.align, look.ink);
        break;
      }
      case 'quote': {
        const attrH = title ? 34 * u * 1.4 + 48 * u : 0;
        const markH = look.quote === 'mark' ? 150 * u : look.quote === 'rules' ? 72 * u : 0;
        const qOpts = {
          width: look.quote === 'bar' ? width - 48 * u : width,
          height: room - attrH - markH,
          min: 46 * u,
          max: (landscape ? 104 : 100) * u * ts,
          lh: 1.42,
          weight: look.key === 'mono' ? 600 : 800,
          maxLines: 8,
        };
        // a clause a line when the clauses still read big (≥ 72 % of the largest size)
        const q =
          fitClauses(ctx, body || title, { ...qOpts, min: qOpts.max * 0.72, maxLines: 4 }) ??
          fitBlock(ctx, body || title, qOpts);
        const qh = blockHeight(q);
        const total = markH + qh + attrH;
        let top = opts.image ? y0 : y0 + Math.max(0, (room - total) * 0.45);
        if (look.quote === 'mark') {
          font(ctx, 900, 220 * u);
          ctx.fillStyle = look.key === 'gradient' ? 'rgba(255,255,255,0.4)' : look.accent;
          const glyph = '“';
          const gw = ctx.measureText(glyph).width;
          ctx.fillText(
            glyph,
            look.align === 'center' ? x0 + (width - gw) / 2 : x0 - 8 * u,
            top + 200 * u,
          );
          top += markH;
        } else if (look.quote === 'rules') {
          ctx.fillStyle = look.sub;
          ctx.fillRect(x0 + width / 2 - 40 * u, top, 80 * u, Math.max(1, 2 * u));
          top += markH;
        }
        const qx = look.quote === 'bar' ? x0 + 48 * u : x0;
        const qw = look.quote === 'bar' ? width - 48 * u : width;
        if (look.quote === 'bar') {
          ctx.fillStyle = look.accent;
          ctx.fillRect(x0, top + q.size * 0.05, 14 * u, qh);
        }
        drawBlock(ctx, q, qx, qw, top, look.align, look.ink);
        let after = top + qh;
        if (look.quote === 'rules') {
          ctx.fillStyle = look.sub;
          ctx.fillRect(x0 + width / 2 - 40 * u, after + 56 * u, 80 * u, Math.max(1, 2 * u));
          after += 56 * u;
        }
        if (title && body) {
          const a = fitBlock(ctx, `—— ${title}`, {
            width: qw,
            height: 34 * u * 1.4,
            min: 26 * u,
            max: 34 * u,
            lh: 1.3,
            weight: 500,
            maxLines: 1,
          });
          drawBlock(ctx, a, qx, qw, after + 48 * u, look.align, look.sub);
        }
        break;
      }
      case 'ending': {
        const pills = items.slice(0, 3);
        const pillH = 100 * u;
        const pillsH = pills.length ? pills.length * pillH + (pills.length - 1) * 24 * u : 0;
        const t = fitBlock(ctx, title, {
          width,
          height: Math.min(room * 0.3, 240 * u),
          min: 50 * u,
          max: 92 * u * ts,
          lh: look.titleLH,
          weight: look.titleWeight,
          maxLines: 2,
        });
        const tH = t.lines.length ? blockHeight(t) + 64 * u : 0;
        const b = fitBlock(ctx, body, {
          width,
          height: room - tH - pillsH - 80 * u,
          min: 32 * u,
          max: 48 * u,
          lh: 1.65,
          weight: 400,
        });
        const bH = b.lines.length ? blockHeight(b) : 0;
        const total = tH + bH + (pills.length ? 80 * u + pillsH : 0);
        let top = opts.image ? y0 : y0 + Math.max(0, (room - total) * 0.4);
        drawBlock(ctx, t, x0, width, top, look.align, look.ink, under);
        top += tH;
        drawBlock(ctx, b, x0, width, top, look.align, look.ink);
        top += bH + 80 * u;
        const measure = measurer(ctx, 600);
        const ps = 38 * u;
        for (const p of pills) {
          const text = ellipsize(p.trim(), width - 88 * u, ps, measure);
          const pw = measure(text, ps) + 88 * u;
          const px = look.align === 'center' ? x0 + (width - pw) / 2 : x0;
          ctx.fillStyle = look.accent;
          roundRect(ctx, px, top, pw, pillH, pillH / 2);
          ctx.fill();
          font(ctx, 600, ps);
          ctx.fillStyle = look.accentInk;
          ctx.fillText(text, px + 44 * u, top + pillH / 2 + ps * 0.34);
          top += pillH + 24 * u;
        }
        break;
      }
    }

  // footer: page mark and the watermark
  const fs = 26 * u;
  const base =
    h -
    P * 0.5 -
    look.inset * u * 0.5 -
    (look.key === 'checklist' ? 40 * u : look.key === 'mono' ? 28 * u : 8 * u);
  const fx0 =
    look.key === 'checklist' ? P * 0.5 + 48 * u : look.key === 'mono' ? 44 * u + 36 * u : P;
  const fx1 = w - fx0;
  font(ctx, 500, fs);
  ctx.fillStyle = look.sub;
  const giant = card.kind === 'section' && look.sectionNumber === 'giant';
  if (card.kind !== 'cover' && !giant && opts.index !== undefined && opts.total && !landscape)
    ctx.fillText(`${opts.index + 1} / ${opts.total}`, fx0, base);
  const wm: WatermarkSpec | null =
    opts.watermark === true ? { plan: textPlan() } : opts.watermark || null;
  if (wm?.plan.enabled && wm.plan.layout === 'inset') {
    // the designed footer keeps the text line (cards never carry the code: 小红书 / 配图 rules)
    const plan = wm.plan.variant === 'text' ? wm.plan : { ...wm.plan, variant: 'text' as const, qr: false, url: null, ecc: null };
    drawWatermark(ctx, { w, h }, { ...wm, plan, place: { x: fx1, y: base - fs * 0.36, ink: look.sub, align: 'right' } });
  }
  ctx.restore();
}

export const XHS_CARD_SIZE = { w: 1080, h: 1440 } as const;

/** Sizes of the inline cards 配图建议 inserts into the article. */
export const INLINE_CARD_SIZES = {
  '16:9': { w: 1200, h: 675 },
  '4:3': { w: 1200, h: 900 },
} as const;
export type InlineRatio = keyof typeof INLINE_CARD_SIZES;

/** `#rrggbb` + alpha (exported for the editor's chips). */
export const withAlpha = rgba;
