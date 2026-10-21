import { describe, expect, it } from 'vitest';

import { baselineFor } from '../draw';

/** A 2D context whose glyph metrics, like a real one, are measured from the current textBaseline. */
function fakeCtx() {
  const cap = 70; // 'H' / '辰' ink from the alphabetic baseline up
  const ctx = {
    textBaseline: 'middle' as CanvasTextBaseline,
    measureText() {
      // 'middle' sits 30 above the alphabetic baseline in this font
      const shift = ctx.textBaseline === 'middle' ? -30 : 0;
      return { width: 60, actualBoundingBoxAscent: cap + shift, actualBoundingBoxDescent: 0 - shift } as TextMetrics;
    },
  };
  return ctx;
}

describe('baselineFor', () => {
  it('puts the capital centre on cy whatever baseline the context was left on', () => {
    const ctx = fakeCtx();
    const y = baselineFor(ctx as never, 'STARNOTE', 100);
    expect(y - 70 / 2).toBe(100);
    expect(ctx.textBaseline).toBe('middle');
  });

  it('falls back to cy when the platform has no glyph metrics', () => {
    const ctx = { textBaseline: 'middle', measureText: () => ({ width: 10 }) };
    expect(baselineFor(ctx as never, '辰记', 40)).toBe(40);
  });
});
