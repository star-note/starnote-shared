/**
 * Built-in drawn materials (secondary pool). Each artwork is two SVG layers in this folder:
 * `<id>.bg.svg` — the backdrop, drawn full-bleed (`xMidYMax slice`, 1200×1200, safe to crop to
 * 3:2, 1.91:1 and 3:4) — and `<id>.fg.svg` — the subject, anchored to the bottom edge. Templates
 * slip the masthead between the two layers, so the subject stands in front of the title the
 * way a fashion cover's model overlaps the masthead — no segmentation needed.
 *
 * All artworks are original flat/duotone illustrations made for 辰记; no real people.
 * This module is metadata only; the SVG text is loaded by `artSources.ts` in the lazy chunk.
 */
export interface ArtMaterial {
  kind: 'art';
  id: string;
  label: string;
  subject: 'portrait' | 'scene';
  /** fg viewBox width / height. */
  fgAspect: number;
  /** Top of the subject (head, hat, spire) as a fraction of the fg height. */
  top: number;
  /** Horizontal centre of the subject as a fraction of the fg width. */
  cx: number;
  /** Text colour over the upper backdrop. */
  ink: string;
  /** Sticker / band / kicker colour, and the text that sits on it. */
  accent: string;
  accentInk: string;
  /** Highlighter colour behind 小红书 titles (contrasts with `ink`). */
  hi: string;
  /** Solid colour for split panels. */
  tone: string;
}

export const ART_MATERIALS: ArtMaterial[] = [
  {
    kind: 'art',
    id: 'nocturne',
    label: '夜与海 · 侧影',
    subject: 'portrait',
    fgAspect: 0.8,
    top: 0.088,
    cx: 0.52,
    ink: '#f6eedc',
    accent: '#6918b4',
    accentInk: '#ffffff',
    hi: '#6918b4',
    tone: '#120f33',
  },
  {
    kind: 'art',
    id: 'bob',
    label: '波波头',
    subject: 'portrait',
    fgAspect: 0.8,
    top: 0.084,
    cx: 0.53,
    ink: '#ffffff',
    accent: '#f3c2cf',
    accentInk: '#1c2a80',
    hi: '#d0213f',
    tone: '#1c35a0',
  },
  {
    kind: 'art',
    id: 'riviera',
    label: '丝巾与墨镜',
    subject: 'portrait',
    fgAspect: 0.8,
    top: 0.11,
    cx: 0.56,
    ink: '#173f4a',
    accent: '#e8566a',
    accentInk: '#ffffff',
    hi: '#ffd9a8',
    tone: '#1f7f86',
  },
  {
    kind: 'art',
    id: 'pearl',
    label: '宽檐帽与珍珠',
    subject: 'portrait',
    fgAspect: 0.8,
    top: 0.12,
    cx: 0.5,
    ink: '#18121e',
    accent: '#6918b4',
    accentInk: '#ffffff',
    hi: '#ffffff',
    tone: '#2a1a48',
  },
  {
    kind: 'art',
    id: 'bloom',
    label: '花瓶静物',
    subject: 'scene',
    fgAspect: 0.6,
    top: 0.02,
    cx: 0.5,
    ink: '#f3ead9',
    accent: '#e8c46a',
    accentInk: '#1f4a40',
    hi: '#6918b4',
    tone: '#173a32',
  },
  {
    kind: 'art',
    id: 'skyline',
    label: '黄昏城市',
    subject: 'scene',
    fgAspect: 0.8,
    top: 0.0,
    cx: 0.44,
    ink: '#ffe9d6',
    accent: '#f4a27c',
    accentInk: '#2a1650',
    hi: '#d9466f',
    tone: '#2a1650',
  },
  {
    kind: 'art',
    id: 'harbor',
    label: '灯塔海岸',
    subject: 'scene',
    fgAspect: 0.5,
    top: 0.09,
    cx: 0.5,
    ink: '#2a2244',
    accent: '#c8102e',
    accentInk: '#ffffff',
    hi: '#ffe0bf',
    tone: '#1f2f6e',
  },
];
