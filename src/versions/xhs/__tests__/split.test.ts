import { blankCard, ENDING_PROMPTS, splitXhsCards } from '../split';
import { ARTICLE, doc, h, p, quote, ul } from './fixtures';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('splitXhsCards', () => {
  it('turns an article into 6–9 cards: cover first, ending last, reading order between', () => {
    const cards = splitXhsCards(ARTICLE, '我是怎么坚持早起三年的', { newId: ids() });
    expect(cards.length).toBeGreaterThanOrEqual(6);
    expect(cards.length).toBeLessThanOrEqual(9);
    expect(cards[0]).toMatchObject({ kind: 'cover', title: '我是怎么坚持早起三年的' });
    expect(cards[0]!.body).toMatch(/^早起这件事我坚持了三年/);
    const last = cards[cards.length - 1]!;
    expect(last.kind).toBe('ending');
    expect(last.title).toBe('总结');
    expect(last.body).toMatch(/早起是一个慢慢养成的习惯/);
    expect(last.items).toEqual(ENDING_PROMPTS);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards.every((c) => c.template === 'cream')).toBe(true);
  });

  it('makes points cards of 4–5 items from lists, with the section heading as title', () => {
    const cards = splitXhsCards(ARTICLE, 't', { newId: ids() });
    const points = cards.filter((c) => c.kind === 'points');
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0]!.title).toBe('早起的五个方法');
    for (const c of points) expect(c.items!.length).toBeLessThanOrEqual(5);
    // six items split 3 + 3, never 5 + 1
    expect(points.map((c) => c.items!.length)).toEqual([3, 3]);
  });

  it('keeps sections (heading + first sentences) and picks quotes from blockquotes and bold lines', () => {
    const cards = splitXhsCards(ARTICLE, 't', { newId: ids() });
    const sec = cards.find((c) => c.kind === 'section' && c.title === '为什么要早起');
    expect(sec?.body).toMatch(/^早上的时间是一天里最完整的时间/);
    expect(Array.from(sec!.body!).length).toBeLessThanOrEqual(110);
    const quotes = cards.filter((c) => c.kind === 'quote').map((c) => c.body);
    expect(quotes).toContain('自律的本质，是让好习惯变得不费力。');
    expect(quotes.length).toBeLessThanOrEqual(3);
  });

  it('caps a long article at nine and gives it an overview of its headings', () => {
    const blocks = [p('引子。'.repeat(10))];
    for (let i = 1; i <= 10; i++) blocks.push(h(2, `第${i}部分`), p(`第${i}部分的内容很重要，值得展开说说。这里有很多细节。`), ul('甲', '乙', '丙'));
    const cards = splitXhsCards(doc(...blocks), '长文', { newId: ids() });
    expect(cards.length).toBe(9);
    const overview = cards.find((c) => c.title === '这篇讲了这些');
    expect(overview?.items?.[0]).toBe('第1部分');
  });

  it('pads a short note from its paragraphs and still ends properly', () => {
    const d = doc(
      p('今天想聊聊阅读。'),
      p('阅读让人安静。每天读二十分钟，一年就是一百多个小时，足够读完二十本书。'),
      p('选书比读书重要。先读经典，再读新书，经典经过了时间的筛选，更值得花时间。'),
      p('读完要写笔记。哪怕只写三句话，也比什么都不写记得牢，还能形成自己的思考。'),
      p('最后，别给自己太大压力，读书是一件快乐的事。'),
    );
    const cards = splitXhsCards(d, '关于阅读', { newId: ids() });
    expect(cards.length).toBeGreaterThanOrEqual(5);
    expect(cards[0]!.kind).toBe('cover');
    expect(cards[cards.length - 1]!.kind).toBe('ending');
    const middle = cards.slice(1, -1);
    expect(middle.length).toBeGreaterThanOrEqual(3);
    // nothing is said twice: no body repeats the cover subtitle, the summary or another card
    const bodies = cards.map((c) => c.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('survives an empty doc and a missing title', () => {
    const cards = splitXhsCards({ type: 'doc', content: [] }, '', { newId: ids() });
    expect(cards.map((c) => c.kind)).toEqual(['cover', 'ending']);
    expect(cards[0]!.title).toBe('无标题');
    expect(splitXhsCards(null, 'x').length).toBe(2);
  });

  it('uses the given template and a list intro as the points title', () => {
    const d = doc(p('开场白讲一下背景，说明为什么写这篇。'), p('三个工具：'), ul('Notion', 'Obsidian', '辰记'), quote('工具只是工具，重要的是持续写。'));
    const cards = splitXhsCards(d, '工具', { template: 'mono', newId: ids() });
    expect(cards.every((c) => c.template === 'mono')).toBe(true);
    expect(cards.find((c) => c.kind === 'points')?.title).toBe('三个工具');
  });

  it('blank cards per kind', () => {
    expect(blankCard('points', 'cream', () => 'x')).toMatchObject({ id: 'x', kind: 'points', items: ['第一点', '第二点', '第三点'] });
    expect(blankCard('ending').items).toEqual(ENDING_PROMPTS);
  });
});
