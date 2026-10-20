import {
  normalizeVisibility,
  VISIBILITIES,
  VISIBILITY_OPTIONS,
  visibilityLabel,
} from '../visibility';

describe('visibility (SPEC-r6 §B)', () => {
  it('offers only 公开 and 密码访问, each with a hint', () => {
    expect(VISIBILITIES).toEqual(['public', 'password']);
    expect(VISIBILITY_OPTIONS.map((o) => o.label)).toEqual(['公开', '密码访问']);
    expect(VISIBILITY_OPTIONS.every((o) => o.hint.length > 0)).toBe(true);
    expect(VISIBILITY_OPTIONS.map((o) => o.label).join()).not.toMatch(/群组可见|仅链接|私密/);
  });

  it('reads every removed value as 密码访问, never as public', () => {
    for (const old of ['link', 'group', 'private'])
      expect(normalizeVisibility(old)).toBe('password');
    expect(normalizeVisibility('public')).toBe('public');
    expect(normalizeVisibility('weird')).toBeNull();
    expect(normalizeVisibility(undefined)).toBeNull();
  });

  it('labels any stored value', () => {
    expect(visibilityLabel('password')).toBe('密码访问');
    expect(visibilityLabel('link')).toBe('密码访问');
    expect(visibilityLabel('private')).toBe('密码访问');
    expect(visibilityLabel('weird')).toBe('weird');
    expect(visibilityLabel(null)).toBe('');
  });
});
