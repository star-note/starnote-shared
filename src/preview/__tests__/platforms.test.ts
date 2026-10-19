import { describe, expect, it } from 'vitest';

import { defaultDevice, PREVIEW_ORDER, previewPlatform, shareCardsFor } from '../platforms';

describe('preview device per platform', () => {
  it('previews app-first platforms on a phone and blogs / docs on a computer', () => {
    expect(defaultDevice('wechat')).toBe('mobile');
    expect(defaultDevice('xiaohongshu')).toBe('mobile');
    expect(defaultDevice('zhihu')).toBe('mobile');
    for (const p of ['chenji', 'medium', 'juejin', 'github', 'yuque'] as const)
      expect(defaultDevice(p)).toBe('pc');
    expect(PREVIEW_ORDER).toHaveLength(8);
  });

  it('shows the cards relevant to the chosen platforms, always with the 辰记 link card first', () => {
    expect(shareCardsFor([])).toEqual(['chenji-link']);
    expect(shareCardsFor(['xiaohongshu'])).toEqual(['chenji-link', 'xhs-note']);
    expect(shareCardsFor(['wechat'])).toEqual([
      'chenji-link',
      'wechat-chat',
      'wechat-moments',
      'mp-lead',
      'mp-sub',
    ]);
    expect(shareCardsFor(['medium', 'juejin'])).toEqual(['chenji-link', 'x-card', 'link']);
  });

  it('names every platform without the host app', () => {
    expect(previewPlatform('chenji').label).toBe('辰记博客');
    expect(previewPlatform('github')).toMatchObject({
      label: 'GitHub Pages',
      device: 'pc',
      domain: 'github.io',
    });
    for (const p of PREVIEW_ORDER) expect(previewPlatform(p).color).toMatch(/^#/);
  });
});
