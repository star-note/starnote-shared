import { describe, expect, it } from 'vitest';

import type { TiptapDoc, TiptapNode } from '../../api/types';
import * as legacy from '../../styles';
import {
  applyTemplateLook,
  bestLookFor,
  buildTemplateSuggestPrompt,
  fillSuggestion,
  findTemplate,
  lookApplied,
  noteSkin,
  OFFICIAL_LOOK_LIST,
  OFFICIAL_LOOKS,
  parseTemplateSuggestion,
  planLookOps,
  recommendTemplates,
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
