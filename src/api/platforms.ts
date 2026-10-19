import { api } from './client';
import { SOFT, softItems } from './soft';

/** One row of `GET /me/platforms` (contract r3 §F). */
export interface MyPlatform {
  platform: string;
  name: string;
  bound: boolean;
  account_name: string | null;
  account_url?: string | null;
  posts: number;
  reads_7d: number;
  last_published_at: string | null;
  apply_url: string | null;
  bind_url: string | null;
  /** `true` until the platform is really integrated; the UI says so. */
  is_mock?: boolean;
}

/**
 * The platforms the home page lists while the endpoint is missing or answers garbage: 辰记 bound
 * (every account has a blog), the rest waiting to be applied for / bound. Same order as the server.
 */
export const FALLBACK_PLATFORMS: readonly {
  platform: string;
  name: string;
  apply_url: string | null;
}[] = [
  { platform: 'chenji', name: '辰记', apply_url: null },
  { platform: 'wechat', name: '微信公众号', apply_url: 'https://mp.weixin.qq.com/' },
  { platform: 'zhihu', name: '知乎', apply_url: 'https://www.zhihu.com/creator' },
  { platform: 'juejin', name: '掘金', apply_url: 'https://juejin.cn/creator/home' },
  { platform: 'xiaohongshu', name: '小红书', apply_url: 'https://creator.xiaohongshu.com/' },
  { platform: 'yuque', name: '语雀', apply_url: 'https://www.yuque.com/' },
  { platform: 'medium', name: 'Medium', apply_url: 'https://medium.com/' },
  { platform: 'github-pages', name: 'GitHub Pages', apply_url: 'https://pages.github.com/' },
];

function fallbackRows(handle?: string): MyPlatform[] {
  return FALLBACK_PLATFORMS.map((p) => ({
    ...p,
    bound: p.platform === 'chenji',
    account_name: p.platform === 'chenji' && handle ? `@${handle}` : null,
    account_url: p.platform === 'chenji' && handle ? `/@${handle}` : null,
    posts: 0,
    reads_7d: 0,
    last_published_at: null,
    bind_url: p.platform === 'chenji' ? null : `/settings?tab=platforms&bind=${p.platform}`,
    is_mock: true,
  }));
}

/**
 * Normalise whatever the endpoint returned into rows the page can draw. Unknown shape or an empty
 * list → the fallback; partial rows are filled with zeros so a missing counter never crashes a module.
 */
export function normalizePlatforms(res: unknown, handle?: string): MyPlatform[] {
  const items = softItems<Partial<MyPlatform>>(res).filter(
    (r) => r && typeof r === 'object' && typeof r.platform === 'string',
  );
  if (!items.length) return fallbackRows(handle);
  const known = new Map(FALLBACK_PLATFORMS.map((p) => [p.platform, p]));
  return items.map((r) => {
    const base = known.get(r.platform!);
    return {
      platform: r.platform!,
      name: r.name || base?.name || r.platform!,
      bound: Boolean(r.bound),
      account_name: r.account_name ?? null,
      account_url: r.account_url ?? null,
      posts: typeof r.posts === 'number' ? r.posts : 0,
      reads_7d: typeof r.reads_7d === 'number' ? r.reads_7d : 0,
      last_published_at: r.last_published_at ?? null,
      apply_url: r.apply_url ?? base?.apply_url ?? null,
      bind_url: r.bind_url ?? null,
      is_mock: r.is_mock ?? false,
    };
  });
}

export const platformsApi = {
  /** Never throws for a missing endpoint: the home page draws the fallback list instead. */
  mine: async (handle?: string): Promise<MyPlatform[]> => {
    try {
      return normalizePlatforms(
        await api.get<MyPlatform[] | unknown>('/me/platforms', SOFT),
        handle,
      );
    } catch {
      return normalizePlatforms(null, handle);
    }
  },
};
