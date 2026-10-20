import { createRng, hashSeed, mulberry32 } from '../rng';

describe('seeded rng', () => {
  it('hashes strings deterministically and distinctly', () => {
    expect(hashSeed('poster|note-1')).toBe(hashSeed('poster|note-1'));
    expect(hashSeed('poster|note-1')).not.toBe(hashSeed('poster|note-2'));
  });
  it('replays the same sequence for the same seed', () => {
    const a = createRng('note-1:0');
    const b = createRng('note-1:0');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });
  it('换一张 (a different seed) changes the picture', () => {
    const a = createRng('note-1:0');
    const b = createRng('note-1:1');
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });
  it('helpers stay inside their bounds', () => {
    const r = createRng(42);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(['a', 'b']).toContain(r.pick(['a', 'b']));
      const x = r.range(-1, 1);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });
});
