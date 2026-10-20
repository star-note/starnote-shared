import { describe, expect, it } from 'vitest';

import type { TiptapDoc, TiptapNode } from '../../api/types';
import { findImageGaps, parseInfographic, parseQuote } from '../cards';
import { aiIssues, fixOrder, parseCheckResult, ruleIssues, textRules, type DocScan, type TextBlockScan } from '../check';
import { applyCompose, composeItems, originalText, parseComposePlan, validOps } from '../compose';
import { estimateShort, estimateText } from '../features';
import { inlineText, markInline, sentenceBoundaries, splitInline, textOf } from '../text';
import {
  applyTidy,
  findEnumeration,
  paragraphToList,
  parseTidyOps,
  planSplit,
  planTidy,
  snapStarts,
  splitParagraph,
  statCard,
} from '../tidy';

const t = (text: string, marks?: TiptapNode['marks']): TiptapNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: (TiptapNode | string)[]): TiptapNode => ({
  type: 'paragraph',
  content: content.map((c) => (typeof c === 'string' ? t(c) : c)),
});
const h = (level: number, text: string): TiptapNode => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });
const img: TiptapNode = { type: 'imageBlock', attrs: { src: '/a.png', alt: '', caption: null } };

const LONG =
  '很多人写公众号，第一反应是把文字堆上去，然后指望读者自己找重点。可是手机屏幕只有巴掌大，一段超过两百字的文字，在屏幕上就是一整块灰色的墙。' +
  '读者的耐心很有限，他们会快速滑动，只在粗体、小标题和图片上停留。因此排版不是锦上添花，而是决定一篇文章能不能被读完的关键。' +
  '另外，好的排版还能帮作者自己理清思路：当你不得不给每一节起一个小标题的时候，你会发现哪些段落其实在说同一件事。' +
  '最后，排版要克制，样式越多越乱，统一的标题、引用和分割线就够了。';

describe('split: only at sentence ends, joins back char for char', () => {
  it('sentenceBoundaries never cut inside a sentence', () => {
    const b = sentenceBoundaries('第一句。第二句！“第三句？”第四句；end. Next');
    expect(b).toEqual([4, 8, 14, 18, 23]);
  });

  it('planSplit cuts a long paragraph at sentence ends into balanced pieces', () => {
    const cuts = planSplit(LONG);
    expect(cuts.length).toBeGreaterThan(0);
    const bounds = sentenceBoundaries(LONG);
    for (const c of cuts) expect(bounds).toContain(c);
    const pieces = [0, ...cuts, LONG.length].slice(0, -1).map((a, i) => LONG.slice(a, [...cuts, LONG.length][i]));
    expect(pieces.join('')).toBe(LONG);
    for (const piece of pieces) expect(piece.length).toBeGreaterThanOrEqual(40);
  });

  it('prefers a cut before a turn word', () => {
    const cuts = planSplit(LONG);
    expect(cuts.some((c) => /^(可是|因此|另外|最后)/.test(LONG.slice(c)))).toBe(true);
  });

  it('short paragraphs and paragraphs without sentence ends stay whole', () => {
    expect(planSplit('短段落。')).toEqual([]);
    expect(planSplit('没有句号'.repeat(80))).toEqual([]);
  });

  it('splitParagraph keeps every char, mark and inline leaf (many shapes)', () => {
    const bold = [{ type: 'bold' }];
    const link = [{ type: 'link', attrs: { href: 'https://starnote.app' } }];
    const shapes: TiptapNode[] = [
      p(LONG),
      p(t(LONG.slice(0, 50)), t(LONG.slice(50, 130), bold), { type: 'hardBreak' }, t(LONG.slice(130, 200), link), t(LONG.slice(200))),
      p(...LONG.split('。').map((s, i) => t(`${s}。`, i % 2 ? bold : undefined))),
    ];
    for (const node of shapes) {
      const text = inlineText(node.content);
      for (const offsets of [planSplit(text), sentenceBoundaries(text), [1, 2, 3], [text.length - 1]]) {
        const pieces = splitParagraph(node, offsets);
        expect(pieces.map((x) => inlineText(x.content)).join('')).toBe(text);
        expect(pieces.map(textOf).join('')).toBe(textOf(node));
        const marked = (n: TiptapNode) => (n.content ?? []).filter((c) => c.marks?.length).map((c) => c.text).join('');
        expect(pieces.map(marked).join('')).toBe(marked(node));
        expect(pieces.flatMap((x) => x.content ?? []).filter((c) => c.type === 'hardBreak').length).toBe(
          (node.content ?? []).filter((c) => c.type === 'hardBreak').length,
        );
      }
    }
  });

  it("snapStarts maps the model's snippets onto sentence ends and ignores the rest", () => {
    expect(snapStarts(LONG, ['因此排版不是', '不存在的句子', '巴掌大'])).toEqual([LONG.indexOf('因此排版')]);
  });

  it('splitInline with no cuts is the identity', () => {
    const c = [t('ab'), t('cd', [{ type: 'italic' }])];
    expect(splitInline(c, [])).toEqual([c]);
  });
});

describe('tidy', () => {
  it('enumerations become an intro + ordered list, markers dropped', () => {
    const node = p('我们有三点建议。第一，先写提纲。第二，再填内容。第三，最后排版。');
    expect(findEnumeration(inlineText(node.content))).toHaveLength(3);
    const out = paragraphToList(node)!;
    expect(out[0]).toEqual(p('我们有三点建议。'));
    expect(out[1]!.type).toBe('orderedList');
    expect(out[1]!.content!.map(textOf)).toEqual(['先写提纲。', '再填内容。', '最后排版。']);
    expect(paragraphToList(p('这是第一次尝试，没有枚举。'))).toBeNull();
  });

  it('a 数据卡 keeps the sentence verbatim inside the card', () => {
    const node = p('背景先交代。手机阅读占比达到 68%，平均停留 3.5 分钟。后面还有话。');
    const out = statCard(node, '手机阅读占比达到 68%，平均停留 3.5 分钟。', [
      { value: '68%', label: '手机阅读占比' },
      { value: '3.5 分钟', label: '平均停留' },
    ])!;
    expect(out.map((n) => n.type)).toEqual(['paragraph', 'card', 'paragraph']);
    expect(out[1]!.attrs).toEqual({ variant: 'stat', label: '数据' });
    expect(textOf(out[1]!.content![2])).toBe('手机阅读占比达到 68%，平均停留 3.5 分钟。');
    expect(textOf(out[0]) + textOf(out[1]!.content![2]) + textOf(out[2])).toBe(textOf(node));
  });

  it('emphasis marks an exact sentence and changes no text', () => {
    const node = p(LONG);
    const sentence = '因此排版不是锦上添花，而是决定一篇文章能不能被读完的关键。';
    const at = LONG.indexOf(sentence);
    const content = markInline(node.content, at, at + sentence.length, { type: 'bold' });
    expect(inlineText(content)).toBe(LONG);
    expect(content.find((c) => c.marks?.length)?.text).toBe(sentence);
  });

  it('planTidy validates the model and adds local proposals; applyTidy keeps the words', () => {
    const d = doc(h(2, '标题'), p(LONG), p('我们有两点建议。第一，少用样式。第二，多留白。'), p('A 方案便宜；B 方案稳定。'));
    const ops = parseTidyOps(
      JSON.stringify({
        ops: [
          { op: 'split', i: 1, starts: ['因此排版不是'] },
          { op: 'emphasize', i: 1, text: '因此排版不是锦上添花，而是决定一篇文章能不能被读完的关键。' },
          { op: 'emphasize', i: 1, text: '原文里没有这句。' },
          { op: 'table', i: 3, intro: '两个方案：', head: ['方案', '特点'], rows: [['A', '便宜'], ['B', '稳定']] },
          { op: 'list', i: 0 },
        ],
      }),
    )!;
    const items = planTidy(d, ops);
    expect(items.map((x) => x.id)).toEqual(['split:1', 'emphasize:1', 'list:2', 'table:3']);
    const all = new Set(items.map((x) => x.id));
    const out = applyTidy(d, items, all, 'highlight');
    expect(out.content!.map((n) => n.type)).toEqual(['heading', 'paragraph', 'paragraph', 'paragraph', 'orderedList', 'paragraph', 'table']);
    const split = out.content!.slice(1, 3);
    expect(split.map(textOf).join('')).toBe(LONG);
    expect(split.flatMap((n) => n.content ?? []).find((c) => c.marks?.[0]?.type === 'highlight')).toBeTruthy();
    // nothing ticked: the note is unchanged
    expect(applyTidy(d, items, new Set(), 'bold')).toEqual(d);
  });
});

describe('compose', () => {
  const d = doc(
    p('开头一段，交代背景。'),
    h(2, '为什么要排版'),
    p(LONG),
    { type: 'blockquote', content: [p('引用')] },
    p(LONG),
    h(2, '怎么做'),
    p('最后一段。排版要克制，样式越多越乱。'),
  );
  const plan = parseComposePlan(
    JSON.stringify({
      type: '教程',
      reason: '有步骤',
      ops: [
        { op: 'insert_lead', text: '三分钟读完。' },
        { op: 'key_points', items: ['少即是多', '统一样式'] },
        { op: 'insert_heading', before: 4, text: '再看一个例子' },
        { op: 'insert_heading', before: 1, text: '标题旁边不加' },
        { op: 'pull_quote', i: 2, text: '因此排版不是锦上添花，而是决定一篇文章能不能被读完的关键。' },
        { op: 'pull_quote', i: 2, text: '这句话原文没有。' },
        { op: 'divider', after: 4 },
        { op: 'heading', i: 1 },
        { op: 'heading', i: 2 },
        { op: 'quote', i: 3 },
        { op: 'ending_cta', text: '觉得有用就转发给朋友吧。' },
        { op: 'nonsense' },
      ],
    }),
  )!;

  it('parses type, recommends a template and drops ops that do not fit', () => {
    expect(plan.type).toBe('教程');
    expect(plan.template).toBe('jiaocheng');
    const ops = validOps(d, plan.ops).map((o) => o.op);
    expect(ops).toEqual(['insert_lead', 'key_points', 'insert_heading', 'pull_quote', 'divider', 'heading', 'quote', 'ending_cta']);
    expect(parseComposePlan('不是 JSON')).toBeNull();
  });

  it('never changes the original words; new blocks are reported as added', () => {
    const { doc: out, added } = applyCompose(d, plan);
    expect(originalText(out, added)).toBe(originalText(d, []));
    expect(added.map((i) => out.content![i]!.type)).toEqual(['card', 'card', 'blockquote', 'heading', 'divider', 'card']);
    expect(out.content![2]).toMatchObject({ type: 'paragraph' });
    expect(out.content![3]).toMatchObject({ type: 'heading', attrs: { variant: 'step' } });
    // order between blocks 4 and 5: divider after 4, then the heading inserted before 5? (before 4 here)
    const types = out.content!.map((n) => n.type);
    expect(types[types.length - 2]).toBe('divider');
  });

  it('applies only the ticked items', () => {
    const items = composeItems(d, plan);
    expect(items.map((i) => i.id)).toEqual(['lead', 'points', 'h:4', `q:2:${'因此排版不是锦上添花，而是'.slice(0, 12)}`, 'dividers', 'styles', 'ending']);
    const only = applyCompose(d, plan, undefined, new Set(['lead']));
    expect(only.added).toEqual([0]);
    expect(only.doc.content!.length).toBe(d.content!.length + 1);
    expect(applyCompose(d, plan, undefined, new Set()).doc.content).toEqual(d.content);
  });
});

describe('check rules', () => {
  const block = (text: string, extra: Partial<TextBlockScan> = {}): TextBlockScan => ({
    pos: 0,
    text,
    type: 'paragraph',
    top: 0,
    code: [],
    links: [],
    ...extra,
  });

  it('spacing and punctuation', () => {
    const issues = textRules(block('用React写3个组件,很好.'));
    expect(issues.filter((i) => i.kind === 'spacing').map((i) => i.from)).toEqual([2, 7, 8, 9]);
    expect(issues.filter((i) => i.kind === 'punct').map((i) => i.fix)).toEqual([
      { type: 'text', from: 12, to: 13, insert: '，' },
      { type: 'text', from: 15, to: 16, insert: '。' },
    ]);
    expect(textRules(block('Hello，world'))[0]!.fix).toMatchObject({ insert: ', ' });
    expect(textRules(block('见（括号）和(中文括号)'))).toHaveLength(1);
  });

  it('skips code and links', () => {
    const issues = textRules(block('运行npm install即可', { code: [[2, 13]] }));
    expect(issues).toHaveLength(0);
  });

  it('long paragraphs, captions, sections, links', () => {
    const scan: DocScan = {
      blocks: [
        block(LONG, { pos: 0 }),
        block(LONG, { pos: 400 }),
        block(LONG, { pos: 800 }),
        block(LONG, { pos: 1200 }),
        block('链接', { pos: 1600, links: [{ from: 0, to: 2, href: 'www.starnote.app' }] }),
      ],
      images: [
        { pos: 2000, caption: '', alt: '辰记首页截图', src: '/a.png' },
        { pos: 2010, caption: '', alt: 'IMG_2024.png', src: '/b.png' },
      ],
    };
    const issues = ruleIssues(scan);
    const kinds = (k: string) => issues.filter((i) => i.kind === k);
    expect(kinds('paragraph')).toHaveLength(4);
    expect(kinds('paragraph')[0]!.fix).toMatchObject({ type: 'split', pos: 0 });
    expect(kinds('section')).toHaveLength(1);
    expect(kinds('link')[0]!.fix).toEqual({ type: 'link', from: 1601, to: 1603, href: 'https://www.starnote.app' });
    expect(kinds('caption').map((i) => Boolean(i.fix))).toEqual([true, false]);
  });

  it('AI typos and terms are located in the text, whole words only', () => {
    const scan: DocScan = { blocks: [block('先按装 Github，再用 github-cli 和 GitHub。')], images: [] };
    const r = parseCheckResult(JSON.stringify({ typos: [{ wrong: '按装', right: '安装' }], terms: [{ preferred: 'GitHub', variants: ['Github', 'github', 'GitHub'] }] }))!;
    const issues = aiIssues(scan, r);
    expect(issues.map((i) => [i.kind, i.from])).toEqual([
      ['typo', 2],
      ['term', 5],
      ['term', 15],
    ]);
  });

  it('fixOrder drops overlapping edits', () => {
    const issues = textRules(block('中文,English'));
    const fixes = fixOrder([...issues, ...issues]);
    expect(fixes.length).toBe(new Set(issues.map((i) => i.id)).size);
  });
});

describe('cards', () => {
  it('finds stretches of ~700 chars without a picture', () => {
    const d = doc(h(2, '一'), p(LONG), p(LONG), p(LONG), img, p(LONG), h(2, '二'), p(LONG), p(LONG), p(LONG), p(LONG));
    const gaps = findImageGaps(d);
    // 630 chars before the picture is fine; after it, the gap closes once 700 is passed
    expect(gaps.map((g) => [g.from, g.to])).toEqual([[5, 9]]);
    expect(gaps[0]!.heading).toBe('一');
    expect(gaps.every((g) => g.chars >= 600)).toBe(true);
  });

  it('parses infographic specs and only verbatim quotes', () => {
    const spec = parseInfographic(JSON.stringify({ kind: 'flow', title: '三步', items: [{ title: 'A', text: 'a' }, { title: 'B', text: 'b' }], caption: '图', alt: 'alt' }));
    expect(spec?.kind).toBe('flow');
    expect(parseInfographic(JSON.stringify({ kind: 'compare', title: 'x', items: [] }))).toBeNull();
    expect(parseQuote(JSON.stringify({ quote: '排版要克制' }), LONG)?.quote).toBe('排版要克制');
    expect(parseQuote(JSON.stringify({ quote: '编出来的话' }), LONG)).toBeNull();
  });
});

describe('estimates', () => {
  it('formats the cost line', () => {
    expect(estimateText({ credits_min: 3, credits_max: 5, balance: 120 })).toBe('约消耗 3 点 · 本月剩余 120 点');
    expect(estimateText({ credits_min: 2, credits_max: 2, balance: null })).toBe('约消耗 2 点');
    expect(estimateShort({ credits_min: 3, credits_max: 5, balance: 1 })).toBe(true);
    expect(estimateShort({ credits_min: 3, credits_max: 5, balance: 5 })).toBe(false);
    expect(estimateText(null)).toBe('');
  });
});
