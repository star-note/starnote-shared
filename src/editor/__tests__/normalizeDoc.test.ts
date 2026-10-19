import { describe, expect, it } from 'vitest';

import type { TiptapDoc } from '../../api/types';
import { hasBody, normalizeDoc } from '../normalizeDoc';

describe('normalizeDoc', () => {
  it('maps horizontalRule (top level and nested) to the line divider', () => {
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'horizontalRule' },
        { type: 'blockquote', content: [{ type: 'horizontalRule' }] },
      ],
    };
    const out = normalizeDoc(doc);
    expect(out.content?.[1]).toEqual({ type: 'divider', attrs: { variant: 'line', label: null } });
    expect(out.content?.[2].content?.[0].type).toBe('divider');
    expect(out.content?.[0]).toBe(doc.content?.[0]);
    expect(doc.content?.[1].type).toBe('horizontalRule'); // input untouched
  });

  it('returns the same object when nothing changes', () => {
    const doc: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(normalizeDoc(doc)).toBe(doc);
    expect(normalizeDoc(null)).toBeNull();
  });

  it('hasBody ignores empty paragraphs', () => {
    expect(hasBody({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
    expect(hasBody({ type: 'doc', content: [{ type: 'divider' }] })).toBe(true);
    expect(hasBody(null)).toBe(false);
  });
});
