import type { ArtMaterial } from '../materials/art';
import type { PhotoMaterial } from '../materials/photos';

export type Material = ArtMaterial | PhotoMaterial;

export type TemplateKey = 'fashion' | 'journal' | 'xhs' | 'scenic' | 'geo';

/**
 * `card` 3:2 blog list cover (the main cover) · `og` 1.91:1 share card · `wide` 2.35:1 公众号头条 ·
 * `square` 1:1 次条 / thumbnails · `portrait` 3:4 小红书.
 */
export type MagSize = 'card' | 'og' | 'wide' | 'square' | 'portrait';

/** Sizes whose layout stacks vertically (title under the subject) rather than side by side. */
export const isTall = (size: MagSize) => size === 'portrait' || size === 'square';

export const MAG_TEMPLATES: { key: TemplateKey; label: string; hint: string }[] = [
  { key: 'fashion', label: '时尚杂志', hint: '大刊头 · 封面要目 · 期号与条码' },
  { key: 'journal', label: '期刊', hint: '刊头色带 · 大图 · 一个醒目的标题' },
  { key: 'xhs', label: '小红书卡片', hint: '大字标题 · 贴纸标签 · 作者' },
  { key: 'scenic', label: '风景', hint: '彩色风景照 · 标题压在天空或水面上' },
  { key: 'geo', label: '地理志', hint: '全幅风景 · 刊头与期号 · 底部信息带 · 地点标签与比例尺' },
];

/** Layout frame: every size is laid out 1200 px wide, so type sizes stay comparable. */
export const MAG_DIMENSIONS: Record<MagSize, { w: number; h: number }> = {
  card: { w: 1200, h: 800 },
  og: { w: 1200, h: 630 },
  wide: { w: 1200, h: 511 },
  square: { w: 1200, h: 1200 },
  portrait: { w: 1200, h: 1600 },
};

/** Pixels of the PNG each size is exported at (what the platforms ask for). */
export const MAG_OUTPUT: Record<MagSize, { w: number; h: number }> = {
  card: { w: 1200, h: 800 },
  og: { w: 1200, h: 630 },
  wide: { w: 900, h: 383 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1440 },
};

export function isTemplateKey(s: unknown): s is TemplateKey {
  return s === 'fashion' || s === 'journal' || s === 'xhs' || s === 'scenic' || s === 'geo';
}

export interface MagazineInput {
  title: string;
  author?: string;
  category?: string;
  summary?: string;
  /** Blog title (kept for callers; mastheads are always English). */
  blogName?: string;
  /** Blog handle: shown small in the dateline and on the 小红书 author tag (the masthead is always STARNOTE). */
  handle?: string;
  /** The article's H2/H3 headings: the smaller cover lines. */
  headings?: string[];
  /** 第 N 期; omitted → the date line alone. */
  issue?: number;
  date?: Date;
  /** Stable per note (note id): the same seed + round always gives the same cover. */
  seed: string;
  /** 换一张 counter. */
  round?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
