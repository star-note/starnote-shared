import type { PublishQuota } from '../../api/types';
import { MODE_HINT, PUBLISH_PREF_ITEMS, publishPrefsOf } from '../prefs';
import { externalCount, quotaLine } from '../quota';

const quota = (over: Partial<PublishQuota> = {}): PublishQuota => ({
  period: '2026-10',
  used: 3,
  limit: 30,
  remaining: 27,
  unlimited: false,
  plan: 'free',
  ...over,
});

describe('publish preferences', () => {
  it('fills the server defaults in', () => {
    const p = publishPrefsOf(null);
    expect(p.remember_platforms).toBe(true);
    expect(p.auto_translate_en).toBe(false);
    expect(p.plan_collapsed).toBe(true);
    expect(p.publish_intro_seen).toBe(false);
    expect(p.last_platforms).toEqual([]);
  });
  it('keeps what the server says', () => {
    const p = publishPrefsOf({
      ai_cover: false,
      plan_collapsed: false,
      last_platforms: ['chenji', 'devto'],
    });
    expect(p.ai_cover).toBe(false);
    expect(p.plan_collapsed).toBe(false);
    expect(p.last_platforms).toEqual(['chenji', 'devto']);
  });
  it('lists the seven switches, without the first-use flag', () => {
    expect(PUBLISH_PREF_ITEMS.map((i) => i.key)).toEqual([
      'remember_platforms',
      'ai_category',
      'ai_tags_summary',
      'ai_cover',
      'auto_versions',
      'auto_translate_en',
      'plan_collapsed',
    ]);
    expect(MODE_HINT.manual).toBe('自己逐项填写');
  });
});

describe('quotaLine', () => {
  it('is quiet under the limit and never counts 辰记', () => {
    expect(externalCount(['chenji', 'devto'])).toBe(1);
    const q = quotaLine(quota(), externalCount(['chenji']));
    expect(q).toEqual({ text: '本月已发布 3/30（辰记博客不计）', over: false, detail: null });
  });
  it('turns over when the ticked platforms do not fit', () => {
    const q = quotaLine(quota({ used: 29, remaining: 1 }), 2);
    expect(q?.over).toBe(true);
    expect(q?.detail).toContain('本月只剩 1 次');
    expect(quotaLine(quota({ used: 30, remaining: 0 }), 1)?.detail).toContain('已用完');
  });
  it('says 不限 for Pro and is never over', () => {
    const q = quotaLine(quota({ unlimited: true, plan: 'pro' }), 9);
    expect(q).toEqual({ text: '本月已发布 3/不限', over: false, detail: null });
  });
  it('shows nothing on an older API', () => {
    expect(quotaLine(null, 1)).toBeNull();
  });
});
