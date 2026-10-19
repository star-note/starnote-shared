/**
 * Which material and layout variant a cover gets. Deterministic per (template, note, round).
 * Each template walks a fixed people / nature rhythm (时尚杂志 ≈ 60/40, 小红书 ≈ 70/30, 期刊 ≈ 40/60),
 * so 换一张 alternates portraits and landscapes instead of serving two look-alikes in a row; within
 * each kind a seeded shuffle runs through photos and drawn artwork without repeats.
 */
import { ART_MATERIALS } from '../materials/art';
import { FAVOURITE_PHOTO, PHOTO_MATERIALS } from '../materials/photos';
import { createRng, type Rng } from '../rng';
import type { Material, TemplateKey } from './types';

type Kind = 'people' | 'nature';

const RHYTHM: Record<TemplateKey, Kind[]> = {
  scenic: ['nature'],
  geo: ['nature'],
  fashion: ['people', 'nature', 'people', 'people', 'nature'],
  xhs: [
    'people',
    'nature',
    'people',
    'people',
    'nature',
    'people',
    'people',
    'nature',
    'people',
    'people',
  ],
  journal: ['nature', 'people', 'nature', 'nature', 'people'],
};

export function kindOf(m: Material): Kind {
  if (m.kind === 'photo') return m.subject;
  return m.subject === 'portrait' ? 'people' : 'nature';
}

const ALL: Record<Kind, Material[]> = {
  people: [
    ...PHOTO_MATERIALS.filter((m) => m.subject === 'people'),
    ...ART_MATERIALS.filter((m) => m.subject === 'portrait'),
  ],
  nature: [
    ...PHOTO_MATERIALS.filter((m) => m.subject === 'nature'),
    ...ART_MATERIALS.filter((m) => m.subject === 'scene'),
  ],
};

/** The pool one template draws from: 时尚杂志 skips crowded photos; 风景 is landscape photos only, minus `noScenic`;
 * 地理志 is the landscape-orientation photos flagged `geo` (no flower fields, nothing upright). */
function poolOf(template: TemplateKey, kind: Kind): Material[] {
  if (template === 'scenic')
    return PHOTO_MATERIALS.filter((m) => m.subject === 'nature' && !m.noScenic);
  if (template === 'geo')
    return PHOTO_MATERIALS.filter((m) => m.subject === 'nature' && m.geo && m.width >= m.height);
  return template === 'fashion'
    ? ALL[kind].filter((m) => !(m.kind === 'photo' && m.crowded))
    : ALL[kind];
}

/** Colour groups for 风景 / 地理志: two neighbours in the deck never share one (no two warm sunsets in a row). */
export function colorGroup(m: Material): string {
  const f = m.kind === 'photo' ? m.family : undefined;
  if (f === 'warm' || f === 'gold') return 'warm';
  if (f === 'pink' || f === 'purple') return 'pink';
  if (f === 'teal' || f === 'blue') return 'cool';
  if (f === 'night') return 'night';
  if (f === 'green') return 'green';
  return 'neutral';
}

/** Reorders a shuffled deck so neighbouring cards differ in colour group (greedy, deterministic). */
function spreadColors(deck: Material[], avoidFirst?: string): Material[] {
  const left = deck.slice();
  const out: Material[] = [];
  let prev = avoidFirst;
  while (left.length) {
    // Take from the largest remaining group that differs from the last card, so no group bunches up at the end.
    const counts = new Map<string, number>();
    left.forEach((m) => counts.set(colorGroup(m), (counts.get(colorGroup(m)) ?? 0) + 1));
    let best = -1;
    left.forEach((m, i) => {
      const g = colorGroup(m);
      if (g === prev) return;
      if (best < 0 || (counts.get(g) ?? 0) > (counts.get(colorGroup(left[best])) ?? 0)) best = i;
    });
    const [m] = left.splice(best < 0 ? 0 : best, 1);
    out.push(m);
    prev = colorGroup(m);
  }
  return out;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The `cycle`-th shuffled pass through one pool. */
export function kindDeck(template: TemplateKey, kind: Kind, seed: string, cycle = 0): Material[] {
  const rng = createRng(`mag-deck|${template}|${kind}|${seed}|${cycle}`);
  let deck = shuffle(poolOf(template, kind), rng);
  if (template === 'scenic' || template === 'geo') {
    const prevLast = cycle > 0 ? kindDeck(template, kind, seed, cycle - 1).at(-1) : undefined;
    deck = spreadColors(deck, prevLast ? colorGroup(prevLast) : undefined);
  }
  if (cycle === 0 && kind === 'people' && template !== 'journal') {
    // The favourite lands on one of the first two people slots (rounds 0–2).
    const at = deck.findIndex((m) => m.id === FAVOURITE_PHOTO);
    const [fav] = deck.splice(at, 1);
    deck.splice(rng.int(0, 1), 0, fav);
  }
  if (cycle > 0) {
    // Never repeat across the seam between two passes.
    const prev = kindDeck(template, kind, seed, cycle - 1);
    if (prev[prev.length - 1].id === deck[0].id) [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  return deck;
}

export function pickMaterial(template: TemplateKey, seed: string, round = 0): Material {
  const rhythm = RHYTHM[template];
  const kind = rhythm[round % rhythm.length];
  // How many earlier rounds drew from the same pool.
  const full = Math.floor(round / rhythm.length) * rhythm.filter((k) => k === kind).length;
  const idx = full + rhythm.slice(0, round % rhythm.length).filter((k) => k === kind).length;
  const pool = poolOf(template, kind);
  return kindDeck(template, kind, seed, Math.floor(idx / pool.length))[idx % pool.length];
}

/** First `n` picks, for tests and previews. */
export function materialSequence(template: TemplateKey, seed: string, n: number): Material[] {
  return Array.from({ length: n }, (_, r) => pickMaterial(template, seed, r));
}

export interface Variant {
  /** Prefer the subject on the left (cover lines on the right). */
  flip: boolean;
  /** Template-specific style index (masthead face, title treatment …). */
  style: number;
  /** Sticker tilt in degrees. */
  tilt: number;
}

export function pickVariant(template: TemplateKey, seed: string, round = 0): Variant {
  const rng = createRng(`mag-variant|${template}|${seed}|${round}`);
  return { flip: rng.chance(0.5), style: rng.int(0, 2), tilt: rng.pick([-5, -3, 3, 5]) };
}
