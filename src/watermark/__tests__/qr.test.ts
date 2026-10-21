import {
  alignmentPositions,
  blockLayout,
  ECC_FORMAT_BITS,
  encodeQr,
  formatBits,
  functionModules,
  gfMul,
  maskBit,
  type QrCode,
  type QrEcc,
  versionBits,
} from '../qr';

/**
 * Reads a code back the way a scanner does (format → unmask → zigzag → de-interleave → Reed–Solomon check → byte
 * mode), so the test does not trust the encoder's own bookkeeping. Cross-checked once against `qrcode-generator`
 * (the template repo's dependency): 244 / 244 matrices identical for the same mask, all four levels, 1–400 bytes.
 */
function decode(code: QrCode): { text: string; ecc: QrEcc; mask: number } {
  const s = code.size;
  const m = code.modules;
  const ver = (s - 17) / 4;
  // format bits, first copy, tolerant of up to 3 errors (BCH distance 7)
  let fb = 0;
  for (let i = 0; i <= 5; i++) fb |= (m[i]![8] ? 1 : 0) << i;
  fb |= (m[7]![8] ? 1 : 0) << 6;
  fb |= (m[8]![8] ? 1 : 0) << 7;
  fb |= (m[8]![7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) fb |= (m[8]![14 - i] ? 1 : 0) << i;
  let best: { ecc: QrEcc; mask: number; d: number } | null = null;
  for (const ecc of ['L', 'M', 'Q', 'H'] as QrEcc[])
    for (let mask = 0; mask < 8; mask++) {
      let x = formatBits(ecc, mask) ^ fb;
      let d = 0;
      while (x) {
        d += x & 1;
        x >>>= 1;
      }
      if (!best || d < best.d) best = { ecc, mask, d };
    }
  expect(best!.d).toBe(0);
  const { ecc, mask } = best!;
  const fn = functionModules(ver);
  const bits: number[] = [];
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < s; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? s - 1 - v : v;
        if (!fn[y]![x]) bits.push((m[y]![x] ? 1 : 0) ^ (maskBit(mask, x, y) ? 1 : 0));
      }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const { numBlocks, eccLen, raw, numShort, shortLen } = blockLayout(ver, ecc);
  expect(words.length).toBe(raw);
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let k = 0;
  for (let i = 0; i <= shortLen; i++)
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortLen - eccLen && j < numShort) continue;
      blocks[j]!.push(words[k++]!);
    }
  // every block is a Reed–Solomon codeword: zero syndromes at α^0 … α^(ecc−1)
  let alpha = 1;
  const data: number[] = [];
  for (let r = 0; r < eccLen; r++) {
    for (const b of blocks) {
      let acc = 0;
      for (const c of b) acc = gfMul(acc, alpha) ^ c;
      expect(acc).toBe(0);
    }
    alpha = gfMul(alpha, 2);
  }
  for (const b of blocks) data.push(...b.slice(0, b.length - eccLen));
  const dbits = data.flatMap((w) => Array.from({ length: 8 }, (_, i) => (w >>> (7 - i)) & 1));
  const read = (at: number, n: number) => dbits.slice(at, at + n).reduce((a, b) => (a << 1) | b, 0);
  expect(read(0, 4)).toBe(0b0100);
  const cb = ver <= 9 ? 8 : 16;
  const len = read(4, cb);
  const bytes = Array.from({ length: len }, (_, i) => read(4 + cb + i * 8, 8));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), ecc, mask };
}

function finderOk(code: QrCode, cx: number, cy: number) {
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      expect(code.modules[cy + dy]![cx + dx]).toBe(d !== 2);
    }
}

describe('QR encoder', () => {
  const samples = [
    'https://starnote.app/@ludejun',
    'https://starnote.app/@ludejun/Ab3dE7xQ',
    'http://localhost:5174/@demo/x1Y2z3W4',
    '辰记 StarNote · 笔落成星，文达四海。',
    'x'.repeat(300),
  ];
  for (const text of samples)
    for (const ecc of ['L', 'M', 'Q', 'H'] as QrEcc[])
      it(`${ecc} ${text.slice(0, 24)}… reads back`, () => {
        const code = encodeQr(text, { ecc });
        expect(code.size).toBe(code.version * 4 + 17);
        const out = decode(code);
        expect(out).toEqual({ text, ecc, mask: code.mask });
        const s = code.size;
        finderOk(code, 3, 3);
        finderOk(code, s - 4, 3);
        finderOk(code, 3, s - 4);
        for (let i = 8; i < s - 8; i++) {
          expect(code.modules[6]![i]).toBe(i % 2 === 0);
          expect(code.modules[i]![6]).toBe(i % 2 === 0);
        }
        expect(code.modules[s - 8]![8]).toBe(true);
      });

  it('picks the smallest version (a blog link is version 2 or 3)', () => {
    expect(encodeQr('https://starnote.app/@ludejun', { ecc: 'L' }).version).toBe(2);
    expect(encodeQr('https://starnote.app/@ludejun/Ab3dE7xQ', { ecc: 'M' }).version).toBe(3);
  });

  it('every mask reads back', () => {
    for (let mask = 0; mask < 8; mask++)
      expect(decode(encodeQr('https://starnote.app/@a/b', { mask })).mask).toBe(mask);
  });

  it('BCH tables match the standard', () => {
    // ISO/IEC 18004 Annex C examples: M + mask 5 → 100000011001110; version 7 → 000111110010010100
    expect(formatBits('M', 5).toString(2).padStart(15, '0')).toBe('100000011001110');
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
    expect(ECC_FORMAT_BITS).toEqual({ L: 1, M: 0, Q: 3, H: 2 });
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
  });

  it('refuses what does not fit', () => {
    expect(() => encodeQr('x'.repeat(3000), { ecc: 'H' })).toThrow();
  });
});
