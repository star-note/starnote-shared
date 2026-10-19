import { handleCooldownUntil, normalizeHandleInput, validateHandle } from '../handle';

describe('validateHandle', () => {
  it('accepts well-formed handles', () => {
    expect(validateHandle('ludejun')).toBeNull();
    expect(validateHandle('lu-de-jun2')).toBeNull();
    expect(validateHandle('abc')).toBeNull();
  });
  it('rejects by length', () => {
    expect(validateHandle('')).toBe('empty');
    expect(validateHandle('ab')).toBe('short');
    expect(validateHandle('a'.repeat(25))).toBe('long');
  });
  it('rejects bad characters and dash edges', () => {
    expect(validateHandle('Lu')).toBe('short');
    expect(validateHandle('LuDeJun')).toBe('chars');
    expect(validateHandle('lu_de')).toBe('chars');
    expect(validateHandle('lu de')).toBe('chars');
    expect(validateHandle('-lude')).toBe('dash');
    expect(validateHandle('lude-')).toBe('dash');
  });
  it('rejects reserved words except for their current owner', () => {
    expect(validateHandle('admin')).toBe('reserved');
    expect(validateHandle('settings')).toBe('reserved');
    expect(validateHandle('demo')).toBe('reserved');
    expect(validateHandle('demo', { current: 'demo' })).toBeNull();
  });
});

describe('normalizeHandleInput', () => {
  it('lower-cases and strips forbidden characters', () => {
    expect(normalizeHandleInput('Lu De_Jun!')).toBe('ludejun');
    expect(normalizeHandleInput('a'.repeat(30))).toHaveLength(24);
  });
});

describe('handleCooldownUntil', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  it('is null with no history or after 30 days', () => {
    expect(handleCooldownUntil(null, now)).toBeNull();
    expect(handleCooldownUntil('2026-09-01T00:00:00Z', now)).toBeNull();
  });
  it('returns the date the handle may change again', () => {
    expect(handleCooldownUntil('2026-10-01T00:00:00Z', now)?.toISOString()).toBe(
      '2026-10-31T00:00:00.000Z',
    );
  });
});
