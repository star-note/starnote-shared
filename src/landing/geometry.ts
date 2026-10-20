/**
 * Just enough 2D geometry to turn outlines into particle targets: an SVG path flattener (absolute and
 * relative M L H V C Q Z — what the generated brand paths use), even-odd hit testing, and samplers
 * that fill a mask or walk its edge. Pure functions, so the shapes they build are deterministic and
 * testable without a canvas.
 */
export type Pt = readonly [number, number];
export type Poly = Pt[];
export type Rand = () => number;

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** Flatten an SVG path into closed polygons, `steps` segments per curve. */
export function pathToPolys(d: string, steps = 8): Poly[] {
  const polys: Poly[] = [];
  let cur: Poly = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const close = () => {
    if (cur.length > 2) polys.push(cur);
    cur = [];
  };
  const tokens = d.match(/[MLHVCQZmlhvcqz]|[^MLHVCQZmlhvcqz]+/g) ?? [];
  let cmd = '';
  for (const tok of tokens) {
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok;
      if (cmd === 'Z' || cmd === 'z') {
        close();
        x = sx;
        y = sy;
      }
      continue;
    }
    const n = (tok.match(NUM) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const ox = () => (rel ? x : 0);
    const oy = () => (rel ? y : 0);
    let i = 0;
    while (i < n.length) {
      switch (cmd.toUpperCase()) {
        case 'M': {
          close();
          x = n[i] + ox();
          y = n[i + 1] + oy();
          sx = x;
          sy = y;
          cur.push([x, y]);
          i += 2;
          cmd = rel ? 'l' : 'L'; // further pairs are implicit line-tos
          break;
        }
        case 'L':
          x = n[i] + ox();
          y = n[i + 1] + oy();
          cur.push([x, y]);
          i += 2;
          break;
        case 'H':
          x = n[i] + ox();
          cur.push([x, y]);
          i += 1;
          break;
        case 'V':
          y = n[i] + oy();
          cur.push([x, y]);
          i += 1;
          break;
        case 'C': {
          const [x1, y1, x2, y2, x3, y3] = [
            n[i] + ox(),
            n[i + 1] + oy(),
            n[i + 2] + ox(),
            n[i + 3] + oy(),
            n[i + 4] + ox(),
            n[i + 5] + oy(),
          ];
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const m = 1 - t;
            cur.push([
              m * m * m * x + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3,
              m * m * m * y + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3,
            ]);
          }
          x = x3;
          y = y3;
          i += 6;
          break;
        }
        case 'Q': {
          const [x1, y1, x2, y2] = [n[i] + ox(), n[i + 1] + oy(), n[i + 2] + ox(), n[i + 3] + oy()];
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const m = 1 - t;
            cur.push([
              m * m * x + 2 * m * t * x1 + t * t * x2,
              m * m * y + 2 * m * t * y1 + t * t * y2,
            ]);
          }
          x = x2;
          y = y2;
          i += 4;
          break;
        }
        default:
          i = n.length; // unsupported command: skip its numbers
      }
    }
  }
  close();
  return polys;
}

/** Even-odd hit test across every polygon, so holes and overlaps behave like `fill-rule: evenodd`. */
export function insidePolys(x: number, y: number, polys: readonly Poly[]): boolean {
  let hit = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/**
 * The same even-odd test, prepared for many queries: edges are bucketed into horizontal bands so
 * each query only crosses the few edges in its band — the logo outline has hundreds.
 */
export function hitTest(polys: readonly Poly[], bands = 64): (x: number, y: number) => boolean {
  const b = bounds(polys);
  const h = (b.y1 - b.y0) / bands || 1;
  const rows: number[][] = Array.from({ length: bands }, () => []);
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi === yj) continue;
      const lo = Math.max(0, Math.floor((Math.min(yi, yj) - b.y0) / h));
      const hi = Math.min(bands - 1, Math.floor((Math.max(yi, yj) - b.y0) / h));
      for (let r = lo; r <= hi; r++) rows[r].push(xi, yi, xj, yj);
    }
  }
  return (x, y) => {
    if (y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1) return false;
    const row = rows[Math.min(bands - 1, Math.floor((y - b.y0) / h))];
    let hit = false;
    for (let k = 0; k < row.length; k += 4) {
      const xi = row[k];
      const yi = row[k + 1];
      const xj = row[k + 2];
      const yj = row[k + 3];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bounds(polys: readonly Poly[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < b.x0) b.x0 = x;
      if (y < b.y0) b.y0 = y;
      if (x > b.x1) b.x1 = x;
      if (y > b.y1) b.y1 = y;
    }
  return b;
}

/** Map polygons through `f` (e.g. normalise into the unit box). */
export function mapPolys(polys: readonly Poly[], f: (x: number, y: number) => Pt): Poly[] {
  return polys.map((p) => p.map(([x, y]) => f(x, y)));
}

/**
 * `k` uniform points inside a mask (rejection sampling in its box). Never loops forever: after a
 * generous number of misses it repeats points already found, or the box centre if none were.
 */
export function sampleMask(
  k: number,
  rand: Rand,
  box: Box,
  test: (x: number, y: number) => boolean,
): Pt[] {
  const out: Pt[] = [];
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  let tries = k * 400 + 200;
  while (out.length < k && tries-- > 0) {
    const x = box.x0 + rand() * w;
    const y = box.y0 + rand() * h;
    if (test(x, y)) out.push([x, y]);
  }
  const found = out.length;
  while (out.length < k)
    out.push(found ? out[Math.floor(rand() * found)] : [box.x0 + w / 2, box.y0 + h / 2]);
  return out;
}

/** `k` points spread evenly (with jitter) along the outlines, open polylines when `closed` is false. */
export function sampleEdge(k: number, rand: Rand, polys: readonly Poly[], closed = true): Pt[] {
  const segs: [number, number, number, number, number][] = [];
  let total = 0;
  for (const p of polys) {
    const m = closed ? p.length : p.length - 1;
    for (let i = 0; i < m; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[(i + 1) % p.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (len <= 0) continue;
      segs.push([ax, ay, bx, by, len]);
      total += len;
    }
  }
  if (!segs.length || total <= 0)
    return Array.from({ length: k }, () => (polys[0]?.[0] ?? [0, 0]) as Pt);
  const out: Pt[] = [];
  let s = 0;
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const d = ((i + rand()) / k) * total;
    while (s < segs.length - 1 && acc + segs[s][4] < d) acc += segs[s++][4];
    const [ax, ay, bx, by, len] = segs[s];
    const t = Math.min(1, Math.max(0, (d - acc) / len));
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

/** A regular polygon / circle outline (n vertices), as a closed polygon. */
export function circle(cx: number, cy: number, r: number, n = 48, rx = r): Poly {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * r] as Pt;
  });
}

/** Five-pointed star outline, point up, inner radius `inner` × outer. */
export function starPoly(cx: number, cy: number, R: number, inner = 0.45): Poly {
  return Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? R * inner : R;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}
