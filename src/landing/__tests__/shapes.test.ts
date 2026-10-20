import { insidePolys } from '../geometry';
import { hasGlyph } from '../glyphs';
import { PALETTE, TONE } from '../palette';
import { buildShapes, DOC_LABELS, LOGO_POLYS, share, SHAPE_KEYS, type Shape } from '../shapes';

describe('share', () => {
  it('splits n in proportion and hands the remainder to the last part', () => {
    expect(share(10, [1, 1])).toEqual([5, 5]);
    expect(share(10, [1, 2])).toEqual([3, 7]);
    expect(share(7, [1, 0, 1]).reduce((a, b) => a + b)).toBe(7);
    expect(share(5, [0, 0, 1])).toEqual([0, 0, 5]);
  });
});

const n = 3000;
const shapes = buildShapes(n);

const count = (
  s: Shape,
  f: (x: number, y: number, z: number, tone: number, alpha: number) => boolean,
) => {
  let k = 0;
  for (let i = 0; i < n; i++)
    if (f(s.xyz[i * 3], s.xyz[i * 3 + 1], s.xyz[i * 3 + 2], s.tone[i], s.alpha[i])) k++;
  return k;
};

describe('buildShapes', () => {
  it('builds every formation with exactly n finite points inside the design box, each with a valid tone', () => {
    for (const key of SHAPE_KEYS) {
      const { xyz, tone, alpha } = shapes[key];
      expect(xyz).toHaveLength(n * 3);
      expect(tone).toHaveLength(n);
      expect(alpha).toHaveLength(n);
      let worst = 0;
      for (let i = 0; i < xyz.length; i++)
        worst = Math.max(worst, Number.isFinite(xyz[i]) ? Math.abs(xyz[i]) : Infinity);
      expect(worst).toBeLessThanOrEqual(0.66);
      expect(tone.every((t) => t === TONE.mix || t < PALETTE.length)).toBe(true);
    }
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const again = buildShapes(n);
    expect(again.logo.xyz).toEqual(shapes.logo.xyz);
    expect(again.converge.tone).toEqual(shapes.converge.tone);
    expect(buildShapes(n, 99).logo.xyz).not.toEqual(shapes.logo.xyz);
  });

  it('works for small counts too (phones, tests) without losing points', () => {
    const tiny = buildShapes(120);
    for (const key of SHAPE_KEYS) expect(tiny[key].xyz).toHaveLength(360);
  });
});

describe('formations', () => {
  it('logo: most sparks sit on the real mark, sky violet above the sea', () => {
    const logo = shapes.logo;
    // The mark is drawn at 0.88 of the unit box; the stroke itself (not the pen or halo) holds over half.
    const onMark = count(logo, (x, y) => insidePolys(x / 0.88, y / 0.88, LOGO_POLYS));
    expect(onMark / n).toBeGreaterThan(0.5);
    expect(count(logo, (_x, _y, _z, t) => t === TONE.violet)).toBeGreaterThan(n * 0.1);
    expect(count(logo, (_x, _y, _z, t) => t === TONE.teal || t === TONE.sky)).toBeGreaterThan(
      n * 0.05,
    );
    expect(count(logo, (_x, _y, _z, t) => t === TONE.amber)).toBeGreaterThan(0); // the pencil tip
  });

  it('converge: a fan of labelled format icons on the left, one big page on the right', () => {
    const c = shapes.converge;
    expect(count(c, (x) => x < -0.08) / n).toBeGreaterThan(0.4);
    expect(count(c, (x) => x > 0.02) / n).toBeGreaterThan(0.25);
    // Labels alternate amber and lilac.
    expect(count(c, (x, _y, _z, t) => x < -0.08 && t === TONE.amber)).toBeGreaterThan(n * 0.05);
    expect(count(c, (x, _y, _z, t) => x < -0.08 && t === TONE.lilac)).toBeGreaterThan(n * 0.05);
    for (const label of DOC_LABELS) for (const ch of label) expect(hasGlyph(ch)).toBe(true);
  });

  it('globe: a crisp limb around the centre and icons on the near side', () => {
    const g = shapes.globe;
    expect(count(g, (x, y) => Math.abs(Math.hypot(x, y - 0.03) - 0.36) < 0.01) / n).toBeGreaterThan(
      0.08,
    );
    expect(count(g, (_x, _y, z) => z > 0.1) / n).toBeGreaterThan(0.4);
  });

  it('readers: the logo in the middle and accent-coloured avatars on an orbit', () => {
    const r = shapes.readers;
    expect(count(r, (x, y) => Math.hypot(x, y) < 0.22) / n).toBeGreaterThan(0.28);
    for (const tone of [TONE.teal, TONE.rose, TONE.sky])
      expect(count(r, (x, y, _z, t) => t === tone && Math.hypot(x, y) > 0.28)).toBeGreaterThan(
        n * 0.02,
      );
  });

  it('flow: a flat horizontal band of people, gates and a page', () => {
    const f = shapes.flow;
    expect(count(f, (_x, y) => Math.abs(y) < 0.18) / n).toBeGreaterThan(0.85);
    expect(count(f, (x) => x < -0.3) / n).toBeGreaterThan(0.08);
    expect(count(f, (x) => x > 0.3) / n).toBeGreaterThan(0.08);
  });

  it('rising: stars climb to the right, the brightest last', () => {
    const s = shapes.rising;
    let left = 0;
    let right = 0;
    let nl = 0;
    let nr = 0;
    for (let i = 0; i < n; i++) {
      const x = s.xyz[i * 3];
      const y = s.xyz[i * 3 + 1];
      if (x < -0.15) {
        left += y;
        nl++;
      } else if (x > 0.15) {
        right += y;
        nr++;
      }
    }
    expect(right / nr).toBeLessThan(left / nl - 0.2);
    expect(count(s, (x, _y, _z, t) => x > 0.2 && t === TONE.amber)).toBeGreaterThan(n * 0.1);
  });
});
