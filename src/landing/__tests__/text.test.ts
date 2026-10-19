import { riseCount, splitChars, splitTokens } from '../text';

describe('splitTokens', () => {
  it('gives every CJK character its own token and keeps Latin words whole with their space', () => {
    expect(splitTokens('写下来，')).toEqual(['写', '下', '来', '，']);
    expect(splitTokens('Write it. Send it')).toEqual(['Write ', 'it. ', 'Send ', 'it']);
    expect(splitTokens('AI 续写、改写')).toEqual(['AI ', '续', '写', '、', '改', '写']);
    expect(splitTokens('')).toEqual([]);
  });
});

describe('splitChars / riseCount', () => {
  it('breaks tokens into characters and counts them', () => {
    expect(splitChars('Hi 你')).toEqual([['H', 'i', ' '], ['你']]);
    expect(riseCount('Write it.')).toBe(9);
    expect(riseCount('写下来，')).toBe(4);
  });
});
