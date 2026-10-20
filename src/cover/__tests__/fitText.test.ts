import { balanceLines, ellipsize, fitTitle, tokenize, wrapText } from '../fitText';

/** Monospace stand-in: CJK and Latin glyphs are both `size * 0.6` wide — plenty to test the rules. */
const measure = (t: string, size: number) => Array.from(t).length * size * 0.6;

describe('tokenize (CJK-aware)', () => {
  it('splits CJK per character and keeps Latin words whole', () => {
    expect(tokenize('为什么 RSC 适合中后台')).toEqual([
      '为',
      '什',
      '么',
      ' ',
      'RSC',
      ' ',
      '适',
      '合',
      '中',
      '后',
      '台',
    ]);
  });
  it('keeps ASCII punctuation inside a Latin word (version numbers, paths)', () => {
    expect(tokenize('SQLAlchemy 2.0 实践')).toEqual(['SQLAlchemy', ' ', '2.0', ' ', '实', '践']);
    expect(tokenize('v1.2, 完')).toEqual(['v1.2,', ' ', '完']);
  });
  it('glues closing punctuation to the previous unit and opening to the next', () => {
    expect(tokenize('你好，世界。「引用」')).toEqual(['你', '好，', '世', '界。', '「引', '用」']);
  });
});

describe('wrapText', () => {
  it('wraps greedily without starting a line with closing punctuation', () => {
    // 9 glyphs fit per line at size 10 (width 54): "九，" is one unit, so it moves down together.
    const lines = wrapText('一二三四五六七八九，十一二三', 54, 10, measure);
    expect(lines).toEqual(['一二三四五六七八', '九，十一二三']);
  });
  it('breaks an over-long Latin token by character instead of overflowing', () => {
    const lines = wrapText('Supercalifragilistic', 60, 10, measure);
    expect(lines.every((l) => measure(l, 10) <= 60)).toBe(true);
    expect(lines.join('')).toBe('Supercalifragilistic');
  });
});

describe('fitTitle', () => {
  it('uses the largest size that fits within three lines', () => {
    const short = fitTitle({ text: '写下来', maxWidth: 1000, measure });
    expect(short.size).toBe(72);
    expect(short.lines).toEqual(['写下来']);
    expect(short.truncated).toBe(false);
  });
  it('shrinks before wrapping to a fourth line', () => {
    const text = '一'.repeat(40); // 40 glyphs
    const r = fitTitle({ text, maxWidth: 600, measure });
    // at 72px a glyph is 43.2 wide → 13 per line → 4 lines; must shrink until 3 lines fit
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.size).toBeLessThan(72);
    expect(r.size).toBeGreaterThanOrEqual(34);
    expect(r.truncated).toBe(false);
  });
  it('truncates with an ellipsis only once the minimum size still overflows', () => {
    const text = '辰'.repeat(200);
    const r = fitTitle({ text, maxWidth: 600, measure });
    expect(r.size).toBe(34);
    expect(r.lines.length).toBe(3);
    expect(r.lines[2].endsWith('…')).toBe(true);
    expect(r.truncated).toBe(true);
    r.lines.forEach((l) => expect(measure(l, 34)).toBeLessThanOrEqual(600));
  });
  it('falls back to 无标题 for empty text', () => {
    expect(fitTitle({ text: '   ', maxWidth: 600, measure }).lines).toEqual(['无标题']);
  });
});

describe('ellipsize', () => {
  it('leaves fitting text alone and trims trailing punctuation before the ellipsis', () => {
    expect(ellipsize('短', 100, 10, measure)).toBe('短');
    const out = ellipsize('一二三四五六，七八九十', 42, 10, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/，…$/);
    expect(measure(out, 10)).toBeLessThanOrEqual(42);
  });
});

describe('balanceLines', () => {
  it('never leaves one or two characters alone on the last line, and prefers breaking after punctuation', () => {
    // 17 glyphs fit per line at size 6 (width 62): greedy gives 「…之后，我学会的十件」/「事」
    const title = '写了一年技术博客之后，我学会的十件事';
    expect(wrapText(title, 62, 6, measure).at(-1)).toBe('事');
    expect(balanceLines(title, 62, 6, measure)).toEqual([
      '写了一年技术博客之后，',
      '我学会的十件事',
    ]);
    const r = fitTitle({ text: title, maxWidth: 62, measure, minSize: 6, maxSize: 6 });
    expect(r.lines).toEqual(['写了一年技术博客之后，', '我学会的十件事']);
  });
  it('keeps the line count and every line within the width', () => {
    const long = '从零开始搭建一个支持多平台一键发布离线优先端到端加密的写作工具架构设计与踩坑复盘';
    const greedy = wrapText(long, 200, 10, measure);
    const bal = balanceLines(long, 200, 10, measure);
    expect(bal).toHaveLength(greedy.length);
    bal.forEach((l) => expect(measure(l, 10)).toBeLessThanOrEqual(200));
    expect(bal.join('')).toBe(long);
    expect(Array.from(bal.at(-1)!).length).toBeGreaterThan(2);
  });
});

describe('one line first', () => {
  it('shrinks down to 85 % of the target size to stay on one line before it wraps', () => {
    // 10 glyphs: one line needs 10 × 0.6 × size ≤ 500 → size ≤ 83 (target 90 → floor 77)
    const r = fitTitle({
      text: '一二三四五六七八九十',
      maxWidth: 500,
      measure,
      minSize: 30,
      maxSize: 90,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.size).toBe(82);
    // needs size ≤ 66: below 85 % of 90, so it wraps at a larger size instead
    const w = fitTitle({
      text: '一二三四五六七八九十',
      maxWidth: 400,
      measure,
      minSize: 30,
      maxSize: 90,
    });
    expect(w.lines.length).toBeGreaterThan(1);
    expect(w.size).toBeGreaterThan(66);
  });
});
