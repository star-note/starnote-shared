/**
 * Cover variants: the chosen cover rendered at every size other surfaces ask for, uploaded at publish
 * time and sent as `cover_variants` (the 3:2 cover stays `cover_asset_hash`).
 *
 * | key        | px          | used for                                                     |
 * | `og`       | 1200×630    | og:image / twitter:image, link cards (知乎 / Medium / X)       |
 * | `wide`     | 900×383     | 微信公众号头条封面 (2.35:1)                                    |
 * | `square`   | 1080×1080   | 公众号次条, share thumbnails, feed thumbs                      |
 * | `portrait` | 1080×1440   | 小红书 and other 3:4 图文 platforms                              |
 *
 * Every cover source gets real per-size output: 杂志模板 lays each size out on its own, 系统生成 repaints
 * at each size, and an article image is smart-cropped (focus when known, else centre biased to the upper third).
 */
import { type CoverOptions, generateCoverFile } from './generateCover';
import { uploadImage, type UploadDeps } from '../editor/upload';
import type { MagazineInput, TemplateKey } from './magazine/types';

export type CoverVariantKey = 'og' | 'wide' | 'square' | 'portrait';
export type CoverVariants = Partial<Record<CoverVariantKey, string>>;

export const VARIANT_KEYS: CoverVariantKey[] = ['og', 'wide', 'square', 'portrait'];

export const VARIANT_SIZES: Record<CoverVariantKey, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  wide: { w: 900, h: 383 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1440 },
};

export const VARIANT_LABELS: Record<CoverVariantKey, { ratio: string; name: string; use: string }> =
  {
    og: { ratio: '1.91:1', name: '分享卡片', use: '分享到微信 / X / 知乎时的预览图' },
    wide: { ratio: '2.35:1', name: '公众号头条', use: '微信公众号头条封面' },
    square: { ratio: '1:1', name: '次条封面', use: '公众号次条封面、缩略图' },
    portrait: { ratio: '3:4', name: '小红书', use: '小红书等 3:4 图文平台' },
  };

/** What the author picked in the cover field; enough to re-render the same cover at any size. */
export type CoverSource =
  | { kind: 'image'; url: string; hash: string; focus?: { x: number; y: number } }
  | { kind: 'generated'; opts: CoverOptions }
  | { kind: 'magazine'; template: TemplateKey; input: MagazineInput };

export function coverSourceKey(s: CoverSource | null): string {
  if (!s) return '';
  if (s.kind === 'image') return `image|${s.hash}`;
  if (s.kind === 'generated') return `gen|${JSON.stringify(s.opts)}`;
  return `mag|${s.template}|${JSON.stringify(s.input)}`;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Cover-crop an `iw×ih` image to the `tw:th` aspect around `focus` (fractions; default: horizontal centre and a
 * point a little above the middle, since subjects and faces sit in the upper third far more often than not).
 */
export function cropRect(
  iw: number,
  ih: number,
  tw: number,
  th: number,
  focus?: { x: number; y: number },
): CropRect {
  const target = tw / th;
  let sw = iw;
  let sh = iw / target;
  if (sh > ih) {
    sh = ih;
    sw = ih * target;
  }
  const fx = focus?.x ?? 0.5;
  const fy = focus?.y ?? 0.4;
  const sx = Math.min(Math.max(fx * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(fy * ih - sh / 2, 0), ih - sh);
  return { sx, sy, sw, sh };
}

function loadImage(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

async function cropImageFile(
  src: Extract<CoverSource, { kind: 'image' }>,
  key: CoverVariantKey,
): Promise<File> {
  // Our assets are same-origin; a CORS-enabled load keeps the canvas exportable for S3 URLs too.
  const img = await loadImage(src.url, !src.url.startsWith('/')).catch(() =>
    loadImage(src.url, false),
  );
  const { w, h } = VARIANT_SIZES[key];
  const r = cropRect(img.naturalWidth, img.naturalHeight, w, h, src.focus);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('封面导出失败'))), 'image/jpeg', 0.9),
  );
  return new File([blob], `cover-${key}-${src.hash.slice(0, 12)}.jpg`, { type: 'image/jpeg' });
}

/** One variant as an image file. */
export async function renderVariantFile(source: CoverSource, key: CoverVariantKey): Promise<File> {
  if (source.kind === 'image') return cropImageFile(source, key);
  if (source.kind === 'generated') return generateCoverFile({ ...source.opts, size: key });
  const { renderMagazineFile } = await import('./magazine/render');
  return (await renderMagazineFile(source.template, source.input, key)).file;
}

export interface VariantProgress {
  done: number;
  total: number;
}

/**
 * Renders and uploads every variant in parallel. A size that fails (render or upload) is simply left out — the
 * server falls back to the main cover for it — so a variant can never block a publish.
 */
export async function buildCoverVariants(
  source: CoverSource,
  deps: UploadDeps,
  onProgress?: (p: VariantProgress) => void,
  keys: CoverVariantKey[] = VARIANT_KEYS,
): Promise<CoverVariants> {
  let done = 0;
  onProgress?.({ done, total: keys.length });
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      try {
        const file = await renderVariantFile(source, key);
        const asset = await uploadImage(file, deps);
        return [key, asset.hash] as const;
      } finally {
        done += 1;
        onProgress?.({ done, total: keys.length });
      }
    }),
  );
  const out: CoverVariants = {};
  for (const r of results) if (r.status === 'fulfilled') out[r.value[0]] = r.value[1];
  return out;
}
