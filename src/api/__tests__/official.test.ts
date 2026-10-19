import { describe, expect, it } from 'vitest';

import { guideHref, platformGuideHref, type OfficialGuides } from '../official';

const data: OfficialGuides = {
  guides: [{ key: 'platforms', note_id: 'overview', title: '辰记多平台发布总览' }],
  group: null,
  byPlatform: { zhihu: { note_id: 'zh', title: '知乎发布指南' } },
};

describe('official guides links', () => {
  it('links a platform to its own guide, else to the overview', () => {
    expect(platformGuideHref(data, 'zhihu')).toBe('/notes/zh');
    expect(platformGuideHref(data, 'medium')).toBe('/notes/overview');
    expect(guideHref(data, 'platforms')).toBe('/notes/overview');
  });

  it('falls back when the endpoint predates guides_by_platform', () => {
    expect(platformGuideHref({ guides: [], group: null }, 'zhihu')).toBe('/groups');
    expect(platformGuideHref(undefined, 'zhihu')).toBe('/groups');
  });
});
