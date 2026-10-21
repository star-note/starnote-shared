import { describe, expect, it } from 'vitest';

import {
  isOfficialGroup,
  officialGroupIds,
  officialGroupLast,
  pickableGroups,
} from '../officialGroup';

const off = { id: 'o', name: '辰记官方', is_official: true };
const a = { id: 'a', name: 'A' };
const b = { id: 'b', name: 'B', is_official: false };
const fake = { id: 'f', name: '辰记官方' }; // same name, no flag → an ordinary group

describe('officialGroup', () => {
  it('detects by the server flag only', () => {
    expect(isOfficialGroup(off)).toBe(true);
    expect(isOfficialGroup(fake)).toBe(false);
    expect(isOfficialGroup(null)).toBe(false);
    expect(isOfficialGroup(undefined)).toBe(false);
  });

  it('pickableGroups drops the official group unless it is the kept source', () => {
    expect(pickableGroups([off, a, b, fake]).map((g) => g.id)).toEqual(['a', 'b', 'f']);
    expect(pickableGroups([off, a], 'o').map((g) => g.id)).toEqual(['o', 'a']);
    expect(pickableGroups([off, a], 'a').map((g) => g.id)).toEqual(['a']);
  });

  it('officialGroupLast moves it to the end and keeps the others in order', () => {
    expect(officialGroupLast([off, b, a]).map((g) => g.id)).toEqual(['b', 'a', 'o']);
    expect(officialGroupLast([b, off, a]).map((g) => g.id)).toEqual(['b', 'a', 'o']);
    const plain = [b, a];
    const out = officialGroupLast(plain);
    expect(out).toEqual(plain);
    expect(out).not.toBe(plain);
  });

  it('officialGroupIds', () => {
    expect([...officialGroupIds([off, a, b])]).toEqual(['o']);
  });
});
