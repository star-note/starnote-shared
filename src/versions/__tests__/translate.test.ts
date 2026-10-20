import { describe, expect, it, vi } from 'vitest';

import type { TiptapDoc } from '../../api/types';
import { parseJsonAnswer } from '../ai';
import { applyGlossary, collectSegments, decodeInline, translateDoc } from '../translate';

const doc: TiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '辰记入门' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '用' },
        { type: 'text', text: '辰记', marks: [{ type: 'bold' }] },
        { type: 'text', text: '写作，' },
        { type: 'text', text: '看文档', marks: [{ type: 'link', attrs: { href: 'https://starnote.app/docs' } }] },
        { type: 'hardBreak' },
        { type: 'text', text: '结束' },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const 中文 = 1' }] },
    { type: 'imageBlock', attrs: { src: '/api/v1/assets/abc', caption: '一张图' } },
  ],
};

describe('collectSegments / decodeInline', () => {
  it('encodes marks as tags, skips code, translates captions', () => {
    const { segments } = collectSegments(doc);
    expect(segments.map((s) => s.text)).toEqual(['辰记入门', '用<b>辰记</b>写作，<a1>看文档</a1><x1/>结束', '一张图']);
  });

  it('round-trips the tags back onto the same marks', () => {
    const { refs } = collectSegments(doc);
    const nodes = decodeInline('Write with <b>StarNote</b>, <a1>read the docs</a1><x1/>The end', refs[1]!);
    expect(nodes).toEqual([
      { type: 'text', text: 'Write with ' },
      { type: 'text', text: 'StarNote', marks: [{ type: 'bold' }] },
      { type: 'text', text: ', ' },
      { type: 'text', text: 'read the docs', marks: [{ type: 'link', attrs: { href: 'https://starnote.app/docs' } }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'The end' },
    ]);
  });

  it('returns null for unbalanced tags', () => {
    const { refs } = collectSegments(doc);
    expect(decodeInline('<b>oops', refs[1]!)).toBeNull();
  });
});

describe('glossary', () => {
  it('replaces leftover source terms and unifies spelling', () => {
    expect(applyGlossary('Use 辰记 and starnote daily', { 辰记: 'StarNote' })).toBe('Use StarNote and StarNote daily');
  });
});

describe('translateDoc', () => {
  it('keeps structure, images and code; applies answers by id', async () => {
    const call = vi.fn(async (_f: string, req: { user: string }) => {
      const { segments } = JSON.parse(req.user) as { segments: { id: string; text: string }[] };
      const map: Record<string, string> = {
        '辰记入门': 'Getting started with 辰记',
        '用<b>辰记</b>写作，<a1>看文档</a1><x1/>结束': 'Write with <b>StarNote</b>, <a1>read the docs</a1><x1/>The end',
        '一张图': 'A picture',
      };
      return '```json\n' + JSON.stringify({ segments: segments.map((s) => ({ id: s.id, text: map[s.text] ?? s.text })) }) + '\n```';
    });
    const out = await translateDoc(doc, { mode: 'literal', call: call as never });
    const [h, p, code, img] = out.doc.content!;
    expect(h!.content![0]!.text).toBe('Getting started with StarNote');
    expect(p!.content![1]).toEqual({ type: 'text', text: 'StarNote', marks: [{ type: 'bold' }] });
    expect(code).toEqual(doc.content![2]);
    expect(img!.attrs).toEqual({ src: '/api/v1/assets/abc', caption: 'A picture' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('parseJsonAnswer', () => {
  it('finds the JSON object inside chatter and fences', () => {
    expect(parseJsonAnswer('好的：\n```json\n{"a": "}{", "b": [1]}\n```')).toEqual({ a: '}{', b: [1] });
    expect(parseJsonAnswer('no json')).toBeNull();
  });
});
