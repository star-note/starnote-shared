import type { ShapeKey } from './shapes';

export { PALETTE } from './palette';

/** Weights of the first five palette colours (violet, deep violet, lilac, amber, white) for points without a fixed tone. */
export type Mix = readonly [number, number, number, number, number];

/** How much a formation travels with its screen while the page moves (1 = glued to it). */
export const FOLLOW = 0.55;

/** The numeric part of a scene, which is interpolated field by field. */
export interface SceneNumbers {
  /** Multiplier on the shape's own coordinates: < 1 tightens it, > 1 loosens it. */
  spread: number;
  /** Camera zoom. */
  scale: number;
  /** Camera rotation about the vertical axis, radians (spin is added on top over time). */
  yaw: number;
  /** Camera tilt about the horizontal axis, radians. */
  pitch: number;
  /** Rotation in the screen plane, radians. */
  roll: number;
  /** Continuous yaw per second. */
  spin: number;
  /** Point size multiplier. */
  size: number;
  /** Overall opacity multiplier. */
  alpha: number;
  /** Centre offset as a fraction of the canvas width / height. */
  ox: number;
  oy: number;
  /** Vertical offset used instead of `oy` when the copy stacks in one column (narrow screens). */
  oyN: number;
  /** Zoom used instead of `scale` on narrow screens. */
  scaleN: number;
}

export interface SceneState extends SceneNumbers {
  shape: ShapeKey;
  mix: Mix;
  /** How far points scatter mid-transition when leaving this scene, in design units. */
  burst: number;
}

export interface Keyframe {
  /** Page progress where the screen snaps into place. */
  at: number;
  /** Page progress up to which it stays settled: a screen taller than the viewport scrolls first. */
  until: number;
  state: SceneState;
}

/** What the renderer needs for one frame: two shapes, the blend between them, and the camera. */
export interface Blend extends SceneNumbers {
  from: ShapeKey;
  to: ShapeKey;
  /** Eased blend from `from` to `to`, 0..1. */
  t: number;
  /** Scatter amplitude for this frame, peaking halfway through a transition. */
  scatter: number;
  mix: Mix;
  /**
   * How far the formation has been carried up with the page, in page-progress units (the renderer
   * multiplies by the scroll range): it rides with its screen while that scrolls, and the next one
   * rises from below during a move.
   */
  lift: number;
}

export type SectionId = 'hero' | 'ai' | 'reach' | 'blog' | 'team' | 'hot' | 'end';

const NUMERIC: readonly (keyof SceneNumbers)[] = [
  'spread',
  'scale',
  'yaw',
  'pitch',
  'roll',
  'spin',
  'size',
  'alpha',
  'ox',
  'oy',
  'oyN',
  'scaleN',
];

/** On phones every screen keeps its formation in a band across the top, the copy below it. */
const base: SceneNumbers = {
  spread: 1,
  scale: 1,
  yaw: 0,
  pitch: 0,
  roll: 0,
  spin: 0,
  size: 1,
  alpha: 0.9,
  ox: 0,
  oy: 0,
  oyN: -0.28,
  scaleN: 0.92,
};

/**
 * One formation per screen. Desktop alternates the stage — the side the copy leaves free — so the
 * page reads as a sequence of spreads: logo right, icons left, globe right, readers left, the team's
 * flow under its copy, stars in the top-right corner above the lists, and the logo again centred.
 */
export const SECTION_STATES: Record<SectionId, SceneState> = {
  hero: {
    ...base,
    shape: 'logo',
    scale: 0.8,
    size: 1.15,
    alpha: 1,
    ox: 0.24,
    oy: 0.03,
    oyN: 0.27,
    scaleN: 0.82,
    burst: 0.6,
    mix: [0.42, 0.18, 0.18, 0.1, 0.12],
  },
  ai: {
    ...base,
    shape: 'converge',
    scale: 0.84,
    size: 1,
    ox: -0.235,
    oy: 0.03,
    scaleN: 0.88,
    burst: 0.45,
    mix: [0.42, 0.16, 0.2, 0.08, 0.14],
  },
  reach: {
    ...base,
    shape: 'globe',
    scale: 0.94,
    size: 1.05,
    ox: 0.235,
    oy: 0.02,
    scaleN: 0.95,
    burst: 0.55,
    mix: [0.4, 0.2, 0.22, 0.06, 0.12],
  },
  blog: {
    ...base,
    shape: 'readers',
    scale: 0.9,
    size: 1.05,
    ox: -0.235,
    oy: 0.02,
    scaleN: 0.95,
    burst: 0.45,
    mix: [0.42, 0.14, 0.22, 0.1, 0.12],
  },
  team: {
    ...base,
    shape: 'flow',
    scale: 1.42,
    size: 1,
    ox: 0,
    oy: 0.25,
    scaleN: 1.08,
    burst: 0.4,
    mix: [0.42, 0.18, 0.2, 0.08, 0.12],
  },
  hot: {
    ...base,
    shape: 'rising',
    scale: 0.62,
    size: 1.05,
    ox: 0.25,
    oy: -0.15,
    scaleN: 0.82,
    burst: 0.45,
    mix: [0.36, 0.12, 0.2, 0.18, 0.14],
  },
  end: {
    ...base,
    shape: 'logo',
    scale: 0.5,
    size: 1.1,
    alpha: 1,
    ox: 0,
    oy: -0.19,
    oyN: -0.26,
    scaleN: 0.62,
    burst: 0,
    mix: [0.42, 0.14, 0.2, 0.12, 0.12],
  },
};

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (u: number) => {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Build the keyframe list from measured screen positions (page progress 0..1), sorted and de-duplicated.
 * `until` (default `at`) is where a screen taller than the viewport has finished scrolling by.
 */
export function framesFor(positions: { id: SectionId; at: number; until?: number }[]): Keyframe[] {
  const sorted = positions
    .map((p) => ({
      at: clamp01(p.at),
      until: clamp01(Math.max(p.at, p.until ?? p.at)),
      state: SECTION_STATES[p.id],
    }))
    .sort((a, b) => a.at - b.at)
    .filter((f, i, arr) => i === 0 || f.at > arr[i - 1].at + 1e-6);
  // A hold never runs into the next screen.
  sorted.forEach((f, i) => {
    const next = sorted[i + 1];
    if (next && f.until > next.at) f.until = next.at;
  });
  return sorted;
}

function settled(s: SceneState, lift = 0): Blend {
  const b = { from: s.shape, to: s.shape, t: 1, scatter: 0, mix: s.mix, lift } as Blend;
  for (const k of NUMERIC) b[k] = s[k];
  return b;
}

/** Index of the keyframe whose screen is the one in view at `progress` (the nearest hold). */
export function nearestFrame(frames: Keyframe[], progress: number): number {
  let best = 0;
  let bestD = Infinity;
  frames.forEach((f, i) => {
    const d = progress < f.at ? f.at - progress : progress > f.until ? progress - f.until : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The settled scene of whichever screen is nearest — for reduced motion, which swaps rather than morphs. */
export function nearest(frames: Keyframe[], progress: number): Blend {
  if (!frames.length) throw new Error('nearest: no keyframes');
  return settled(frames[nearestFrame(frames, progress)].state);
}

/**
 * Scene for a scroll progress. Inside a screen's hold it is that screen, settled (and carried up as
 * the screen scrolls). Between screens every number eases from one to the next, the colour mix
 * follows, and a scatter bump (the leaving screen's `burst`) peaks halfway, so the cloud flies apart
 * during the move and lands crisp on the next formation exactly when the page snaps.
 */
export function interpolate(frames: Keyframe[], progress: number): Blend {
  if (!frames.length) throw new Error('interpolate: no keyframes');
  const p = clamp01(progress);
  if (p <= frames[0].at) return settled(frames[0].state);
  const last = frames[frames.length - 1];
  if (p >= last.at)
    return settled(
      last.state,
      Math.min(p, last.until) - last.at + Math.max(0, p - last.until) * FOLLOW,
    );
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].at <= p) i++;
  const a = frames[i];
  const b = frames[i + 1];
  if (p <= a.until) return settled(a.state, p - a.at);
  const span = b.at - a.until;
  const u = span > 0 ? (p - a.until) / span : 1;
  const t = smoothstep(u);
  const liftA = a.until - a.at + (p - a.until) * FOLLOW;
  const liftB = (p - b.at) * FOLLOW;
  const out = {
    from: a.state.shape,
    to: b.state.shape,
    t,
    scatter: a.state.burst * Math.sin(u * Math.PI),
    lift: lerp(liftA, liftB, t),
  } as Blend;
  for (const k of NUMERIC) out[k] = lerp(a.state[k], b.state[k], t);
  out.mix = a.state.mix.map((v, k) => lerp(v, b.state.mix[k], t)) as unknown as Mix;
  return out;
}

/**
 * Cumulative colour thresholds for a mix, normalised to 1. A point with a fixed random `u` takes the
 * first colour whose threshold exceeds `u`, so colours shift smoothly as the mix changes.
 */
export function thresholds(mix: Mix): [number, number, number, number, number] {
  const total = mix.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return mix.map((v) => (acc += v / total)) as unknown as [number, number, number, number, number];
}
