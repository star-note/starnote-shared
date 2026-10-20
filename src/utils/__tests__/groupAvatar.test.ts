import { groupHue, groupInitial, hueVars } from '../groupAvatar';

describe('groupAvatar fallback', () => {
  it('takes the first character of the name, upper-cased, and 群 when empty', () => {
    expect(groupInitial('前端小组')).toBe('前');
    expect(groupInitial('  design team')).toBe('D');
    expect(groupInitial('🚀 launch')).toBe('🚀');
    expect(groupInitial('')).toBe('群');
    expect(groupInitial(null)).toBe('群');
  });

  it('gives a stable hue in range and exposes it as a CSS variable', () => {
    const h = groupHue('前端小组');
    expect(h).toBe(groupHue('前端小组'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(hueVars('前端小组')).toEqual({ '--gh': String(h) });
    expect(groupHue('a')).not.toBe(groupHue('b'));
  });
});
