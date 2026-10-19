import { describe, expect, it } from 'vitest';

import type { TemplateLayout } from '../../api/templates';
import type { TiptapDoc, TiptapNode } from '../../api/types';
import {
  applyLayoutOps,
  buildLayoutPrompt,
  deriveLayout,
  describeBlocks,
  parseLayoutOps,
  planLayout,
} from '../layout';

const t = (text: string): TiptapNode => ({ type: 'text', text });
const p = (text: string): TiptapNode => ({ type: 'paragraph', content: [t(text)] });
const h = (level: number, text: string): TiptapNode => ({
  type: 'heading',
  attrs: { level },
  content: [t(text)],
});
const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });

const ending: TiptapNode[] = [
  { type: 'divider', attrs: { variant: 'end', label: null } },
  { type: 'card', attrs: { variant: 'end', label: null }, content: [p('点个在看')] },
];
const layout: TemplateLayout = {
  h2: 'pill',
  h3: 'bar',
  quote: 'card',
  divider: 'wave',
  callout: { variant: 'tip', label: '重点' },
  ending,
};

const note = doc(
  h(2, '第一节'),
  p('正文'),
  { type: 'blockquote', content: [p('引文')] },
  p('重点：别忘了保存'),
  { type: 'horizontalRule' },
  h(3, '小节'),
  p(''),
);

describe('套用版式', () => {
  it('plans the rule-based mapping', () => {
    expect(planLayout(note, layout)).toEqual([
      { op: 'heading', i: 0, variant: 'pill' },
      { op: 'quote', i: 2, variant: 'card' },
      { op: 'card', from: 3, to: 3, variant: 'tip', label: '重点' },
      { op: 'divider', i: 4, variant: 'wave' },
      { op: 'heading', i: 5, variant: 'bar' },
      { op: 'ending' },
    ]);
  });

  it('applies ops without changing any text, and appends the ending once', () => {
    const out = applyLayoutOps(note, planLayout(note, layout), layout);
    const types = (out.content ?? []).map((n) => n.type);
    expect(types).toEqual([
      'heading',
      'paragraph',
      'blockquote',
      'card',
      'divider',
      'heading',
      'divider',
      'card',
    ]);
    expect(out.content?.[0]?.attrs?.variant).toBe('pill');
    expect(out.content?.[3]?.attrs).toEqual({ variant: 'tip', label: '重点' });
    expect(out.content?.[4]?.attrs?.variant).toBe('wave');
    expect(JSON.stringify(out)).toContain('重点：别忘了保存');
    // Running it again does not add a second ending.
    const again = applyLayoutOps(out, planLayout(out, layout), layout);
    expect(again.content?.length).toBe(out.content?.length);
    // The source is untouched.
    expect(note.content?.[0]?.attrs?.variant).toBeUndefined();
  });

  it('ignores ops that do not fit their block', () => {
    const out = applyLayoutOps(
      note,
      [
        { op: 'heading', i: 1, variant: 'pill' },
        { op: 'quote', i: 99, variant: 'card' },
        { op: 'card', from: 0, to: 2, variant: 'soft' },
        { op: 'card', from: 1, to: 3, variant: 'soft' },
        { op: 'divider', after: 1, variant: 'leaf' },
      ],
      layout,
    );
    expect(out.content?.[0]?.type).toBe('card');
    expect(out.content?.[0]?.content?.length).toBe(3);
    expect(out.content?.[1]?.type).toBe('divider');
    expect(JSON.stringify(out)).not.toContain('"variant":"pill"');
  });

  it('parses and sanitises a model answer', () => {
    const text =
      '好的：\n```json\n{"ops":[{"op":"heading","i":0,"variant":"pill"},{"op":"heading","i":1,"variant":"evil\\"><x>"},{"op":"card","from":3,"to":2,"variant":"tip"},{"op":"ending"}]}\n```';
    expect(parseLayoutOps(text)).toEqual([
      { op: 'heading', i: 0, variant: 'pill' },
      { op: 'ending' },
    ]);
    expect(parseLayoutOps('没有 JSON')).toBeNull();
  });

  it('builds a prompt the mock model understands', () => {
    const { system, user } = buildLayoutPrompt(note, '知识干货', layout);
    expect(system).toContain('[sn-layout]');
    expect(user).toContain('约定JSON: {"h2":"pill"');
    expect(user).toContain('0. h2: 第一节');
    expect(describeBlocks(note)[4]).toBe('4. hr: ');
  });

  it('derives a layout from a styled document', () => {
    const styled = applyLayoutOps(note, planLayout(note, layout), layout);
    const derived = deriveLayout(styled);
    expect(derived.h2).toBe('pill');
    expect(derived.h3).toBe('bar');
    expect(derived.quote).toBe('card');
    expect(derived.divider).toBe('wave');
    expect(derived.callout).toEqual({ variant: 'tip', label: '重点' });
    expect(derived.ending?.length).toBe(2);
  });
});
