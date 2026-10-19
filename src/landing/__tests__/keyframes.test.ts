import {
  FOLLOW,
  framesFor,
  interpolate,
  nearest,
  nearestFrame,
  SECTION_STATES,
  smoothstep,
  thresholds,
  type Keyframe,
} from '../keyframes';
import { SHAPE_KEYS } from '../shapes';

const frames: Keyframe[] = framesFor([
  { id: 'hero', at: 0 },
  { id: 'ai', at: 0.2 },
  { id: 'blog', at: 0.6 },
  { id: 'end', at: 1 },
]);

describe('SECTION_STATES', () => {
  it('maps every screen to a formation that exists, opening and closing on the logo', () => {
    for (const s of Object.values(SECTION_STATES)) expect(SHAPE_KEYS).toContain(s.shape);
    expect(SECTION_STATES.hero.shape).toBe('logo');
    expect(SECTION_STATES.end.shape).toBe('logo');
    expect(SECTION_STATES.ai.shape).toBe('converge');
    expect(SECTION_STATES.reach.shape).toBe('globe');
    expect(SECTION_STATES.blog.shape).toBe('readers');
    expect(SECTION_STATES.team.shape).toBe('flow');
    expect(SECTION_STATES.hot.shape).toBe('rising');
  });

  it('alternates the stage on desktop so copy and formation never share a column', () => {
    expect(SECTION_STATES.hero.ox).toBeGreaterThan(0.15);
    expect(SECTION_STATES.ai.ox).toBeLessThan(-0.15);
    expect(SECTION_STATES.reach.ox).toBeGreaterThan(0.15);
    expect(SECTION_STATES.blog.ox).toBeLessThan(-0.15);
    expect(SECTION_STATES.team.oy).toBeGreaterThan(0.15); // under its copy
  });
});

describe('interpolate', () => {
  it('returns the first and last scenes settled at either end, clamping progress', () => {
    for (const p of [-1, 0]) {
      const b = interpolate(frames, p);
      expect(b.from).toBe('logo');
      expect(b.to).toBe('logo');
      expect(b.t).toBe(1);
      expect(b.scatter).toBe(0);
      expect(b.lift).toBe(0);
      expect(b.ox).toBe(SECTION_STATES.hero.ox);
    }
    const end = interpolate(frames, 2);
    expect(end.to).toBe(SECTION_STATES.end.shape);
    expect(end.spread).toBe(SECTION_STATES.end.spread);
    expect(end.mix).toEqual(SECTION_STATES.end.mix);
  });

  it('lands exactly on each screen: settled, no scatter, at its snap point', () => {
    for (const f of frames) {
      const b = interpolate(frames, f.at);
      expect(b.from).toBe(f.state.shape);
      expect(b.to).toBe(f.state.shape);
      expect(b.scatter).toBe(0);
      expect(b.lift).toBeCloseTo(0);
    }
  });

  it('blends neighbouring screens and scatters most halfway between them', () => {
    const mid = interpolate(frames, 0.1);
    expect(mid.from).toBe('logo');
    expect(mid.to).toBe('converge');
    expect(mid.t).toBeCloseTo(0.5);
    expect(mid.scatter).toBeCloseTo(SECTION_STATES.hero.burst);
    expect(mid.ox).toBeCloseTo((SECTION_STATES.hero.ox + SECTION_STATES.ai.ox) / 2);
    expect(mid.mix[3]).toBeCloseTo((SECTION_STATES.hero.mix[3] + SECTION_STATES.ai.mix[3]) / 2);

    const early = interpolate(frames, 0.02);
    expect(early.t).toBeLessThan(0.1);
    expect(early.scatter).toBeLessThan(mid.scatter);
    const late = interpolate(frames, 0.19);
    expect(late.t).toBeGreaterThan(0.95);
    expect(late.scatter).toBeLessThan(0.15);
  });

  it('carries the leaving formation up and brings the next one from below', () => {
    const early = interpolate(frames, 0.02);
    expect(early.lift).toBeGreaterThan(0); // hero rides up with its screen
    const late = interpolate(frames, 0.18);
    expect(late.lift).toBeLessThan(0); // ai rises into place
    expect(late.lift).toBeGreaterThan(-0.02 * FOLLOW - 1e-9);
  });

  it('is continuous across a keyframe', () => {
    const before = interpolate(frames, 0.6 - 1e-6);
    const at = interpolate(frames, 0.6);
    const after = interpolate(frames, 0.6 + 1e-6);
    expect(before.scale).toBeCloseTo(at.scale, 4);
    expect(after.scale).toBeCloseTo(at.scale, 4);
    expect(before.lift).toBeCloseTo(at.lift, 4);
    expect(after.lift).toBeCloseTo(at.lift, 4);
    expect(at.from).toBe('readers');
    expect(before.to).toBe('readers');
  });

  it('holds a tall screen settled while it scrolls, riding up with it, then moves on', () => {
    const tall = framesFor([
      { id: 'hero', at: 0 },
      { id: 'reach', at: 0.3, until: 0.4 },
      { id: 'end', at: 0.8 },
    ]);
    const inside = interpolate(tall, 0.35);
    expect(inside.from).toBe('globe');
    expect(inside.to).toBe('globe');
    expect(inside.scatter).toBe(0);
    expect(inside.lift).toBeCloseTo(0.05);
    // Leaving: continuous at the end of the hold.
    expect(interpolate(tall, 0.4 + 1e-6).lift).toBeCloseTo(0.1, 4);
    expect(interpolate(tall, 0.6).to).toBe('logo');
    expect(interpolate(tall, 0.6).scatter).toBeCloseTo(SECTION_STATES.reach.burst);
  });

  it('eases with smoothstep', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.25)).toBeLessThan(0.25);
    expect(smoothstep(2)).toBe(1);
  });

  it('refuses an empty keyframe list', () => {
    expect(() => interpolate([], 0.5)).toThrow();
    expect(() => nearest([], 0.5)).toThrow();
  });
});

describe('nearest', () => {
  it('picks the screen in view without blending, for reduced motion', () => {
    expect(nearestFrame(frames, 0.09)).toBe(0);
    expect(nearestFrame(frames, 0.11)).toBe(1);
    const b = nearest(frames, 0.55);
    expect(b.from).toBe('readers');
    expect(b.to).toBe('readers');
    expect(b.scatter).toBe(0);
  });
});

describe('framesFor', () => {
  it('sorts by position, clamps, and drops duplicates at the same position', () => {
    const f = framesFor([
      { id: 'end', at: 1.4 },
      { id: 'ai', at: 0.3 },
      { id: 'hero', at: -0.2 },
      { id: 'reach', at: 0.3 },
    ]);
    expect(f.map((k) => k.at)).toEqual([0, 0.3, 1]);
    expect(f.map((k) => k.state.shape)).toEqual(['logo', 'converge', 'logo']);
  });

  it('never lets a hold run into the next screen', () => {
    const f = framesFor([
      { id: 'hero', at: 0, until: 0.5 },
      { id: 'ai', at: 0.3 },
    ]);
    expect(f[0].until).toBe(0.3);
    expect(f[1].until).toBe(0.3);
  });
});

describe('thresholds', () => {
  it('turns a mix into cumulative bands ending at 1', () => {
    const th = thresholds([1, 1, 1, 1, 1]);
    expect(th.map((v) => Math.round(v * 100))).toEqual([20, 40, 60, 80, 100]);
    expect(thresholds([0, 0, 0, 0, 2])).toEqual([0, 0, 0, 0, 1]);
    expect(thresholds([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
  });
});
