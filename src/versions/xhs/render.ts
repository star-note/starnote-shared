import { type PaintImage, type PaintOptions, paintXhsCard, XHS_CARD_SIZE } from './templates';
import type { XhsCard } from '../../api/versions';
import { drawWatermark } from '../../watermark/draw';
import { watermarkLayout } from '../../watermark/layout';

/**
 * Canvas plumbing for the card templates: decode a picture once, paint a card at any scale, export PNG.
 * The design is always painted on its full frame (1080×1440 for 3:4) and scaled by the context transform, so a
 * 108-px thumbnail is the exact same picture as the export.
 */

const images = new Map<string, Promise<PaintImage | null>>();
const MAX_IMAGES = 40;

/** Decoded picture for `url`, or `null` when it can't load (or would taint the canvas). Cached per URL. */
export function loadPaintImage(url: string | null | undefined): Promise<PaintImage | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  const hit = images.get(url);
  if (hit) return hit;
  const p = new Promise<PaintImage | null>((resolve) => {
    const img = new Image();
    // our assets are same-origin or CORS-enabled object storage: anonymous keeps the canvas exportable
    if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      images.delete(url);
      resolve(null);
    };
    img.src = url;
  });
  if (images.size >= MAX_IMAGES) images.delete(images.keys().next().value as string);
  images.set(url, p);
  return p;
}

export interface RenderOptions extends Partial<Pick<PaintOptions, 'index' | 'total' | 'watermark'>> {
  /** Design frame (default 1080×1440). */
  frame?: { w: number; h: number };
  /** Output width in px; the height follows the frame's ratio. Default = the frame's width. */
  width?: number;
  /** Already-decoded picture; when absent and `card.image` is set it is loaded. */
  image?: PaintImage | null;
  canvas?: HTMLCanvasElement;
}

/** Paints `card` onto a (new or given) canvas. */
export async function renderXhsCard(card: XhsCard, opts: RenderOptions = {}): Promise<HTMLCanvasElement> {
  const frame = opts.frame ?? XHS_CARD_SIZE;
  const image = opts.image !== undefined ? opts.image : await loadPaintImage(card.image);
  return paintToCanvas(card, { ...opts, frame, image });
}

/** Synchronous paint with an already-decoded image (thumbnails re-paint on every keystroke). */
export function paintToCanvas(
  card: XhsCard,
  opts: RenderOptions & { frame?: { w: number; h: number }; image?: PaintImage | null },
): HTMLCanvasElement {
  const frame = opts.frame ?? XHS_CARD_SIZE;
  const outW = Math.round(opts.width ?? frame.w);
  const k = outW / frame.w;
  const canvas = opts.canvas ?? document.createElement('canvas');
  canvas.width = outW;
  canvas.height = Math.round(frame.h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, frame.w, frame.h);
  const wm = typeof opts.watermark === 'object' ? opts.watermark : null;
  // 画幅边框: the card is laid out on a shorter frame and the band fills the rest (the export stays 3:4)
  const band = wm?.plan.enabled && wm.plan.layout === 'frame' ? watermarkLayout(frame, wm.plan).band : 0;
  const area = { w: frame.w, h: frame.h - band };
  paintXhsCard(ctx, card, {
    w: area.w,
    h: area.h,
    index: opts.index,
    total: opts.total,
    image: opts.image ?? null,
    watermark: band ? undefined : opts.watermark,
  });
  if (band && wm) drawWatermark(ctx, area, { ...wm, band });
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('卡片导出失败'))), type, quality);
  });
}

/** The 1080×1440 PNG of a card. */
export async function xhsCardBlob(card: XhsCard, opts: RenderOptions = {}): Promise<Blob> {
  return canvasBlob(await renderXhsCard(card, opts));
}

/** `starnote-xhs-03.png`: files sort in card order wherever they land. */
export function xhsFileName(index: number, prefix = 'starnote-xhs'): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}.png`;
}

/** Test seam. */
export function clearPaintImageCache() {
  images.clear();
}
