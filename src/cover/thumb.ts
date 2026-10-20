import { type CoverOptions, isCoverStyle, renderCover } from './generateCover';
import { COVER_STYLES } from './styles';

/**
 * Small generated covers for lists (灵感 cards without an image, contract r4 §B): the full 3:2
 * cover painted once, scaled down to a thumbnail and kept as a data URL. The seeded style follows
 * the title so the same headline always gets the same picture.
 */
const THUMB_W = 420;
const THUMB_H = 280;
const MAX_CACHED = 80;
const cache = new Map<string, string | null>();

function pickStyle(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const s = COVER_STYLES[h % COVER_STYLES.length].key;
  return isCoverStyle(s) ? s : 'poster';
}

/** `null` when the browser cannot paint (no Canvas, e.g. jsdom); callers show a plain placeholder then. */
export function coverThumb(
  opts: Pick<CoverOptions, 'title' | 'author' | 'category'> & { seed?: string },
): string | null {
  const seed = opts.seed ?? opts.title;
  const key = `${seed}|${opts.title}|${opts.author ?? ''}|${opts.category ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url: string | null = null;
  try {
    const full = renderCover({ ...opts, seed, size: 'card', style: pickStyle(seed) });
    const small = document.createElement('canvas');
    small.width = THUMB_W;
    small.height = THUMB_H;
    const ctx = small.getContext('2d');
    if (ctx) {
      ctx.drawImage(full, 0, 0, THUMB_W, THUMB_H);
      url = small.toDataURL('image/jpeg', 0.82);
    }
  } catch {
    url = null;
  }
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(key, url);
  return url;
}

/** Test seam. */
export function clearThumbCache() {
  cache.clear();
}
