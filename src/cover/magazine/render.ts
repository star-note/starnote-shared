/**
 * The lazy half of 杂志模板: fonts, artwork, modern-screenshot. Imported with `import()` only when
 * the author opens the 杂志模板 tab, so none of it (nor any photo) is fetched before that.
 */
import '@fontsource/abril-fatface/latin-400.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/bodoni-moda/latin-900.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-900.css';
import '@fontsource/prata/latin-400.css';
import { domToCanvas } from 'modern-screenshot';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { type FontKey, fontCss } from './fonts';
import { type Item, layoutMagazine, type MagazineLayout, type MeasureFor } from './layout';
import { MagazineCover } from './MagazineCover';
import {
  MAG_OUTPUT,
  type MagazineInput,
  type MagSize,
  type Material,
  type Rect,
  type TemplateKey,
} from './types';
import { artLayers } from '../materials/artSources';
import { createRng } from '../rng';

let measureCtx: CanvasRenderingContext2D | null = null;

/** Canvas text measurement with exactly the stacks the DOM renders with. */
export const canvasMeasure: MeasureFor = (font: FontKey) => (text, size) => {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) throw new Error('当前浏览器不支持 Canvas');
  }
  measureCtx.font = fontCss(font, size);
  return measureCtx.measureText(text).width;
};

let fontsReady: Promise<void> | null = null;

/** Bundled display faces must be loaded before measuring, or fitting would use fallback metrics. */
export function ensureFonts(): Promise<void> {
  fontsReady ??= Promise.all([
    document.fonts.load('900 100px "Playfair Display"', 'MAGAZINE'),
    document.fonts.load('700 100px "Playfair Display"', 'Lines'),
    document.fonts.load('italic 400 100px "Playfair Display"', 'Inside'),
    document.fonts.load('400 100px "Abril Fatface"', 'MAGAZINE'),
    document.fonts.load('900 100px "Bodoni Moda"', 'MAGAZINE'),
    document.fonts.load('400 100px "Prata"', 'JOURNAL'),
    document.fonts.load('600 100px "Barlow Condensed"', 'OCTOBER 2026'),
  ]).then(() => document.fonts.ready.then(() => undefined));
  return fontsReady;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('封面素材加载失败'));
      img.src = src;
    }).catch((e) => {
      imageCache.delete(src);
      throw e;
    });
    imageCache.set(src, p);
  }
  return p;
}

/** Multiplies the canvas alpha by a 0→1 ramp over `len` px inward from an edge of `r`. */
function featherEdge(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  edge: 'l' | 'r' | 't' | 'b',
  len: number,
  w: number,
  h: number,
) {
  if (len <= 0) return;
  const g =
    edge === 'l'
      ? ctx.createLinearGradient(r.x, 0, r.x + len, 0)
      : edge === 'r'
        ? ctx.createLinearGradient(r.x + r.w, 0, r.x + r.w - len, 0)
        : edge === 't'
          ? ctx.createLinearGradient(0, r.y, 0, r.y + len)
          : ctx.createLinearGradient(0, r.y + r.h, 0, r.y + r.h - len);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

const avgCache = new Map<string, string>();

/** Mean colour of an image (1×1 downsample). */
function avgColor(img: HTMLImageElement): string {
  const hit = avgCache.get(img.src);
  if (hit) return hit;
  const { ctx } = canvas(1, 1);
  ctx.drawImage(img, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const c = `rgb(${r},${g},${b})`;
  avgCache.set(img.src, c);
  return c;
}

/** Fine film grain over the blurred backdrop: hides 8-bit banding in the soft gradients. Seeded, so deterministic. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string) {
  const rng = createRng(`grain|${seed}`);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(data, 0, 0);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  return { c, ctx };
}

/**
 * Flattens one photo item: (blurred, enlarged copy of the photo where the sharp one falls short)
 * + the sharp photo with feathered edges. Cutouts get the same feathering so they stay registered.
 */
async function composeLayer(
  it: Extract<Item, { kind: 'photo' }>,
  w: number,
  h: number,
): Promise<string> {
  const img = await loadImage(it.src);
  const { c, ctx } = canvas(w, h);
  if (it.layer === 'base' && it.backdrop) {
    // Extend the photo past its edges by stretching its outermost strips, then blur hard: the
    // frame fills with the photo's own colours (no ghost of the subject) and the seam vanishes.
    const ext = canvas(w, h);
    const e = ext.ctx;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const r = it.img;
    const x0 = Math.max(0, r.x);
    const x1 = Math.min(w, r.x + r.w);
    const y0 = Math.max(0, r.y);
    const y1 = Math.min(h, r.y + r.h);
    // Source rectangle of the visible part of the photo.
    const cxs = ((x0 - r.x) / r.w) * iw;
    const cws = ((x1 - x0) / r.w) * iw;
    const cys = ((y0 - r.y) / r.h) * ih;
    const chs = ((y1 - y0) / r.h) * ih;
    const sw = iw * 0.03;
    const sh = ih * 0.03;
    e.fillStyle = avgColor(img);
    e.fillRect(0, 0, w, h);
    if (x0 > 0) e.drawImage(img, cxs, cys, sw, chs, 0, y0, x0, y1 - y0);
    if (x1 < w) e.drawImage(img, cxs + cws - sw, cys, sw, chs, x1, y0, w - x1, y1 - y0);
    if (y0 > 0) e.drawImage(img, cxs, cys, cws, sh, x0, 0, x1 - x0, y0);
    if (y1 < h) e.drawImage(img, cxs, cys + chs - sh, cws, sh, x0, y1, x1 - x0, h - y1);
    e.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.filter = 'blur(40px)';
    // Oversized so the blur does not pull a transparent margin in.
    ctx.drawImage(ext.c, -80, -80, w + 160, h + 160);
    ctx.filter = 'none';
    grain(ctx, w, h, it.src);
  }
  const layer = canvas(w, h);
  layer.ctx.drawImage(img, it.img.x, it.img.y, it.img.w, it.img.h);
  featherEdge(layer.ctx, it.img, 'l', it.feather.l, w, h);
  featherEdge(layer.ctx, it.img, 'r', it.feather.r, w, h);
  featherEdge(layer.ctx, it.img, 'b', it.feather.b, w, h);
  // A cutout's top edge is the subject's own silhouette (the head over the masthead): never fade it.
  if (it.layer === 'base') featherEdge(layer.ctx, it.img, 't', it.feather.t, w, h);
  ctx.drawImage(layer.c, 0, 0);
  return it.layer === 'base' ? c.toDataURL('image/jpeg', 0.93) : c.toDataURL('image/png');
}

async function waitImages(root: HTMLElement) {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete && img.naturalWidth
        ? undefined
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          }),
    ),
  );
}

export interface RenderedCover {
  blob: Blob;
  layout: MagazineLayout;
}

/** Lays out and rasterises one cover to PNG. Deterministic for the same input. */
export async function renderMagazine(
  template: TemplateKey,
  input: MagazineInput,
  size: MagSize = 'card',
  material?: Material,
): Promise<RenderedCover> {
  await ensureFonts();
  const layout = layoutMagazine(template, input, size, canvasMeasure, material);
  const photo: Record<string, string> = {};
  await Promise.all(
    layout.items.map(async (it) => {
      if (it.kind === 'photo') photo[it.key] = await composeLayer(it, layout.w, layout.h);
    }),
  );
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-30000px;top:0;pointer-events:none;contain:strict;width:1200px;height:1600px;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(createElement(MagazineCover, { layout, layers: { photo, art: artLayers } })),
    );
    const node = host.firstElementChild as HTMLElement;
    await waitImages(node);
    const shot = await domToCanvas(node, {
      width: layout.w,
      height: layout.h,
      scale: 1,
      backgroundColor: '#16121c',
    });
    const out = MAG_OUTPUT[size];
    let final = shot;
    if (shot.width !== out.w || shot.height !== out.h) {
      // Laid out 1200 px wide; exported at the size the platform asks for.
      const { c, ctx } = canvas(out.w, out.h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(shot, 0, 0, out.w, out.h);
      final = c;
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      final.toBlob((b) => (b ? resolve(b) : reject(new Error('封面导出失败'))), 'image/png'),
    );
    return { blob, layout };
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function renderMagazineFile(
  template: TemplateKey,
  input: MagazineInput,
  size: MagSize = 'card',
): Promise<{ file: File; layout: MagazineLayout }> {
  const { blob, layout } = await renderMagazine(template, input, size);
  const name = `cover-${template}-${size}-${layout.material.id}-${(input.seed + (input.round ?? 0)).replace(/[^a-z0-9]/gi, '').slice(0, 12)}.png`;
  return { file: new File([blob], name, { type: 'image/png' }), layout };
}
