import { encodeQr, type QrCode, type QrEcc, qrSize, qrVersionFor, utf8Bytes } from './qr';

/**
 * 辰记水印 (r10): a fine information strip like the ones high-end cameras print under a photo. Two looks:
 *
 * - `camera` — left: the mark + 「STARNOTE」 (wide-tracked caps) │ @handle; right: an optional item (a title / column)
 *   │ the date 2026.10.21 and a small QR code (the post's short link, else the author's blog);
 * - `text` — one quiet line 「辰记 │ @handle │ 2026.10.21」 with a tiny mark, for platforms that forbid QR codes or
 *   导流 (小红书、抖音…), small pictures, or when the author turned the code off. It never carries a link.
 *
 * and two layouts: `inset` (over the picture's bottom edge, on a soft scrim that follows the picture's tone) and
 * `frame` (a white / black band added under the picture, like a print border).
 *
 * Everything here is pure (no canvas): `watermarkPlan` decides what to draw, `watermarkLayout` sizes it from the
 * picture's short side. `draw.ts` paints it on any 2D context (browser or Node canvas).
 */

export type WatermarkStyle = 'inset' | 'frame';
export type WatermarkVariant = 'camera' | 'text';

/** `PATCH /me/preferences` → `watermark` (defaults: on, inset, with a QR code). */
export interface WatermarkPrefs {
  enabled: boolean;
  style: WatermarkStyle;
  qr: boolean;
}

export const WATERMARK_DEFAULTS: Readonly<WatermarkPrefs> = Object.freeze({
  enabled: true,
  style: 'inset',
  qr: true,
});

/** The stored preference with the defaults filled in (an older API leaves it out). */
export function watermarkPrefsOf(p: unknown): WatermarkPrefs {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<Record<keyof WatermarkPrefs, unknown>>;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : WATERMARK_DEFAULTS.enabled,
    style: o.style === 'frame' || o.style === 'inset' ? o.style : WATERMARK_DEFAULTS.style,
    qr: typeof o.qr === 'boolean' ? o.qr : WATERMARK_DEFAULTS.qr,
  };
}

/* ------------------------------------------------------------------ sizing constants */

/** Type size as a share of the picture's short side (camera strips sit around 1.6–2.2 %). */
export const FONT_RATIO = 0.019;
/** Smallest type the camera strip may use (px of the output); below it the strip falls back to the text line. */
export const MIN_CAMERA_FONT = 11;
/** The text line never goes smaller than this… */
export const MIN_TEXT_FONT = 9;
/** …and a picture whose short side is under this gets no watermark at all. */
export const MIN_SHORT_SIDE = 240;
/** QR code side (modules + quiet zone) as a share of the short side (6–8 %)… */
export const QR_RATIO = 0.075;
/** …allowed to grow to this so a module still gets 2 whole px (a 3:2 cover's short link). */
export const MAX_QR_RATIO = 0.085;
/** A module must be at least this many px or phones will not read it from a screen. */
export const MIN_MODULE_PX = 2;
/** Light modules around the code (the spec asks for 4; 2 keeps the code small and still reads on every phone tried). */
export const QR_QUIET = 2;

export interface WatermarkPlan {
  enabled: boolean;
  variant: WatermarkVariant;
  layout: WatermarkStyle;
  /** True only for `camera`. */
  qr: boolean;
  /** False when a target forbids 导流: nothing link-like (no URL, no QR) may appear. */
  links: boolean;
  /** Why the plan is not the full camera strip the author asked for. */
  reason: null | 'off' | 'pref' | 'platform' | 'multi' | 'small' | 'tiny' | 'no-url';
  /** The `reason` as one short sentence for the UI. */
  note: string | null;
  /** Platforms that forbid the code (labels). */
  blockedBy: string[];
  /** The address the code carries (camera only). */
  url: string | null;
  /** QR level that fits the size budget (camera only). */
  ecc: QrEcc | null;
}

export interface WatermarkImage {
  w: number;
  h: number;
}

/** Modules per side of the code for `url` at `ecc` (null when it does not fit). */
export function qrModules(url: string, ecc: QrEcc): number | null {
  const v = qrVersionFor(utf8Bytes(url).length, ecc);
  return v === null ? null : qrSize(v);
}

/** The QR side in px for a picture (before snapping). */
export const qrSidePx = (short: number) => short * QR_RATIO;

/** M when the code is still sharp enough at this size, else L, else nothing (the code would not scan). */
export function qrLevelFor(url: string, short: number): QrEcc | null {
  const side = short * MAX_QR_RATIO;
  for (const ecc of ['M', 'L'] as const) {
    const n = qrModules(url, ecc);
    if (n !== null && side / (n + QR_QUIET * 2) >= MIN_MODULE_PX) return ecc;
  }
  return null;
}

/* ------------------------------------------------------------------ layout */

export interface WatermarkMetrics {
  /** Short side of the picture. */
  short: number;
  /** Main type size (px). */
  font: number;
  /** Margin from the picture's edges. */
  margin: number;
  /** Mark size. */
  mark: number;
  /** Space between items (and either side of a hairline rule). */
  gap: number;
  /** Hairline width. */
  hair: number;
  /** QR side incl. quiet zone (0 for the text line) and its module size. */
  qr: number;
  module: number;
  /** The code itself (camera only). */
  code: QrCode | null;
  /** Band added under the picture (`frame`; 0 for `inset`). */
  band: number;
  /** Output canvas size. */
  out: { w: number; h: number };
  /** Vertical centre of the strip's content line, in output px. */
  midY: number;
  /** Height of the scrim behind an inset strip. */
  scrim: number;
}

/**
 * Sizes everything from the picture's short side. For `frame` the output grows by `band` (the picture keeps its
 * size); callers that must keep a fixed frame (3:4 cards, covers) paint the picture into `out.h - band` instead.
 */
export function watermarkLayout(image: WatermarkImage, plan: WatermarkPlan): WatermarkMetrics {
  const short = Math.min(image.w, image.h);
  const camera = plan.variant === 'camera' && plan.url && plan.ecc;
  const font = Math.max(camera ? MIN_CAMERA_FONT : MIN_TEXT_FONT, short * FONT_RATIO);
  const margin = Math.max(font * 1.4, short * 0.032);
  const gap = font * 0.85;
  const hair = Math.max(1, Math.round(font * 0.06));
  let code: QrCode | null = null;
  let qr = 0;
  let module = 0;
  if (camera) {
    code = encodeQr(plan.url!, { ecc: plan.ecc! });
    const n = code.size + QR_QUIET * 2;
    // whole-pixel modules keep the code crisp (a few px under the ratio, or up to MAX_QR_RATIO for 2 px modules)
    module = Math.max(MIN_MODULE_PX, Math.floor(qrSidePx(short) / n));
    qr = module * n;
  }
  const lineH = font * 1.4;
  const content = Math.max(qr, lineH);
  let band = 0;
  let midY: number;
  let scrim = 0;
  if (plan.layout === 'frame') {
    const pad = camera ? Math.max(font * 1.1, short * 0.026) : Math.max(font * 1.15, short * 0.024);
    band = Math.round(content + pad * 2);
    midY = image.h + band / 2;
  } else {
    midY = image.h - margin - content / 2;
    scrim = Math.min(image.h * 0.45, content + margin * 2.6);
  }
  return {
    short,
    font,
    margin,
    mark: font * 1.3,
    gap,
    hair,
    qr,
    module,
    code,
    band,
    out: { w: image.w, h: image.h + band },
    midY,
    scrim,
  };
}

/* ------------------------------------------------------------------ content */

/** 2026.10.21 */
export function formatWatermarkDate(d: Date | string | number = new Date()): string {
  const x = d instanceof Date ? d : new Date(d);
  const t = Number.isNaN(x.getTime()) ? new Date() : x;
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}`;
}

/** The optional item on the right: the first 12 characters of a title (or a column name). */
export function watermarkMeta(s: string | null | undefined, max = 12): string {
  const chars = Array.from((s ?? '').replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

/** `@handle` without a doubled @. */
export const watermarkHandle = (h: string | null | undefined) => {
  const v = (h ?? '').trim().replace(/^@+/, '');
  return v ? `@${v}` : '';
};

/** The quiet text line (no code, no link) in `layout`: legacy `watermark: true` and tests. */
export function textPlan(
  layout: WatermarkStyle = 'inset',
  reason: WatermarkPlan['reason'] = null,
): WatermarkPlan {
  return {
    enabled: true,
    variant: 'text',
    layout,
    qr: false,
    links: false,
    reason,
    note: null,
    blockedBy: [],
    url: null,
    ecc: null,
  };
}
