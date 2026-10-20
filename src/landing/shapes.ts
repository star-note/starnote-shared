import {
  bounds,
  circle,
  hitTest,
  mapPolys,
  pathToPolys,
  sampleEdge,
  sampleMask,
  starPoly,
  type Box,
  type Poly,
  type Pt,
  type Rand,
} from './geometry';
import { GLYPH_ROWS, glyphCells } from './glyphs';
import { AVATAR_TONES, TONE, type Tone } from './palette';
import { rng } from './points';
import { MARK } from '../brand/paths.gen';

/**
 * The cloud's vocabulary: one formation per landing screen, built from recognisable things — the
 * logo mark, document-format icons, reader avatars, stars — so the sparks gather into objects, not
 * abstractions. Every formation is `n` points in a unit design box (x, y ∈ [-0.5, 0.5] give or take a
 * halo, y down, z towards the viewer) so any two can be interpolated point for point. Points also
 * carry a fixed colour (`tone`, or `TONE.mix` to follow the scene's mix) and an opacity.
 */
export type ShapeKey = 'logo' | 'converge' | 'globe' | 'readers' | 'flow' | 'rising';

export const SHAPE_KEYS: readonly ShapeKey[] = [
  'logo',
  'converge',
  'globe',
  'readers',
  'flow',
  'rising',
];

export interface Shape {
  /** Interleaved xyz, `3 * n` floats. */
  xyz: Float32Array;
  /** Palette index per point, or `TONE.mix`. */
  tone: Uint8Array;
  /** Opacity per point, 0..255. */
  alpha: Uint8Array;
}

/** The format labels the document icons wear, in fan order. */
export const DOC_LABELS = ['PDF', 'DOC', 'MD', 'XLS', 'PPT', 'IMG', 'MP4'] as const;

const TAU = Math.PI * 2;

/** Split `n` points across parts in proportion to `weights`; the last part absorbs rounding. */
export function share(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < weights.length; i++) {
    const k = i === weights.length - 1 ? n - used : Math.round((n * weights[i]) / total);
    out.push(Math.max(0, k));
    used += k;
  }
  return out;
}

/** Roughly normal in [-1, 1] (sum of three uniforms), cheap and good enough for soft edges. */
const soft = (rand: Rand) => (rand() + rand() + rand()) / 1.5 - 1;

/** Where a primitive drawn in its own unit box lands: centre, size, rotation, depth. */
interface Place {
  x: number;
  y: number;
  s: number;
  r?: number;
  z?: number;
}

type ToneOf = Tone | ((x: number, y: number) => Tone);

/** Appends points to one formation; `finish` pads any shortfall with dust so the count is exact. */
class Writer {
  i = 0;
  readonly xyz: Float32Array;
  readonly tone: Uint8Array;
  readonly alpha: Uint8Array;
  constructor(
    readonly n: number,
    readonly rand: Rand,
  ) {
    this.xyz = new Float32Array(n * 3);
    this.tone = new Uint8Array(n).fill(TONE.mix);
    this.alpha = new Uint8Array(n).fill(255);
  }

  put(x: number, y: number, z: number, tone: Tone, a: number) {
    if (this.i >= this.n) return;
    const i = this.i++;
    this.xyz[i * 3] = x;
    this.xyz[i * 3 + 1] = y;
    this.xyz[i * 3 + 2] = z;
    this.tone[i] = tone;
    this.alpha[i] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }

  /** Local points through a placement. */
  place(pts: readonly Pt[], at: Place, tone: ToneOf, a = 1, depth = 0.004) {
    const c = Math.cos(at.r ?? 0);
    const s = Math.sin(at.r ?? 0);
    for (const [lx, ly] of pts) {
      const t = typeof tone === 'function' ? tone(lx, ly) : tone;
      this.put(
        at.x + (lx * c - ly * s) * at.s,
        at.y + (lx * s + ly * c) * at.s,
        (at.z ?? 0) + soft(this.rand) * depth,
        t,
        a,
      );
    }
  }

  /** Sparse, dim sparks across the box so the sky never empties around a formation. */
  dust(k: number, rx = 0.5, ry = 0.46) {
    const r = this.rand;
    for (let j = 0; j < k; j++)
      this.put((r() * 2 - 1) * rx, (r() * 2 - 1) * ry, soft(r) * 0.18, TONE.mix, 0.18 + r() * 0.3);
  }

  finish(): Shape {
    this.dust(this.n - this.i);
    return { xyz: this.xyz, tone: this.tone, alpha: this.alpha };
  }
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
const tests = new WeakMap<readonly Poly[], (x: number, y: number) => boolean>();
const fill = (w: Writer, k: number, polys: readonly Poly[]) => {
  let test = tests.get(polys);
  if (!test) tests.set(polys, (test = hitTest(polys)));
  return sampleMask(k, w.rand, bounds(polys), test);
};

/** Points on short horizontal strokes — text lines. `rows` are [y, x0, length]. */
function textLines(
  w: Writer,
  k: number,
  rows: readonly (readonly [number, number, number])[],
  thick: number,
): Pt[] {
  const counts = share(
    k,
    rows.map((r) => r[2]),
  );
  const out: Pt[] = [];
  rows.forEach(([y, x0, len], r) => {
    for (let j = 0; j < counts[r]; j++) out.push([x0 + w.rand() * len, y + soft(w.rand) * thick]);
  });
  return out;
}

/** A label in the pixel font, centred on (cx, cy), at most `maxW` wide and `maxH` tall. */
function label(
  w: Writer,
  k: number,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): Pt[] {
  const { cells, cols } = glyphCells(text);
  if (!cells.length) return [];
  const cell = Math.min(maxW / cols, maxH / GLYPH_ROWS);
  const x0 = cx - (cols * cell) / 2;
  const y0 = cy - (GLYPH_ROWS * cell) / 2;
  const out: Pt[] = [];
  for (let j = 0; j < k; j++) {
    const [c, r] = cells[j % cells.length];
    out.push([x0 + (c + 0.1 + w.rand() * 0.8) * cell, y0 + (r + 0.1 + w.rand() * 0.8) * cell]);
  }
  return out;
}

// ---- primitives, each drawn in its own unit box and placed ----

const PAGE_W = 0.37;
const PAGE_FOLD = 0.24;
const PAGE: Poly = [
  [-PAGE_W, -0.5],
  [PAGE_W - PAGE_FOLD, -0.5],
  [PAGE_W, -0.5 + PAGE_FOLD],
  [PAGE_W, 0.5],
  [-PAGE_W, 0.5],
];
const FOLD: Poly = [
  [PAGE_W - PAGE_FOLD, -0.5],
  [PAGE_W - PAGE_FOLD, -0.5 + PAGE_FOLD],
  [PAGE_W, -0.5 + PAGE_FOLD],
];

/** A page with a folded corner wearing a format label (PDF, DOC…), or a full page of text. */
function page(
  w: Writer,
  k: number,
  at: Place,
  opts: { label?: string; labelTone?: Tone; lines?: number; a?: number } = {},
) {
  const a = opts.a ?? 1;
  const hasLabel = !!opts.label;
  const [kEdge, kFold, kLabel, kLines] = share(
    k,
    hasLabel ? [0.38, 0.07, 0.55, 0] : [0.4, 0.07, 0, 0.53],
  );
  w.place(sampleEdge(kEdge, w.rand, [PAGE]), at, TONE.white, 0.9 * a);
  w.place(sampleEdge(kFold, w.rand, [FOLD], false), at, TONE.lilac, 0.9 * a);
  if (hasLabel) {
    w.place(label(w, kLabel, opts.label!, 0, 0.12, 0.6, 0.36), at, opts.labelTone ?? TONE.amber, a);
    return;
  }
  // A page of writing: a title, then body lines of natural, uneven length.
  const lens = [0.62, 0.66, 0.5, 0.64, 0.58, 0.36, 0.66, 0.6, 0.44];
  const n = Math.max(1, opts.lines ?? 6);
  const rows: [number, number, number][] = [[-0.27, -0.26, 0.34]];
  const gap = 0.66 / (n + 1);
  for (let r = 0; r < n; r++)
    rows.push([-0.12 + r * gap, -0.26, lens[r % lens.length] * (r === n - 1 ? 0.6 : 1)]);
  const [kTitle, kBody] = share(kLines, [0.2, 0.8]);
  w.place(textLines(w, kTitle, rows.slice(0, 1), 0.018), at, TONE.white, a);
  w.place(
    textLines(w, kBody, rows.slice(1), 0.009),
    at,
    (x) => (x < -0.1 ? TONE.lilac : TONE.violet),
    0.85 * a,
  );
}

/** A round avatar: a ring with a head-and-shoulders silhouette or an initial. Illustrative, nobody real. */
function avatar(w: Writer, k: number, at: Place, initial: string | null, tone: Tone) {
  const [kRing, kIn] = share(k, [0.42, 0.58]);
  w.place(sampleEdge(kRing, w.rand, [circle(0, 0, 0.5, 64)]), at, tone, 0.95);
  if (initial) {
    w.place(label(w, kIn, initial, 0, 0, 0.42, 0.5), at, TONE.white, 0.95);
    return;
  }
  const [kHead, kBody] = share(kIn, [0.4, 0.6]);
  w.place(
    sampleMask(
      kHead,
      w.rand,
      box(-0.18, -0.28, 0.18, 0.08),
      (x, y) => Math.hypot(x, y + 0.1) <= 0.17,
    ),
    at,
    tone,
    0.9,
  );
  w.place(
    sampleMask(
      kBody,
      w.rand,
      box(-0.44, 0.12, 0.44, 0.46),
      (x, y) => (x / 0.33) ** 2 + ((y - 0.44) / 0.28) ** 2 <= 1 && Math.hypot(x, y) <= 0.44,
    ),
    at,
    tone,
    0.9,
  );
}

/** A five-pointed star; the 🌟 version wears a soft halo and four short rays. */
function star(w: Writer, k: number, at: Place, tone: Tone, glow = false) {
  const poly = [starPoly(0, 0, 0.5, 0.46)];
  const [kFill, kEdge, kHalo] = share(k, glow ? [0.52, 0.26, 0.22] : [0.64, 0.36, 0]);
  w.place(fill(w, kFill, poly), at, tone, 0.95);
  w.place(sampleEdge(kEdge, w.rand, poly), at, TONE.white, 0.9);
  if (!glow) return;
  const r = w.rand;
  const halo: Pt[] = [];
  for (let j = 0; j < kHalo; j++) {
    if (j % 2) {
      const a = r() * TAU;
      const d = 0.56 + r() * r() * 0.34;
      halo.push([Math.cos(a) * d, Math.sin(a) * d]);
    } else {
      const ray = (j >> 1) % 4;
      const d = 0.58 + r() * 0.3;
      const a = (ray * Math.PI) / 2 + Math.PI / 4;
      halo.push([Math.cos(a) * d + soft(r) * 0.008, Math.sin(a) * d + soft(r) * 0.008]);
    }
  }
  w.place(halo, at, TONE.amber, 0.55);
}

/** The four-pointed spark that marks AI at work. */
function sparkle(w: Writer, k: number, at: Place, tone: Tone) {
  const q = 0.11;
  const poly: Poly = [
    [0, -0.5],
    [q, -q],
    [0.5, 0],
    [q, q],
    [0, 0.5],
    [-q, q],
    [-0.5, 0],
    [-q, -q],
  ];
  w.place(fill(w, k, [poly]), at, tone, 1);
}

/** A platform as a dot in a ring. */
function disc(w: Writer, k: number, at: Place, tone: Tone) {
  const [kRing, kDot] = share(k, [0.6, 0.4]);
  w.place(sampleEdge(kRing, w.rand, [circle(0, 0, 0.5, 40)]), at, tone, 0.9);
  w.place(
    sampleMask(kDot, w.rand, box(-0.2, -0.2, 0.2, 0.2), (x, y) => Math.hypot(x, y) <= 0.19),
    at,
    TONE.white,
    0.9,
  );
}

/** The logo mark, from the real outline in `paths.gen.ts`: the C+J apple stroke and its pencil. */
const LOGO = (() => {
  const body = pathToPolys(MARK.body, 4);
  const pen = pathToPolys(MARK.pen, 1);
  const b = bounds([...body, ...pen]);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const k = 1 / (b.y1 - b.y0);
  const f = (x: number, y: number): Pt => [(x - cx) * k, (y - cy) * k];
  return {
    body: mapPolys(body, f),
    pen: mapPolys(pen, f),
    /** The first pen piece is the graphite tip. */
    tip: mapPolys(pen.slice(0, 1), f),
    horizon: (MARK.sea.horizon - cy) * k,
    sparks: MARK.sparks.map(([x, y, r]) => [...f(x, y), r * k] as const),
    width: (b.x1 - b.x0) * k,
  };
})();

/** Exposed for tests: the normalised logo outline (height 1, centred). */
export const LOGO_POLYS: readonly Poly[] = LOGO.body;

function logo(w: Writer, k: number, at: Place) {
  const [kBody, kEdge, kPen, kPenEdge, kSparks] = share(k, [0.56, 0.2, 0.1, 0.07, 0.07]);
  const r = w.rand;
  // Night sky above the horizon, sea below — the brand's own split, in the spark palette.
  const bodyTone = (_x: number, y: number): Tone =>
    y < LOGO.horizon ? (r() < 0.6 ? TONE.violet : TONE.lilac) : r() < 0.6 ? TONE.sky : TONE.teal;
  w.place(fill(w, kBody, LOGO.body), at, bodyTone, 0.95);
  w.place(
    sampleEdge(kEdge, r, LOGO.body),
    at,
    (_x, y) => (y < LOGO.horizon ? TONE.lilac : TONE.sky),
    1,
  );
  const tipBox = bounds(LOGO.tip);
  w.place(
    fill(w, kPen, LOGO.pen),
    at,
    (x, y) => (x <= tipBox.x1 && y >= tipBox.y0 ? TONE.amber : TONE.white),
    1,
  );
  w.place(sampleEdge(kPenEdge, r, LOGO.pen), at, TONE.white, 1);
  const sparks: Pt[] = [];
  for (let j = 0; j < kSparks; j++) {
    const [sx, sy, sr] = LOGO.sparks[j % LOGO.sparks.length];
    const a = r() * TAU;
    const d = Math.sqrt(r()) * sr;
    sparks.push([sx + Math.cos(a) * d, sy + Math.sin(a) * d]);
  }
  w.place(sparks, at, TONE.white, 1);
}

// ---- formations ----

type Gen = (n: number, rand: Rand) => Shape;

/** Hero and closing: the sparks condense into the logo, a thin halo of stragglers around it. */
const logoShape: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const [kLogo, kHalo] = share(n, [0.9, 0.1]);
  logo(w, kLogo, { x: 0, y: 0, s: 0.88 });
  for (let j = 0; j < kHalo; j++) {
    const a = rand() * TAU;
    const d = 0.46 + Math.sqrt(rand()) * 0.14;
    w.put(
      Math.cos(a) * d * 0.9,
      Math.sin(a) * d,
      soft(rand) * 0.12,
      TONE.mix,
      0.15 + rand() * 0.25,
    );
  }
  return w.finish();
};

/** AI writes and publishes: a fan of format icons on the left streams into one page of writing. */
const converge: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const [kPage, kSpark, kFan, kTrails] = share(n, [0.3, 0.025, 0.53, 0.085, 0.06]);
  const pg: Place = { x: 0.23, y: 0, s: 0.62 };
  page(w, kPage, pg, { lines: 8 });
  sparkle(w, kSpark, { x: pg.x + PAGE_W * pg.s + 0.035, y: -0.36, s: 0.11 }, TONE.amber);
  const icons = share(
    kFan,
    DOC_LABELS.map(() => 1),
  );
  const pivot = { x: -0.02, y: 0 };
  const R = 0.44;
  const ends: Pt[] = [];
  DOC_LABELS.forEach((lab, i) => {
    const a = ((110 + (140 * i) / (DOC_LABELS.length - 1)) * Math.PI) / 180;
    const at: Place = {
      x: pivot.x + Math.cos(a) * R,
      y: pivot.y - Math.sin(a) * R,
      s: 0.16,
      r: (a - Math.PI) * 0.45,
    };
    page(w, icons[i], at, { label: lab, labelTone: i % 2 ? TONE.lilac : TONE.amber });
    ends.push([at.x + 0.07, at.y]);
  });
  // Converging trails: each icon's stream bends into the page's left edge.
  const left = pg.x - PAGE_W * pg.s - 0.012;
  const trail: Pt[] = [];
  for (let j = 0; j < kTrails; j++) {
    const [ex, ey] = ends[j % ends.length];
    const t = Math.sqrt(rand());
    const tx = left;
    const ty = ey * 0.35;
    const mx = (ex + tx) / 2;
    const my = ey * 0.9;
    const u = 1 - t;
    trail.push([
      u * u * ex + 2 * u * t * mx + t * t * tx + soft(rand) * 0.003,
      u * u * ey + 2 * u * t * my + t * t * ty + soft(rand) * 0.003,
    ]);
  }
  w.place(trail, { x: 0, y: 0, s: 1 }, TONE.mix, 0.6);
  return w.finish();
};

/** Positions of the small icons scattered over the globe: longitude, latitude in degrees. */
const GLOBE_SPOTS: readonly (readonly [number, number])[] = [
  [-62, 22],
  [-38, 46],
  [-6, 58],
  [26, 42],
  [56, 22],
  [-48, -10],
  [-20, 20],
  [18, 12],
  [46, -8],
  [-30, -36],
  [8, -30],
  [38, -40],
];

/** At home and abroad: the page bursts into small documents and platforms spread over a globe. */
const globe: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const R = 0.36;
  const cy = 0.03;
  const [kLimb, kGrid, kIcons, kArcs, kOrigin] = share(n, [0.1, 0.3, 0.36, 0.11, 0.06, 0.07]);
  // The globe is tilted so its north pole leans towards the viewer and the latitudes curve.
  const tilt = -0.38;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const sph = (lon: number, lat: number, rad = R): [number, number, number] => {
    const lo = (lon * Math.PI) / 180;
    const la = (lat * Math.PI) / 180;
    const y = -rad * Math.sin(la);
    const z = rad * Math.cos(la) * Math.cos(lo);
    return [rad * Math.cos(la) * Math.sin(lo), cy + y * ct - z * st, y * st + z * ct];
  };
  // The limb, crisp, then a graticule of five latitudes and six meridians, the far side fainter.
  w.place(sampleEdge(kLimb, rand, [circle(0, cy, R, 120)]), { x: 0, y: 0, s: 1 }, TONE.lilac, 0.8);
  const lats = [-50, -25, 0, 25, 50];
  const [kLat, kLon] = share(kGrid, [0.5, 0.5]);
  for (let j = 0; j < kLat; j++) {
    const [x, y, z] = sph(rand() * 360, lats[j % lats.length]);
    w.put(x, y, z, z > 0 ? (j & 1 ? TONE.lilac : TONE.violet) : TONE.deep, z > 0 ? 0.7 : 0.35);
  }
  for (let j = 0; j < kLon; j++) {
    const [x, y, z] = sph((j % 6) * 30, rand() * 360 - 180);
    w.put(x, y, z, z > 0 ? (j & 1 ? TONE.lilac : TONE.violet) : TONE.deep, z > 0 ? 0.65 : 0.3);
  }
  // Small icons sitting just above the surface, facing the viewer.
  const counts = share(
    kIcons,
    GLOBE_SPOTS.map((_, i) => (i % 3 === 1 ? 0.75 : 1)),
  );
  const tones = [TONE.amber, TONE.lilac, TONE.white];
  GLOBE_SPOTS.forEach(([lon, lat], i) => {
    const [x, y, z] = sph(lon, lat, R * 1.06);
    if (i % 3 === 1) disc(w, counts[i], { x, y, z, s: 0.058 }, tones[i % tones.length]);
    else page(w, counts[i], { x, y, z, s: 0.075 }, { lines: 2 });
  });
  // Arcs from the origin page, lifted off the surface, out to every icon.
  const unit = (lon: number, lat: number) => {
    const [x, y, z] = sph(lon, lat, 1);
    return [x, y - cy, z] as const;
  };
  const o = unit(0, 4);
  for (let j = 0; j < kArcs; j++) {
    const [lon, lat] = GLOBE_SPOTS[j % GLOBE_SPOTS.length];
    const d = unit(lon, lat);
    const t = rand();
    const lift = R * (1.04 + 0.14 * Math.sin(Math.PI * t));
    // A normalised lerp between the two directions is close enough to the great circle here.
    const ux = o[0] + (d[0] - o[0]) * t;
    const uy = o[1] + (d[1] - o[1]) * t;
    const uz = o[2] + (d[2] - o[2]) * t;
    const m = Math.hypot(ux, uy, uz) || 1;
    w.put((ux / m) * lift, cy + (uy / m) * lift, (uz / m) * lift, TONE.mix, 0.55);
  }
  const [ox, oy, oz] = sph(0, 4, R * 1.08);
  page(w, kOrigin, { x: ox, y: oy, z: oz, s: 0.11 }, { lines: 3 });
  return w.finish();
};

/** Your blog: readers gather round the logo — avatars on an orbit. */
const readers: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const count = 8;
  const [kLogo, kOrbit, kAvatars] = share(n, [0.34, 0.05, 0.54, 0.07]);
  logo(w, kLogo, { x: 0, y: 0, s: 0.42 });
  const orbit = 0.37;
  w.place(
    sampleEdge(kOrbit, rand, [circle(0, 0, orbit, 96)]),
    { x: 0, y: 0, s: 1 },
    TONE.mix,
    0.35,
  );
  const each = share(
    kAvatars,
    Array.from({ length: count }, () => 1),
  );
  const initials = ['L', 'S', 'M', 'J'];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * TAU + Math.PI / count;
    avatar(
      w,
      each[i],
      { x: Math.cos(a) * orbit, y: Math.sin(a) * orbit, s: 0.14 },
      i % 2 ? initials[(i >> 1) % initials.length] : null,
      AVATAR_TONES[i % AVATAR_TONES.length],
    );
  }
  return w.finish();
};

/** Teams: writer, editor and approver pass the piece through three gates to a published page. */
const flow: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const people = [-0.42, -0.14, 0.14];
  const gates = [-0.28, 0, 0.28];
  const end = 0.42;
  const [kLine, kPeople, kGates, kChecks, kPage] = share(n, [0.08, 0.4, 0.2, 0.07, 0.17, 0.05]);
  // The line the work travels along, broken where the avatars sit.
  const line: Pt[] = [];
  while (line.length < kLine) {
    const x = -0.46 + rand() * 0.84;
    if (people.some((p) => Math.abs(x - p) < 0.066) || Math.abs(x - end) < 0.08) continue;
    line.push([x, soft(rand) * 0.004]);
  }
  w.place(line, { x: 0, y: 0, s: 1 }, TONE.mix, 0.6);
  const each = share(
    kPeople,
    people.map(() => 1),
  );
  people.forEach((x, i) => avatar(w, each[i], { x, y: 0, s: 0.125 }, null, AVATAR_TONES[i]));
  // Gates: an arch the line passes under, with a check above once it is through.
  const arch: Poly = [
    [-0.5, 1],
    [-0.5, 0],
    ...Array.from({ length: 13 }, (_, k): Pt => [
      -0.5 * Math.cos((k / 12) * Math.PI),
      -0.5 * Math.sin((k / 12) * Math.PI),
    ]),
    [0.5, 0],
    [0.5, 1],
  ];
  const tick: Poly = [
    [-0.42, 0.02],
    [-0.12, 0.32],
    [0.46, -0.3],
  ];
  const gEach = share(
    kGates,
    gates.map(() => 1),
  );
  const cEach = share(
    kChecks,
    gates.map(() => 1),
  );
  gates.forEach((x, i) => {
    w.place(sampleEdge(gEach[i], rand, [arch], false), { x, y: -0.03, s: 0.085 }, TONE.lilac, 0.85);
    w.place(sampleEdge(cEach[i], rand, [tick], false), { x, y: -0.13, s: 0.06 }, TONE.amber, 1);
  });
  page(w, kPage, { x: end, y: 0, s: 0.17 }, { lines: 4 });
  return w.finish();
};

/** What is spreading: stars rising, each a little bigger and brighter than the last. */
const rising: Gen = (n, rand) => {
  const w = new Writer(n, rand);
  const count = 6;
  const stars = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      x: -0.36 + t * 0.72,
      y: 0.3 - t * 0.6 + Math.sin(t * Math.PI) * 0.06,
      s: 0.07 + t * 0.15,
    };
  });
  const [kStars, kTrails] = share(n, [0.76, 0.17, 0.07]);
  const each = share(
    kStars,
    stars.map((s, i) => s.s * (i === count - 1 ? 1.4 : 1)),
  );
  const tones = [TONE.lilac, TONE.white, TONE.lilac, TONE.amber, TONE.white, TONE.amber];
  stars.forEach((s, i) => star(w, each[i], { x: s.x, y: s.y, s: s.s }, tones[i], i === count - 1));
  // Each star leaves a short wake back down the way it came.
  const dx = -0.72;
  const dy = 0.6;
  const m = Math.hypot(dx, dy);
  const trails = share(
    kTrails,
    stars.map((s) => s.s),
  );
  stars.forEach((s, i) => {
    const len = 0.05 + s.s * 0.5;
    for (let j = 0; j < trails[i]; j++) {
      const t = rand() ** 1.6;
      const d = s.s * 0.42 + t * len;
      w.put(
        s.x + (dx / m) * d + soft(rand) * 0.004,
        s.y + (dy / m) * d + soft(rand) * 0.004,
        0,
        TONE.mix,
        0.7 * (1 - t),
      );
    }
  });
  return w.finish();
};

const GENERATORS: Record<ShapeKey, Gen> = {
  logo: logoShape,
  converge,
  globe,
  readers,
  flow,
  rising,
};

/**
 * Build every formation with `n` points. Each gets its own permutation so a point travels to a
 * different place in every scene instead of always sitting in the same corner.
 */
export function buildShapes(n: number, seed = 11): Record<ShapeKey, Shape> {
  const out = {} as Record<ShapeKey, Shape>;
  SHAPE_KEYS.forEach((key, k) => {
    const rand = rng(seed + k * 101);
    const shape = GENERATORS[key](n, rand);
    const { xyz, tone, alpha } = shape;
    // Fisher–Yates on whole points.
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      for (let c = 0; c < 3; c++) {
        const t = xyz[i * 3 + c];
        xyz[i * 3 + c] = xyz[j * 3 + c];
        xyz[j * 3 + c] = t;
      }
      const tt = tone[i];
      tone[i] = tone[j];
      tone[j] = tt;
      const ta = alpha[i];
      alpha[i] = alpha[j];
      alpha[j] = ta;
    }
    out[key] = shape;
  });
  return out;
}
