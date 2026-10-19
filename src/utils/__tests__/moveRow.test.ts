import { moveRow } from '../moveRow';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const ids = (r: { id: string }[]) => r.map((x) => x.id).join('');

describe('moveRow', () => {
  it('moves a row down and up', () => {
    expect(ids(moveRow(rows, 'a', 2))).toBe('bcad');
    expect(ids(moveRow(rows, 'd', 0))).toBe('dabc');
  });

  it('clamps the target and returns the same array for a no-op', () => {
    expect(ids(moveRow(rows, 'b', 99))).toBe('acdb');
    expect(ids(moveRow(rows, 'b', -5))).toBe('bacd');
    expect(moveRow(rows, 'b', 1)).toBe(rows);
    expect(moveRow(rows, 'zz', 1)).toBe(rows);
  });
});
