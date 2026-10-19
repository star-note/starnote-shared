import type { XhsCard } from '../../../api/versions';
import { AiPointsError } from '../../ai';
import {
  type AiCaller,
  applyXhsAnswer,
  CAPTION_MAX,
  clampCaption,
  cleanTopics,
  generateXhsContent,
  parseImageKeywords,
  parseTags,
  ruleCaption,
  TAGS_MARKER,
  XHS_MARKER,
  xhsRequest,
} from '../ai';
import { ARTICLE } from './fixtures';

const cards: XhsCard[] = [
  { id: 'a', kind: 'cover', template: 'cream', title: '原标题', body: '原副标题' },
  { id: 'b', kind: 'points', template: 'cream', title: '要点', items: ['一', '二'] },
  { id: 'c', kind: 'quote', template: 'cream', title: '出处', body: '原金句', render: { asset_hash: 'h', url: '/u' } },
];

describe('rewrite.xhs prompt and answer', () => {
  it('sends {title, cards:[{i, kind, source}], article}', () => {
    const req = JSON.parse(xhsRequest('标题', cards, '全文'.repeat(4000)));
    expect(req.title).toBe('标题');
    expect(req.cards[1]).toEqual({ i: 1, kind: 'points', source: '要点\n一\n二' });
    expect(req.article.length).toBe(6000);
  });

  it('applies a fenced JSON answer card by card, keeping rule text where a field is missing', () => {
    const answer =
      '好的：\n```json\n{"title":"AI 标题","cards":[{"i":0,"title":"新封面"},{"i":1,"items":["甲","乙","丙"]},{"i":2,"title":"","body":"新金句"}],"caption":"正文笔记"}\n```';
    const r = applyXhsAnswer(cards, answer);
    expect(r.ok).toBe(true);
    expect(r.title).toBe('AI 标题');
    expect(r.caption).toBe('正文笔记');
    expect(r.cards[0]).toMatchObject({ title: '新封面', body: '原副标题' });
    expect(r.cards[1]!.items).toEqual(['甲', '乙', '丙']);
    expect(r.cards[2]).toMatchObject({ title: '', body: '新金句' });
    expect(r.cards[2]!.render).toBeUndefined();
    // the input is not mutated
    expect(cards[2]!.render).toBeDefined();
  });

  it('bad JSON or wrong shapes fall back to the rule cards', () => {
    expect(applyXhsAnswer(cards, '抱歉，我无法完成').ok).toBe(false);
    expect(applyXhsAnswer(cards, '{"cards": "nope"}').ok).toBe(false);
    const r = applyXhsAnswer(cards, '{"cards":[{"i":1,"items":[1,2,null]}]}');
    expect(r.cards[1]!.items).toEqual(['一', '二']);
  });

  it('enforces the 1000-character caption', () => {
    const long = `${'这是一句话。'.repeat(200)}`;
    const r = applyXhsAnswer(cards, JSON.stringify({ cards: [], caption: long }));
    expect(Array.from(r.caption).length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(r.caption.endsWith('。')).toBe(true);
    expect(Array.from(clampCaption('字'.repeat(1500))).length).toBe(1000);
  });

  it('builds a caption from the cards alone', () => {
    const c = ruleCaption('标题', cards);
    expect(c).toContain('原副标题');
    expect(c).toContain('📌 要点');
    expect(c).toContain('「原金句」');
  });
});

describe('tags and keywords answers', () => {
  it('cleans topics: no #, no duplicates, at most ten', () => {
    expect(parseTags('{"tags":["#早起","早起","自律 习惯","", 3]}')).toEqual(['早起', '自律习惯']);
    expect(cleanTopics(Array.from({ length: 20 }, (_, i) => `话题${i}`)).length).toBe(10);
    expect(parseTags('nope')).toEqual([]);
    expect(parseImageKeywords('```{"keywords":["咖啡","城市夜景"]}```')).toEqual(['咖啡', '城市夜景']);
  });
});

describe('generateXhsContent', () => {
  it('rules only: no AI call, rule caption and keyword topics', async () => {
    const call = vi.fn<AiCaller>();
    const steps: string[] = [];
    const r = await generateXhsContent({ title: '早起三年', doc: ARTICLE }, { call, onStep: (s) => steps.push(s) });
    expect(call).not.toHaveBeenCalled();
    expect(steps).toEqual(['split', 'topics']);
    expect(r.content.cards.length).toBeGreaterThanOrEqual(6);
    expect(r.content.caption.length).toBeGreaterThan(20);
    expect(r.content.topics).toContain('早起');
  });

  it('with AI: rewrite.xhs then tags.suggest, markers in the system prompts', async () => {
    const call = vi.fn<AiCaller>(async (feature, req) => {
      if (feature === 'rewrite.xhs') {
        expect(req.system).toContain(XHS_MARKER);
        const { cards: cs } = JSON.parse(req.user) as { cards: { i: number }[] };
        return JSON.stringify({ title: '早起手册', cards: cs.map((c) => ({ i: c.i, title: `卡${c.i}` })), caption: 'AI 正文' });
      }
      expect(req.system).toContain(TAGS_MARKER);
      expect(req.user).toMatch(/^标题：早起三年\n正文：.+\n平台：xiaohongshu$/s);
      return '{"tags":["早起","自律"]}';
    });
    const r = await generateXhsContent({ title: '早起三年', doc: ARTICLE }, { ai: true, call });
    expect(call.mock.calls.map((c) => c[0])).toEqual(['rewrite.xhs', 'tags.suggest']);
    expect(r.title).toBe('早起手册');
    expect(r.content.cards[0]!.title).toBe('卡0');
    expect(r.content.caption).toBe('AI 正文');
    expect(r.content.topics).toEqual(['早起', '自律']);
    expect(r.fallbacks).toEqual([]);
  });

  it('a broken AI answer falls back per step; running out of points stops', async () => {
    const bad: AiCaller = async () => 'not json';
    const r = await generateXhsContent({ title: '早起三年', doc: ARTICLE }, { ai: true, call: bad });
    expect(r.fallbacks).toEqual(['copy', 'topics']);
    expect(r.content.caption).toContain('📌');
    expect(r.content.topics.length).toBeGreaterThan(0);

    const broke: AiCaller = async () => {
      throw new AiPointsError('点数不够');
    };
    await expect(generateXhsContent({ title: 't', doc: ARTICLE }, { ai: true, call: broke })).rejects.toBeInstanceOf(AiPointsError);

    const flaky: AiCaller = async (f) => {
      if (f === 'rewrite.xhs') throw new Error('500');
      return '{"tags":["早起"]}';
    };
    const r2 = await generateXhsContent({ title: 't', doc: ARTICLE }, { ai: true, call: flaky });
    expect(r2.fallbacks).toEqual(['copy']);
    expect(r2.content.topics).toEqual(['早起']);
  });
});
