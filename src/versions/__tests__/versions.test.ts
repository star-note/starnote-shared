import { describe, expect, it, vi } from 'vitest';

import type { TiptapDoc } from '../../api/types';
import type { NoteVersionSummary } from '../../api/versions';
import { blocksToDoc, condenseBlocks, condenseRewrite } from '../condense';
import { defaultChoice, versionKindsFor } from '../platformVersions';

const v = (id: string, kind: NoteVersionSummary['kind'], updated = '2026-10-19T00:00:00Z'): NoteVersionSummary => ({
  id,
  kind,
  title: id,
  options: {},
  source_version: 1,
  stale: false,
  created_at: updated,
  updated_at: updated,
});

describe('platform versions', () => {
  it('offers the image set to 小红书, English to overseas platforms, 精简版 to article platforms', () => {
    expect(versionKindsFor('chenji')).toEqual([]);
    expect(versionKindsFor('xiaohongshu')).toEqual(['xhs']);
    expect(versionKindsFor('devto')).toEqual(['en', 'condensed']);
    expect(versionKindsFor('zhihu')).toEqual(['condensed']);
    expect(versionKindsFor('github-pages')).toEqual(['condensed']);
  });

  it('defaults to the newest image set / English version', () => {
    const list = [v('a', 'en', '2026-10-01T00:00:00Z'), v('b', 'en', '2026-10-02T00:00:00Z'), v('x', 'xhs')];
    expect(defaultChoice('devto', list)).toBe('b');
    expect(defaultChoice('xiaohongshu', list)).toBe('x');
    expect(defaultChoice('zhihu', list)).toBe('original');
    expect(defaultChoice('github-pages', list)).toBe('original');
  });
});

describe('condense (rewrite)', () => {
  const doc: TiptapDoc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '背景' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '第一段。' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '要点' }] }] }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用' }] }] },
    ],
  };

  it('reads blocks and rebuilds a doc', () => {
    const blocks = condenseBlocks(doc);
    expect(blocks).toEqual([
      { kind: 'h2', text: '背景' },
      { kind: 'p', text: '第一段。' },
      { kind: 'li', text: '要点' },
      { kind: 'quote', text: '引用' },
    ]);
    expect(blocksToDoc(blocks).content!.map((n) => n.type)).toEqual(['heading', 'paragraph', 'bulletList', 'blockquote']);
  });

  it('turns the AI answer into a doc and errors on garbage', async () => {
    const ok = vi.fn(async () => '{"blocks":[{"kind":"h2","text":"背景"},{"kind":"p","text":"短。"}]}');
    const r = await condenseRewrite(doc, 800, { call: ok as never });
    expect(r.doc.content).toHaveLength(2);
    await expect(condenseRewrite(doc, 800, { call: (async () => 'nope') as never })).rejects.toThrow();
  });
});
