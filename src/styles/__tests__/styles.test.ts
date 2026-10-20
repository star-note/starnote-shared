import { describe, expect, it } from 'vitest';

import type { TiptapDoc, TiptapNode } from '../../api/types';
import {
  applyStyle,
  bestStyleFor,
  buildStyleSuggestPrompt,
  fillSuggestion,
  findStyle,
  noteSkin,
  OFFICIAL_STYLE_LIST,
  OFFICIAL_STYLES,
  parseStyleSuggestion,
  planStyleOps,
  recommendStyles,
  skinClassName,
  STYLE_MARKER,
  styleApplied,
  styleFromTemplate,
} from '../index';
import type { Style } from '../types';

const t = (text: string): TiptapNode => ({ type: 'text', text });
const p = (text: string): TiptapNode => ({ type: 'paragraph', content: [t(text)] });
const h = (level: number, text: string, variant?: string): TiptapNode => ({
  type: 'heading',
  attrs: variant ? { level, variant } : { level },
  content: [t(text)],
});
const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });

describe('official styles', () => {
  it('are six: 素雅默认 plus one per skin, each with a callout and no heading looks', () => {
    expect(OFFICIAL_STYLE_LIST.map((s) => s.id)).toEqual(['plain', 'business', 'tech', 'warm', 'magazine', 'fresh']);
    expect(OFFICIAL_STYLES.plain.skin).toBeNull();
    for (const s of OFFICIAL_STYLE_LIST) {
      expect(s.layout.callout?.variant).toBeTruthy();
      expect(s.layout.h2).toBeUndefined();
      expect(s.source).toBe('official');
    }
    expect(skinClassName('tech')).toBe('sn-theme sn-theme--tech');
    expect(skinClassName(null)).toBe('');
    expect(noteSkin({ theme: 'warm' })).toBe('warm');
    expect(noteSkin({ theme: 'neon' })).toBeNull();
  });
});

describe('applyStyle', () => {
  const styled = doc(
    h(2, '一节', 'pill'),
    p('正文'),
    { type: 'blockquote', attrs: { variant: 'card' }, content: [p('引用')] },
    { type: 'divider', attrs: { variant: 'stars', label: null } },
    p('重点：记住这个'),
  );

  it('resets styled blocks to plain for an official style and wraps the callout', () => {
    const out = applyStyle(styled, OFFICIAL_STYLES.tech);
    const [h2, , quote, rule, card] = out.content!;
    expect(h2!.attrs).toEqual({ level: 2 });
    expect(quote!.attrs).toEqual({});
    expect(rule).toEqual({ type: 'horizontalRule' });
    expect(card!.type).toBe('card');
    expect(card!.attrs).toMatchObject({ variant: 'tip', label: '重点' });
    expect(JSON.stringify(out)).toContain('记住这个');
    // the source document is untouched; a second application changes nothing
    expect(styled.content![0]!.attrs).toMatchObject({ variant: 'pill' });
    expect(styleApplied(out, OFFICIAL_STYLES.tech)).toBe(true);
    expect(planStyleOps(out, OFFICIAL_STYLES.tech)).toEqual([]);
  });

  it('applies a 我的风格 layout (its own looks and ending) and leaves the ending divider alone', () => {
    const mine: Style = styleFromTemplate({
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
    expect(mine).toMatchObject({ skin: 'business', source: 'mine', canEdit: true });
    const out = applyStyle(doc(h(2, '一'), { type: 'horizontalRule' }, p('二')), mine);
    expect(out.content![0]!.attrs).toMatchObject({ variant: 'bar' });
    expect(out.content![1]).toMatchObject({ type: 'divider', attrs: { variant: 'dots' } });
    expect(out.content!.at(-1)!.attrs).toMatchObject({ variant: 'end' });
    expect(styleApplied(out, mine)).toBe(true);
    // the ending's own divider is never restyled (the 'dots' rule above it goes back to plain)
    const endIndex = out.content!.length - 2;
    const dividerOps = planStyleOps(out, OFFICIAL_STYLES.plain).filter((op) => op.op === 'divider');
    expect(dividerOps).toEqual([{ op: 'divider', i: 1, variant: null }]);
    expect(dividerOps.some((op) => 'i' in op && op.i === endIndex)).toBe(false);
    expect(findStyle('tpl-1', [mine])).toBe(mine);
    expect(findStyle('tech')).toBe(OFFICIAL_STYLES.tech);
    expect(findStyle('nope', [mine])).toBeNull();
  });
});

describe('recommendation', () => {
  it('follows the category by slug, by name, then by text; 素雅默认 when nothing matches', () => {
    expect(bestStyleFor({ slug: 'frontend' })).toBe('tech');
    expect(bestStyleFor({ name: '读书笔记' })).toBe('warm');
    expect(bestStyleFor(null, '这篇讲创业和融资')).toBe('business');
    expect(bestStyleFor(null, '随便写写')).toBe('plain');
    expect(recommendStyles('前端').map((s) => s.id)).toEqual(['tech', 'business', 'fresh']);
    expect(recommendStyles(null).map((s) => s.id)).toEqual(['plain', 'business', 'warm']);
  });

  it('builds the [sn-style] prompt and reads the answer, padding with rules', () => {
    const { system, user } = buildStyleSuggestPrompt({ title: '用 React 写笔记', category: '前端', excerpt: 'x'.repeat(500) });
    expect(system).toContain(STYLE_MARKER);
    expect(system).toContain('tech=科技蓝');
    const payload = JSON.parse(user) as { styles: string[]; excerpt: string };
    expect(payload.styles).toEqual(['plain', 'business', 'tech', 'warm', 'magazine', 'fresh']);
    expect(payload.excerpt).toHaveLength(400);
    const offered = [...OFFICIAL_STYLE_LIST];
    expect(parseStyleSuggestion('好的 {"styles":["tech","tech","neon","warm"]}', offered)?.map((s) => s.id)).toEqual(['tech', 'warm']);
    expect(parseStyleSuggestion('没有 json', offered)).toBeNull();
    expect(fillSuggestion(parseStyleSuggestion('{"styles":["magazine"]}', offered), '前端', '').map((s) => s.id)).toEqual(['magazine', 'tech', 'business']);
    expect(fillSuggestion(null, null, '').map((s) => s.id)).toEqual(['plain', 'business', 'warm']);
  });
});
