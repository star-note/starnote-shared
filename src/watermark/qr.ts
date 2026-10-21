/**
 * A minimal QR Code encoder (ISO/IEC 18004, byte mode, versions 1–40, levels L/M/Q/H) for the watermark's small code.
 * Pure TS, no DOM: the same matrix is painted by the browser and by Node canvases. Structure after Nayuki's public
 * reference implementation (function patterns → codewords + Reed–Solomon → zigzag placement → best of 8 masks).
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  version: number;
  ecc: QrEcc;
  mask: number;
  /** Modules per side (21 + 4 × (version − 1)). */
  size: number;
  /** Row-major: `modules[y][x]`, true = dark. */
  modules: boolean[][];
}

/* ------------------------------------------------------------------ tables (index 0 unused) */

// prettier-ignore
const ECC_PER_BLOCK: Record<QrEcc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
// prettier-ignore
const NUM_BLOCKS: Record<QrEcc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
/** The two format bits of each level. */
export const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

export const qrSize = (version: number) => version * 4 + 17;

/** Data + ECC modules of a version (everything but the function patterns). */
function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

/** How many data codewords a version / level holds. */
export function dataCodewords(ver: number, ecc: QrEcc): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver]! * NUM_BLOCKS[ecc][ver]!;
}

/** Block structure (for the encoder and for tests that read a code back). */
export function blockLayout(ver: number, ecc: QrEcc) {
  const numBlocks = NUM_BLOCKS[ecc][ver]!;
  const eccLen = ECC_PER_BLOCK[ecc][ver]!;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  return { numBlocks, eccLen, raw, numShort, shortLen };
}

/** Alignment pattern centres of a version. */
export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const out = [6];
  for (let pos = qrSize(ver) - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/* ------------------------------------------------------------------ Reed–Solomon over GF(2^8) / 0x11D */

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j]!, root);
      if (j + 1 < r.length) r[j]! ^= r[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ r.shift()!;
    r.push(0);
    divisor.forEach((d, i) => (r[i]! ^= gfMul(d, factor)));
  }
  return r;
}

/* ------------------------------------------------------------------ BCH codes */

export function formatBits(ecc: QrEcc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/* ------------------------------------------------------------------ data */

export function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

const countBits = (ver: number) => (ver <= 9 ? 8 : 16);

function fits(bytes: number, ver: number, ecc: QrEcc): boolean {
  return 4 + countBits(ver) + bytes * 8 <= dataCodewords(ver, ecc) * 8;
}

/** The smallest version that holds `bytes` at `ecc` (null when nothing up to 40 does). */
export function qrVersionFor(bytes: number, ecc: QrEcc, min = 1): number | null {
  for (let v = Math.max(1, min); v <= 40; v++) if (fits(bytes, v, ecc)) return v;
  return null;
}

function dataCodewordsFor(bytes: number[], ver: number, ecc: QrEcc): number[] {
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits(ver));
  bytes.forEach((b) => push(b, 8));
  const cap = dataCodewords(ver, ecc) * 8;
  push(0, Math.min(4, cap - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

function withEcc(data: number[], ver: number, ecc: QrEcc): number[] {
  const { numBlocks, eccLen, numShort, shortLen } = blockLayout(ver, ecc);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const e = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(e));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]!);
    });
  return out;
}

/* ------------------------------------------------------------------ matrix */

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Matrix {
  readonly ver: number;
  readonly size: number;
  readonly m: boolean[][];
  readonly fn: boolean[][];
  constructor(ver: number) {
    this.ver = ver;
    this.size = qrSize(ver);
    this.m = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.m[y]![x] = dark;
    this.fn[y]![x] = true;
  }
  functionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [s - 4, 3],
      [3, s - 4],
    ] as const)
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < s && y >= 0 && y < s) this.set(x, y, d !== 2 && d !== 4);
        }
    const al = alignmentPositions(this.ver);
    const n = al.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            this.set(al[i]! + dx, al[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    this.format(0); // reserve
    if (this.ver >= 7) {
      const b = versionBits(this.ver);
      for (let i = 0; i < 18; i++) {
        const a = s - 11 + (i % 3);
        const c = Math.floor(i / 3);
        this.set(a, c, bit(b, i));
        this.set(c, a, bit(b, i));
      }
    }
  }
  format(bits: number) {
    const s = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(bits, i));
    this.set(8, s - 8, true);
  }
  codewords(data: number[]) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < s; v++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? s - 1 - v : v;
          if (!this.fn[y]![x] && i < data.length * 8) {
            this.m[y]![x] = bit(data[i >>> 3]!, 7 - (i & 7));
            i++;
          }
        }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++)
        if (!this.fn[y]![x] && maskBit(mask, x, y)) this.m[y]![x] = !this.m[y]![x];
  }
  penalty(): number {
    const s = this.size;
    const m = this.m;
    let p = 0;
    const line = (get: (i: number) => boolean) => {
      let run = 1;
      for (let i = 1; i <= s; i++) {
        if (i < s && get(i) === get(i - 1)) run++;
        else {
          if (run >= 5) p += 3 + (run - 5);
          run = 1;
        }
      }
      // 1:1:3:1:1 finder-like runs with four light modules on either side
      for (let i = 0; i + 10 < s; i++) {
        const pat = [1, 0, 1, 1, 1, 0, 1];
        const at = (k: number) => get(i + k);
        const core = (o: number) => pat.every((b, k) => at(o + k) === (b === 1));
        const light = (o: number) => [0, 1, 2, 3].every((k) => !at(o + k));
        if ((core(0) && light(7)) || (light(0) && core(4))) p += 40;
      }
    };
    for (let y = 0; y < s; y++) line((i) => m[y]![i]!);
    for (let x = 0; x < s; x++) line((i) => m[i]![x]!);
    for (let y = 0; y < s - 1; y++)
      for (let x = 0; x < s - 1; x++) {
        const c = m[y]![x];
        if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) p += 3;
      }
    let dark = 0;
    m.forEach((r) => r.forEach((d) => (dark += d ? 1 : 0)));
    const total = s * s;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  }
}

/**
 * Encodes `text` (UTF-8, byte mode) in the smallest version that fits. `mask` forces one of the 8 masks
 * (tests); otherwise the one with the lowest penalty wins.
 */
export function encodeQr(
  text: string,
  opts: { ecc?: QrEcc; minVersion?: number; mask?: number } = {},
): QrCode {
  const ecc = opts.ecc ?? 'M';
  const bytes = utf8Bytes(text);
  const ver = qrVersionFor(bytes.length, ecc, opts.minVersion);
  if (ver === null) throw new Error('二维码内容太长');
  const code = withEcc(dataCodewordsFor(bytes, ver, ecc), ver, ecc);
  const build = (mask: number) => {
    const mx = new Matrix(ver);
    mx.functionPatterns();
    mx.codewords(code);
    mx.applyMask(mask);
    mx.format(formatBits(ecc, mask));
    return mx;
  };
  let best: Matrix | null = null;
  let bestMask = 0;
  let bestP = Infinity;
  const masks = opts.mask !== undefined ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const k of masks) {
    const mx = build(k);
    const p = masks.length > 1 ? mx.penalty() : 0;
    if (p < bestP) {
      best = mx;
      bestMask = k;
      bestP = p;
    }
  }
  return { version: ver, ecc, mask: bestMask, size: best!.size, modules: best!.m };
}

/** Which modules are function patterns (finder / timing / alignment / format / version) — for readers and tests. */
export function functionModules(ver: number): boolean[][] {
  const mx = new Matrix(ver);
  mx.functionPatterns();
  return mx.fn;
}
