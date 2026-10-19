import { docImages, docSections, extractKeywords, rankKeywords, sectionsMissingImages } from '../keywords';
import { ARTICLE, doc, h, img, p } from '../xhs/__tests__/fixtures';

describe('extractKeywords', () => {
  it('finds repeated CJK words and folds partial grams into the whole word', () => {
    const text =
      '机器学习正在改变软件开发。很多团队开始用机器学习做推荐，机器学习模型需要大量数据。数据质量决定了模型效果，数据清洗是第一步。';
    const kws = extractKeywords(text, { limit: 6 });
    expect(kws).toContain('机器学习');
    expect(kws).toContain('数据');
    // no fragments of 机器学习
    for (const frag of ['机器学', '器学习', '器学', '学习模']) expect(kws).not.toContain(frag);
    // particles never start or end a keyword
    for (const k of kws) expect(k).not.toMatch(/^[的了是在和]|[的了是在和]$/);
  });

  it('weights words that also appear in the title', () => {
    const text = '咖啡和茶都很好。咖啡和茶都很好。手冲是一种方法，手冲需要耐心。';
    const plain = rankKeywords(text);
    const titled = rankKeywords(text, { title: '手冲入门' });
    expect(plain[0]?.word).not.toBe('手冲');
    expect(titled[0]?.word).toBe('手冲');
  });

  it('counts English words case-insensitively, keeps acronyms, drops stopwords', () => {
    const kws = extractKeywords('Using React with AI: react hooks and the React compiler. AI helps. The the the.', {
      limit: 5,
    });
    expect(kws[0]).toBe('React');
    expect(kws).toContain('AI');
    expect(kws).not.toContain('the');
    expect(kws).not.toContain('with');
  });

  it('returns nothing for empty text and respects the limit', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords(ARTICLE.content!.map((n) => JSON.stringify(n)).join(''), { limit: 3 }).length).toBeLessThanOrEqual(3);
  });

  it('handles a long note quickly', () => {
    const long = '早起读书写作运动，坚持习惯。'.repeat(2000);
    const t0 = performance.now();
    extractKeywords(long, { title: '早起' });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('sections', () => {
  it('cuts at h2 and reports where a picture fits', () => {
    const d = doc(p('开头的一段话。'.repeat(30)), h(2, '第一节'), p('正文'.repeat(100)), p('第二段'), h(2, '第二节'), img('/a.png'), p('有图'.repeat(100)));
    const s = docSections(d);
    expect(s.map((x) => x.heading)).toEqual(['', '第一节', '第二节']);
    expect(s[1]).toMatchObject({ start: 1, end: 4, insertAt: 3, hasImage: false });
    expect(s[2]?.hasImage).toBe(true);
    const missing = sectionsMissingImages(d, { minChars: 100 });
    expect(missing.map((x) => x.heading)).toEqual(['', '第一节']);
    expect(missing[0]?.insertAt).toBe(1);
  });

  it('skips short sections and finds nested pictures', () => {
    const d = doc(h(2, '短'), p('就一句'), h(2, '长'), { type: 'card', content: [img('/b.png'), p('长'.repeat(300))] });
    expect(sectionsMissingImages(d)).toEqual([]);
    expect(docImages(d)).toEqual([{ src: '/b.png', alt: '' }]);
  });

  it('an empty doc has no sections', () => {
    expect(docSections(null)).toEqual([]);
    expect(sectionsMissingImages({ type: 'doc', content: [] })).toEqual([]);
  });
});
