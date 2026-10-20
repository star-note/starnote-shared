/**
 * Type for the magazine templates. Latin display faces are bundled (all OFL, via @fontsource, loaded
 * only in the lazy render chunk); Chinese falls back to the system's heavy serif / sans, which every
 * target OS has. Measurement (canvas) and rendering (DOM) use the very same stacks, so fitted lines
 * never rewrap.
 */
export interface FontSpec {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

const CJK_SERIF =
  '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", "SimSun", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", "Helvetica Neue", "Noto Sans CJK SC", Arial, sans-serif';

export const FONTS = {
  /* Fashion mastheads: high-contrast Didones, picked per seed. */
  mastPlayfair: { family: '"Playfair Display", serif', weight: 900, style: 'normal' },
  mastAbril: { family: '"Abril Fatface", serif', weight: 400, style: 'normal' },
  mastBodoni: { family: '"Bodoni Moda", serif', weight: 900, style: 'normal' },
  /** The quiet journal masthead: a light Didone, widely tracked. */
  mastPrata: { family: '"Prata", serif', weight: 400, style: 'normal' },
  /** Main cover line: Playfair Black for Latin, the heaviest system Songti for Chinese. */
  coverSerif: { family: `"Playfair Display", ${CJK_SERIF}`, weight: 900, style: 'normal' },
  /** Secondary cover lines. */
  lineSerif: { family: `"Playfair Display", ${CJK_SERIF}`, weight: 700, style: 'normal' },
  /** English accents: Didone italic. */
  accentItalic: { family: `"Playfair Display", ${CJK_SERIF}`, weight: 400, style: 'italic' },
  /** Datelines and small caps: a condensed grotesk. */
  cond: { family: `"Barlow Condensed", ${SANS}`, weight: 600, style: 'normal' },
  /** Journal title: calm serif; Chinese in semibold Songti (Prata itself has one weight, never faux-bolded). */
  journalSerif: { family: `"Prata", ${CJK_SERIF}`, weight: 600, style: 'normal' },
  /** 地理志: system faces only. Masthead and labels in the system grotesk, the title in a system serif (Georgia
   * for Latin, the heaviest Songti for Chinese), so nothing extra is fetched for this template. */
  geoMast: { family: SANS, weight: 800, style: 'normal' },
  geoSerif: { family: `Georgia, "Times New Roman", ${CJK_SERIF}`, weight: 700, style: 'normal' },
  geoLabel: { family: SANS, weight: 600, style: 'normal' },
  sans: { family: SANS, weight: 500, style: 'normal' },
  sansBold: { family: SANS, weight: 700, style: 'normal' },
  heavy: { family: SANS, weight: 900, style: 'normal' },
} satisfies Record<string, FontSpec>;

export type FontKey = keyof typeof FONTS;

/** Cap height / em of the masthead faces (measured with canvas `actualBoundingBoxAscent` of "H"). */
export const CAP_RATIO: Partial<Record<FontKey, number>> = {
  mastPlayfair: 0.71,
  mastAbril: 0.705,
  mastBodoni: 0.755,
  mastPrata: 0.805,
  /** System grotesk caps (SF / PingFang / Helvetica). */
  geoMast: 0.72,
};

export const MASTHEAD_FONTS: FontKey[] = ['mastPlayfair', 'mastAbril', 'mastBodoni'];

export function fontCss(key: FontKey, size: number): string {
  const f = FONTS[key];
  return `${f.style} ${f.weight} ${size}px ${f.family}`;
}

export const CJK_RE =
  /[\u2E80-\u2EFF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

export const hasCjk = (s: string) => CJK_RE.test(s);
