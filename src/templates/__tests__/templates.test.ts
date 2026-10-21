import { describe, expect, it } from 'vitest';

import type { TiptapDoc, TiptapNode } from '../../api/types';
import * as legacy from '../../styles';
import {
  applyTemplateLook,
  bestLookFor,
  buildTemplateRecommendPrompt,
  buildTemplateSuggestPrompt,
  completeTemplatePicks,
  fillSuggestion,
  findTemplate,
  lookApplied,
  noteSignals,
  noteSkin,
  OFFICIAL_LOOK_LIST,
  OFFICIAL_LOOKS,
  parseTemplatePicks,
  parseTemplateSuggestion,
  planLookOps,
  recommendForNote,
  recommendTemplates,
  recommendTemplatesForNote,
  skinClassName,
  TEMPLATE_MARKER,
  templateFromSummary,
} from '../index';
import type { NoteTemplate } from '../model';

const t = (text: string): TiptapNode => ({ type: 'text', text });
const p = (text: string): TiptapNode => ({ type: 'paragraph', content: [t(text)] });
const h = (level: number, text: string, variant?: string): TiptapNode => ({
  type: 'heading',
  attrs: variant ? { level, variant } : { level },
  content: [t(text)],
});
const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });

describe('official looks', () => {
  it('are six 只换外观 templates: 素雅默认 plus one per skin, each with a callout and no heading looks', () => {
    expect(OFFICIAL_LOOK_LIST.map((s) => s.id)).toEqual(['plain', 'business', 'tech', 'warm', 'magazine', 'fresh']);
    expect(OFFICIAL_LOOKS.plain.skin).toBeNull();
    for (const s of OFFICIAL_LOOK_LIST) {
      expect(s.layout.callout?.variant).toBeTruthy();
      expect(s.layout.h2).toBeUndefined();
      expect(s.source).toBe('official');
      expect(s.kind).toBe('look');
    }
    expect(skinClassName('tech')).toBe('sn-theme sn-theme--tech');
    expect(skinClassName(null)).toBe('');
    expect(noteSkin({ theme: 'warm' })).toBe('warm');
    expect(noteSkin({ theme: 'neon' })).toBeNull();
  });
});

describe('applyTemplateLook', () => {
  const styled = doc(
    h(2, '一节', 'pill'),
    p('正文'),
    { type: 'blockquote', attrs: { variant: 'card' }, content: [p('引用')] },
    { type: 'divider', attrs: { variant: 'stars', label: null } },
    p('重点：记住这个'),
  );

  it('resets styled blocks to plain for an official style and wraps the callout', () => {
    const out = applyTemplateLook(styled, OFFICIAL_LOOKS.tech);
    const [h2, , quote, rule, card] = out.content!;
    expect(h2!.attrs).toEqual({ level: 2 });
    expect(quote!.attrs).toEqual({});
    expect(rule).toEqual({ type: 'horizontalRule' });
    expect(card!.type).toBe('card');
    expect(card!.attrs).toMatchObject({ variant: 'tip', label: '重点' });
    expect(JSON.stringify(out)).toContain('记住这个');
    // the source document is untouched; a second application changes nothing
    expect(styled.content![0]!.attrs).toMatchObject({ variant: 'pill' });
    expect(lookApplied(out, OFFICIAL_LOOKS.tech)).toBe(true);
    expect(planLookOps(out, OFFICIAL_LOOKS.tech)).toEqual([]);
  });

  it('applies a 我的模板 layout (its own looks and ending) and leaves the ending divider alone', () => {
    const mine: NoteTemplate = templateFromSummary({
      id: 'tpl-1',
      owner_type: 'user',
      title: '我的周报',
      description: '',
      layout: {
        h2: 'bar',
        quote: 'line',
        divider: 'dots',
        ending: [{ type: 'divider', attrs: { variant: 'end', label: null } }, { type: 'card', attrs: { variant: 'end', label: null }, content: [p('再见')] }],
      },
      skin: 'business',
      sort: 0,
      created_at: '',
      updated_at: '',
      can_edit: true,
    });
    expect(mine).toMatchObject({ skin: 'business', source: 'mine', canEdit: true, kind: 'content', purpose: null });
    const out = applyTemplateLook(doc(h(2, '一'), { type: 'horizontalRule' }, p('二')), mine);
    expect(out.content![0]!.attrs).toMatchObject({ variant: 'bar' });
    expect(out.content![1]).toMatchObject({ type: 'divider', attrs: { variant: 'dots' } });
    expect(out.content!.at(-1)!.attrs).toMatchObject({ variant: 'end' });
    expect(lookApplied(out, mine)).toBe(true);
    // the ending's own divider is never restyled (the 'dots' rule above it goes back to plain)
    const endIndex = out.content!.length - 2;
    const dividerOps = planLookOps(out, OFFICIAL_LOOKS.plain).filter((op) => op.op === 'divider');
    expect(dividerOps).toEqual([{ op: 'divider', i: 1, variant: null }]);
    expect(dividerOps.some((op) => 'i' in op && op.i === endIndex)).toBe(false);
    expect(findTemplate('tpl-1', [mine])).toBe(mine);
    expect(findTemplate('tech')).toBe(OFFICIAL_LOOKS.tech);
    expect(findTemplate('nope', [mine])).toBeNull();
  });
});

describe('recommendation', () => {
  it('follows the category by slug, by name, then by text; 素雅默认 when nothing matches', () => {
    expect(bestLookFor({ slug: 'frontend' })).toBe('tech');
    expect(bestLookFor({ name: '读书笔记' })).toBe('warm');
    expect(bestLookFor(null, '这篇讲创业和融资')).toBe('business');
    expect(bestLookFor(null, '随便写写')).toBe('plain');
    expect(recommendTemplates('前端').map((s) => s.id)).toEqual(['tech', 'business', 'fresh']);
    expect(recommendTemplates(null).map((s) => s.id)).toEqual(['plain', 'business', 'warm']);
  });

  it('builds the [sn-style] prompt and reads the answer, padding with rules', () => {
    const { system, user } = buildTemplateSuggestPrompt({ title: '用 React 写笔记', category: '前端', excerpt: 'x'.repeat(500) });
    expect(system).toContain(TEMPLATE_MARKER);
    expect(system).toContain('tech=科技蓝（只换外观；');
    const payload = JSON.parse(user) as { styles: string[]; excerpt: string };
    expect(payload.styles).toEqual(['plain', 'business', 'tech', 'warm', 'magazine', 'fresh']);
    expect(payload.excerpt).toHaveLength(400);
    const offered = [...OFFICIAL_LOOK_LIST];
    expect(parseTemplateSuggestion('好的 {"styles":["tech","tech","neon","warm"]}', offered)?.map((s) => s.id)).toEqual(['tech', 'warm']);
    expect(parseTemplateSuggestion('没有 json', offered)).toBeNull();
    expect(fillSuggestion(parseTemplateSuggestion('{"styles":["magazine"]}', offered), '前端', '').map((s) => s.id)).toEqual(['magazine', 'tech', 'business']);
    expect(fillSuggestion(null, null, '').map((s) => s.id)).toEqual(['plain', 'business', 'warm']);
  });
});

describe('recommendation by content (r10)', () => {
  const content = (key: string, name: string, purpose: string, skin: NoteTemplate['skin'], description = ''): NoteTemplate => ({
    id: `official-${key}`,
    name,
    description: description || `${name}的版式，适合写${purpose}`,
    skin,
    layout: {},
    kind: 'content',
    purpose,
    source: 'official',
  });
  const CONTENTS = [
    content('zhishi', '知识干货', '知识', 'tech', '序号小节、重点提示框、引文卡片，适合方法论'),
    content('chanpin', '产品发布', '产品', 'business'),
    content('zhoubao', '周报 / 月报', '周报', 'business', '概览卡片、完成与待办清单、风险提醒'),
    content('dushu', '读书笔记', '读书', 'warm'),
    content('huodong', '活动通知', '活动', 'fresh'),
    content('fangtan', '访谈', '访谈', 'magazine'),
    content('jiaocheng', '教程步骤', '教程', 'tech', 'STEP 步骤标题、准备清单、代码与注意事项'),
    content('suibi', '极简随笔', '随笔', null),
  ];
  const ALL = [...CONTENTS, ...OFFICIAL_LOOK_LIST];
  const mine: NoteTemplate = { id: 'tpl-mine', name: '团队周会纪要', description: '', skin: 'business', layout: {}, kind: 'content', purpose: null, source: 'mine' };
  const doc = (...nodes: TiptapNode[]): TiptapDoc => ({ type: 'doc', content: nodes });
  const list = (...items: string[]): TiptapNode => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i), { type: 'bulletList', content: [{ type: 'listItem', content: [p('子项')] }] }] })) });

  it('reads the note: title, opening and shape (nested lists count once)', () => {
    const sig = noteSignals({
      title: '第 12 周周报',
      category: '职场',
      doc: doc(p('本周完成了三件事'), h(2, '完成'), list('上线', '复盘'), h(2, '待办'), { type: 'table', content: [] }, { type: 'image' }, { type: 'codeBlock', content: [t('x')] }),
    });
    expect(sig).toMatchObject({ title: '第 12 周周报', category: '职场', headings: 2, lists: 1, tables: 1, images: 1, code: 1 });
    expect(sig.opening.startsWith('本周完成了三件事')).toBe(true);
  });

  it('the rules recommend templates, not only looks: at least one content template, by 用途', () => {
    const weekly = noteSignals({ title: '第 12 周周报', doc: doc(p('本周进展'), { type: 'table', content: [] }) });
    const picks = recommendForNote(weekly, ALL);
    expect(picks).toHaveLength(3);
    expect(picks[0]!.template.id).toBe('official-zhoubao');
    expect(picks.filter((x) => x.template.kind === 'content').length).toBeGreaterThanOrEqual(1);
    expect(picks[0]!.reason).toContain('周报');
    for (const x of picks) expect(x.reason.length).toBeGreaterThan(4);

    const tutorial = noteSignals({ title: '如何在 Mac 上安装 Python', category: '编程', doc: doc(p('第一步'), { type: 'codeBlock', content: [t('brew install python')] }) });
    const tp = recommendForNote(tutorial, ALL);
    expect(tp[0]!.template.id).toBe('official-jiaocheng');
    expect(tp.some((x) => x.template.id === 'tech')).toBe(true);
    // nothing to go on: still a content template among the three
    const blank = recommendForNote(noteSignals({ title: '', doc: doc() }), ALL);
    expect(blank.some((x) => x.template.kind === 'content')).toBe(true);
    // a 我的 template whose name shares the title's words is offered first
    const meeting = recommendForNote(noteSignals({ title: '周会纪要 10 月', doc: doc(p('x')) }), [...ALL, mine]);
    expect(meeting[0]!.template.id).toBe('tpl-mine');
  });

  it('a note that already wears a content template may get looks; the current one is never offered; 换一批 moves on', () => {
    const sig = noteSignals({ title: '第 12 周周报', doc: doc(p('x')) });
    const zhoubao = CONTENTS[2]!;
    const worn = recommendForNote(sig, ALL, { current: zhoubao });
    expect(worn.map((x) => x.template.id)).not.toContain('official-zhoubao');
    expect(worn[0]!.template.kind).toBe('look');
    const first = recommendForNote(sig, ALL);
    const next = recommendForNote(sig, ALL, { exclude: first.map((x) => x.template.id) });
    expect(next.some((x) => first.some((f) => f.template.id === x.template.id))).toBe(false);
    expect(next.some((x) => x.template.kind === 'content')).toBe(true);
  });

  it('builds the [sn-style] prompt over every candidate with the note\'s structure', () => {
    const sig = noteSignals({ title: '用 React 写笔记', category: '前端', doc: doc(h(2, '一'), h(2, '二'), p('x'.repeat(500))) });
    const { system, user } = buildTemplateRecommendPrompt({ signals: sig, candidates: [...ALL, mine], current: OFFICIAL_LOOKS.tech });
    expect(system).toContain(TEMPLATE_MARKER);
    expect(system).toContain('至少 1 款必须是 kind=content');
    const payload = JSON.parse(user) as { candidates: { id: string; kind: string; purpose: string; brief: string }[]; structure: { headings: number }; opening: string };
    expect(payload.candidates).toHaveLength(ALL.length); // + mine − the current look
    expect(payload.candidates.find((c) => c.id === 'official-zhoubao')).toMatchObject({ kind: 'content', purpose: '周报' });
    expect(payload.candidates.some((c) => c.id === 'tech')).toBe(false);
    expect(payload.structure.headings).toBe(2);
    expect(payload.opening.length).toBeLessThanOrEqual(300);
    // wearing a content template lifts the rule
    expect(buildTemplateRecommendPrompt({ signals: sig, candidates: ALL, current: CONTENTS[0] }).system).not.toContain('至少 1 款');
  });

  it('reads the answer: candidate ids only, reasons kept; pads with rules and forces a content template', async () => {
    const sig = noteSignals({ title: '一本小说的读后感', doc: doc(p('《活着》')) });
    const input = { signals: sig, candidates: ALL };
    const picked = parseTemplatePicks('好的 {"picks":[{"id":"warm","reason":"文艺暖适合读后感"},{"id":"neon","reason":"x"},{"id":"warm"},{"id":"magazine","reason":"杂志"}]}', ALL);
    expect(picked?.map((x) => x.template.id)).toEqual(['warm', 'magazine']);
    expect(picked?.[0]!.reason).toBe('文艺暖适合读后感');
    expect(parseTemplatePicks('{"styles":["fresh"],"reason":"旧格式"}', ALL)?.[0]).toMatchObject({ reason: '旧格式' });
    expect(parseTemplatePicks('没有 json', ALL)).toBeNull();
    const done = completeTemplatePicks(picked, input);
    expect(done).toHaveLength(3);
    expect(done.some((x) => x.template.id === 'official-dushu')).toBe(true);
    // three looks from the model: the last gives way to the best content template
    const looksOnly = parseTemplatePicks('{"picks":[{"id":"warm","reason":"a"},{"id":"magazine","reason":"b"},{"id":"plain","reason":"c"}]}', ALL);
    expect(completeTemplatePicks(looksOnly, input).map((x) => x.template.id)).toEqual(['warm', 'magazine', 'official-dushu']);
    // end to end: AI answer used; no caller / a failed call → rules, still with a content template
    expect((await recommendTemplatesForNote(input, async () => '{"picks":[{"id":"official-suibi","reason":"短文"}]}')).source).toBe('ai');
    const off = await recommendTemplatesForNote(input, null);
    expect(off.source).toBe('rules');
    expect(off.picks.some((x) => x.template.kind === 'content')).toBe(true);
    const failed = await recommendTemplatesForNote(input, async () => {
      throw new Error('down');
    });
    expect(failed.source).toBe('rules');
  });
});

describe('r9 compat entry (@starnote/shared/styles)', () => {
  it('keeps the old names as aliases of the template module', () => {
    expect(legacy.OFFICIAL_STYLES).toBe(OFFICIAL_LOOKS);
    expect(legacy.OFFICIAL_STYLE_LIST).toBe(OFFICIAL_LOOK_LIST);
    expect(legacy.applyStyle).toBe(applyTemplateLook);
    expect(legacy.recommendStyles).toBe(recommendTemplates);
    expect(legacy.findStyle).toBe(findTemplate);
    expect(legacy.STYLE_MARKER).toBe(TEMPLATE_MARKER);
    expect(typeof legacy.stylesApi.setNoteStyle).toBe('function');
  });
});

describe('templateFromSummary', () => {
  it('reads kind / purpose / thumbnail and tells official content templates from looks', () => {
    const base = { title: 'x', description: '', layout: {}, sort: 0, created_at: '', updated_at: '', can_edit: true } as const;
    const official = templateFromSummary({ ...base, id: 'official-zhoubao', owner_type: 'official', kind: 'content', purpose: '周报', skin: 'business', thumbnail: '/t.png' });
    expect(official).toMatchObject({ source: 'official', kind: 'content', purpose: '周报', skin: 'business', thumbnail: '/t.png', canEdit: false });
    const look = templateFromSummary({ ...base, id: 'tech', owner_type: 'official', kind: 'look', skin: 'tech' });
    expect(look.kind).toBe('look');
    const group = templateFromSummary({ ...base, id: 'g1', owner_type: 'group', owner_id: 'grp', owner_name: '产品组', skin: 'neon' });
    expect(group).toMatchObject({ source: 'group', ownerId: 'grp', ownerName: '产品组', skin: null, kind: 'content' });
    // the official content template resolves through the lists, the looks through the constant
    expect(findTemplate('official-zhoubao', [official])).toBe(official);
    expect(findTemplate('official-zhoubao')).toBeNull();
    expect(findTemplate('tech')).toBe(OFFICIAL_LOOKS.tech);
  });
});
