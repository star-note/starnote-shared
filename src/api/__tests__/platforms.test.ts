import { normalizeHot } from '../inspiration';
import { FALLBACK_PLATFORMS, normalizePlatforms } from '../platforms';

describe('normalizePlatforms (GET /me/platforms fallback)', () => {
  it('draws the fixed list, 辰记 bound, when the endpoint is missing', () => {
    for (const res of [null, undefined, { detail: 'Not Found' }, [], 'nope']) {
      const rows = normalizePlatforms(res, 'demo');
      expect(rows.map((r) => r.platform)).toEqual(FALLBACK_PLATFORMS.map((p) => p.platform));
      expect(rows[0]).toMatchObject({
        platform: 'chenji',
        bound: true,
        account_name: '@demo',
        is_mock: true,
      });
      rows.slice(1).forEach((r) => {
        expect(r.bound).toBe(false);
        expect(r.posts).toBe(0);
        expect(r.bind_url).toContain(`bind=${r.platform}`);
        expect(r.apply_url).toBeTruthy();
      });
    }
  });
  it('keeps server rows and fills missing counters with zeros', () => {
    const rows = normalizePlatforms(
      [
        {
          platform: 'chenji',
          name: '辰记',
          bound: true,
          account_name: '@lu',
          posts: 3,
          reads_7d: 42,
          last_published_at: '2026-10-01T00:00:00Z',
          apply_url: null,
          bind_url: null,
          is_mock: false,
        },
        { platform: 'zhihu', bound: false },
      ],
      'lu',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ posts: 3, reads_7d: 42, is_mock: false });
    expect(rows[1]).toMatchObject({
      name: '知乎',
      posts: 0,
      reads_7d: 0,
      apply_url: 'https://www.zhihu.com/creator',
      is_mock: false,
    });
  });
  it('accepts a paged envelope too', () => {
    const rows = normalizePlatforms({
      items: [{ platform: 'juejin', bound: false, posts: 1 }],
      total: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].posts).toBe(1);
  });
});

describe('normalizeHot (GET /inspiration/hot)', () => {
  it('returns no sources for a missing endpoint', () => {
    expect(normalizeHot(null).sources).toEqual([]);
    expect(normalizeHot({ detail: 'Not Found' }).sources).toEqual([]);
  });
  it('drops empty or malformed sources and marks mock sources', () => {
    const feed = normalizeHot({
      sources: [
        {
          key: 'zhihu',
          name: '知乎热榜',
          items: [{ title: 'A', url: 'https://z', heat: 10, is_mock: true }],
        },
        { key: 'empty', name: '空', items: [] },
        { key: 'bad', items: 'x' },
        {
          key: 'hn',
          name: 'Hacker News',
          is_mock: false,
          items: [{ title: 'B', url: 'https://hn' }],
        },
      ],
    });
    expect(feed.sources.map((s) => s.key)).toEqual(['zhihu', 'hn']);
    expect(feed.sources[0].is_mock).toBe(true);
    expect(feed.sources[1].is_mock).toBe(false);
    expect(feed.sources[1].items[0].heat).toBe(0);
  });
});
