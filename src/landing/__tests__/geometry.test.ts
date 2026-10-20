import { MARK } from '../../brand/paths.gen';
import {
  bounds,
  circle,
  hitTest,
  insidePolys,
  pathToPolys,
  sampleEdge,
  sampleMask,
  starPoly,
} from '../geometry';
import { GLYPH_ROWS, glyphCells, hasGlyph } from '../glyphs';
import { rng } from '../points';

describe('pathToPolys', () => {
  it('reads absolute and relative lines, H/V and implicit line-tos', () => {
    expect(pathToPolys('M0 0 L10 0 L10 10 L0 10Z')).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ]);
    expect(pathToPolys('m1 1 h4 v4 h-4z')).toEqual([
      [
        [1, 1],
        [5, 1],
        [5, 5],
        [1, 5],
      ],
    ]);
    expect(pathToPolys('M0 0 10 0 10 10Z')[0]).toHaveLength(3);
  });

  it('flattens curves through their end points and keeps sub-paths apart', () => {
    const [p] = pathToPolys('M0 0 C0 10 10 10 10 0 Q5 -5 0 0Z', 4);
    expect(p).toHaveLength(1 + 4 + 4);
    expect(p[4]).toEqual([10, 0]);
    expect(p[2][1]).toBeGreaterThan(5); // the curve bulges down
    expect(pathToPolys('M0 0 L1 0 L1 1Z M5 5 L6 5 L6 6Z')).toHaveLength(2);
  });

  it('parses the real logo mark into closed outlines inside its 100-unit box', () => {
    const body = pathToPolys(MARK.body);
    const pen = pathToPolys(MARK.pen);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(pen.length).toBe(3);
    const b = bounds([...body, ...pen]);
    expect(b.x0).toBeGreaterThan(0);
    expect(b.y0).toBeGreaterThan(0);
    expect(b.x1).toBeLessThan(100);
    expect(b.y1).toBeLessThan(100);
    // The apple's hollow middle is not ink; a point on the stroke is.
    expect(insidePolys(50, 64, body)).toBe(false);
    expect(insidePolys(21, 63, body)).toBe(true);
  });
});

describe('insidePolys', () => {
  it('is even-odd: a hole cut by an inner outline is outside', () => {
    const outer = circle(0, 0, 1, 32);
    const inner = circle(0, 0, 0.5, 32);
    expect(insidePolys(0.75, 0, [outer, inner])).toBe(true);
    expect(insidePolys(0, 0, [outer, inner])).toBe(false);
    expect(insidePolys(2, 0, [outer, inner])).toBe(false);
  });

  it('handles the concave star', () => {
    const star = [starPoly(0, 0, 1)];
    expect(insidePolys(0, 0, star)).toBe(true);
    expect(insidePolys(0, -0.9, star)).toBe(true);
    expect(insidePolys(0.6, -0.6, star)).toBe(false); // between two points
  });
});

describe('hitTest', () => {
  it(
    'agrees with insidePolys everywhere, on the real logo outline too',
    { timeout: 20_000 },
    () => {
      const body = pathToPolys(MARK.body);
      const test = hitTest(body);
      const rand = rng(7);
      for (let i = 0; i < 4000; i++) {
        const x = rand() * 110 - 5;
        const y = rand() * 110 - 5;
        expect(test(x, y)).toBe(insidePolys(x, y, body));
      }
    },
  );
});

describe('samplers', () => {
  it('sampleMask returns exactly k points, all inside the mask', () => {
    const rand = rng(1);
    const pts = sampleMask(
      200,
      rand,
      { x0: -1, y0: -1, x1: 1, y1: 1 },
      (x, y) => Math.hypot(x, y) < 0.5,
    );
    expect(pts).toHaveLength(200);
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeLessThan(0.5);
  });

  it('sampleMask never hangs on an empty mask', () => {
    const pts = sampleMask(10, rng(2), { x0: 0, y0: 0, x1: 2, y1: 2 }, () => false);
    expect(pts).toHaveLength(10);
    expect(pts[0]).toEqual([1, 1]);
  });

  it('sampleEdge spreads points along the outline, closed or open', () => {
    const square = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as [number, number][],
    ];
    const pts = sampleEdge(400, rng(3), square);
    expect(pts).toHaveLength(400);
    for (const [x, y] of pts) expect(Math.min(x, 1 - x, y, 1 - y)).toBeLessThan(1e-9);
    // Open: nothing on the closing side x = 0.
    const open = sampleEdge(400, rng(3), square, false);
    expect(open.filter(([x, y]) => x === 0 && y > 0 && y < 1)).toHaveLength(0);
  });
});

describe('glyphCells', () => {
  it('lays letters out on a 5×7 grid with one blank column between them', () => {
    const { cells, cols } = glyphCells('PDF');
    expect(cols).toBe(17);
    expect(cells.every(([c, r]) => c >= 0 && c < cols && r >= 0 && r < GLYPH_ROWS)).toBe(true);
    expect(glyphCells('I').cols).toBe(3);
    expect(glyphCells('mp4').cells).toEqual(glyphCells('MP4').cells);
  });

  it('leaves a gap for characters it does not know', () => {
    expect(glyphCells('?').cells).toHaveLength(0);
    expect(hasGlyph('?')).toBe(false);
    expect(hasGlyph('x')).toBe(true);
  });
});
