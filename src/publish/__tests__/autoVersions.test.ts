import { describe, expect, it } from 'vitest';

import { keysOfRun, namePlatforms, neededVersions, summarySentence } from '../autoVersions';

describe('autoVersions rules', () => {
  it('derives the needed versions from the ticked platforms', () => {
    expect(neededVersions(['chenji'])).toEqual([]);
    expect(
      neededVersions(['chenji', 'xiaohongshu', 'devto', 'medium', 'github-pages', 'weibo', 'x']),
    ).toEqual([
      { kind: 'xhs', platforms: ['xiaohongshu'] },
      { kind: 'en', platforms: ['devto', 'medium', 'github-pages', 'x'] },
      { kind: 'condensed', platforms: ['weibo'] },
    ]);
    // Instagram takes the image set, not the English version
    expect(neededVersions(['instagram'])).toEqual([{ kind: 'xhs', platforms: ['instagram'] }]);
    expect(neededVersions(['wechat', 'zhihu'])).toEqual([]);
  });

  it('names platforms briefly', () => {
    expect(namePlatforms(['小红书'])).toBe('小红书');
    expect(namePlatforms(['DEV', 'Medium'])).toBe('DEV 和 Medium');
    expect(namePlatforms(['DEV', 'Medium', 'X', 'LinkedIn'])).toBe('DEV、Medium 等 4 个平台');
  });

  it('writes the one-sentence notice', () => {
    expect(
      summarySentence([
        { kind: 'xhs', names: ['小红书'], ready: true, cards: 8 },
        { kind: 'en', names: ['DEV'], ready: true },
      ]),
    ).toBe('已为小红书准备 8 张图集、为 DEV 准备英文版');
    expect(
      summarySentence([
        { kind: 'xhs', names: ['小红书'], ready: false },
        { kind: 'en', names: ['DEV', 'Medium 导入'], ready: true },
      ]),
    ).toBe('已为 DEV 和 Medium 导入准备英文版；发布时会为小红书准备图集');
    expect(summarySentence([])).toBe('');
  });

  it('lists the platforms of a run', () => {
    expect(
      keysOfRun({
        chenji: true,
        github: {},
        relay: [{ key: 'devto' }],
        share: [{ key: 'x' }],
        desk: [{ key: 'wechat' }],
      }),
    ).toEqual(['chenji', 'github-pages', 'devto', 'x', 'wechat']);
    expect(keysOfRun({ chenji: false, keys: ['zhihu'] })).toEqual(['zhihu']);
  });
});
