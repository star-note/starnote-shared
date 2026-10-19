import { describe, expect, it } from 'vitest';

import { templateNoteTitle } from '../title';

describe('templateNoteTitle', () => {
  it('uses the template name without the sample prefix', () => {
    expect(templateNoteTitle('知识干货')).toBe('知识干货');
    expect(templateNoteTitle('模板示例 · 周报 / 月报')).toBe('周报 / 月报');
    expect(templateNoteTitle('  模板示例·访谈 ')).toBe('访谈');
    expect(templateNoteTitle(null)).toBe('');
  });
});
