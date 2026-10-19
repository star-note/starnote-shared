import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { applyTitle, spliceOf } from '../bindTitle';

describe('title binding', () => {
  it('computes the minimal splice', () => {
    expect(spliceOf('abc', 'abc')).toBeNull();
    expect(spliceOf('abc', 'abXc')).toEqual({ index: 2, remove: 0, insert: 'X' });
    expect(spliceOf('标题', '新标题')).toEqual({ index: 0, remove: 0, insert: '新' });
    expect(spliceOf('hello world', 'hello')).toEqual({ index: 5, remove: 6, insert: '' });
    expect(spliceOf('aXb', 'aYb')).toEqual({ index: 1, remove: 1, insert: 'Y' });
  });

  it('two people editing different ends of the title merge', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    applyTitle(a.getText('title'), '周报');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    applyTitle(a.getText('title'), '第一周周报');
    applyTitle(b.getText('title'), '周报（定稿）');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getText('title').toString()).toBe('第一周周报（定稿）');
    expect(b.getText('title').toString()).toBe(a.getText('title').toString());
  });
});
