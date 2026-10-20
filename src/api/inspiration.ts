import { api } from './client';
import { SOFT } from './soft';

/** `GET /inspiration/hot` (contract r3 §F, r4 §B): trending posts per platform, public. */
export interface HotItem {
  title: string;
  url: string;
  heat: number;
  /** Heat as the platform words it (e.g. `1.2 万热度`); the UI formats `heat` when absent. */
  heat_text?: string | null;
  author?: string | null;
  source_name?: string | null;
  /** Original image URL — rendered with `referrerpolicy="no-referrer"`, never proxied. */
  image_url?: string | null;
  summary?: string | null;
  published_at?: string | null;
  is_mock?: boolean;
}

export interface HotSource {
  key: string;
  name: string;
  is_mock?: boolean;
  fetched_at?: string;
  items: HotItem[];
}

export interface HotFeed {
  sources: HotSource[];
}

/** Keep only sources that really carry items; any other shape → no sources (the module hides). */
export function normalizeHot(res: unknown): HotFeed {
  const raw = res && typeof res === 'object' ? (res as { sources?: unknown }).sources : null;
  if (!Array.isArray(raw)) return { sources: [] };
  const sources: HotSource[] = [];
  for (const s of raw as Partial<HotSource>[]) {
    if (!s || typeof s.key !== 'string' || !Array.isArray(s.items)) continue;
    const items = s.items.filter((i): i is HotItem =>
      Boolean(i && typeof i.title === 'string' && typeof i.url === 'string'),
    );
    if (!items.length) continue;
    sources.push({
      key: s.key,
      name: s.name || s.key,
      is_mock: s.is_mock ?? items.every((i) => i.is_mock),
      fetched_at: s.fetched_at,
      items: items.map((i) => ({
        ...i,
        heat: typeof i.heat === 'number' ? i.heat : 0,
        image_url:
          typeof i.image_url === 'string' && /^https?:\/\//.test(i.image_url) ? i.image_url : null,
        source_name: i.source_name || s.name || s.key,
      })),
    });
  }
  return { sources };
}

export const inspirationApi = {
  /** `source` = comma-separated keys; omit for every source. Resolves to `{sources: []}` when unavailable. */
  hot: async (source?: string): Promise<HotFeed> => {
    try {
      return normalizeHot(
        await api.get<HotFeed | unknown>('/inspiration/hot', {
          ...SOFT,
          skipAuthRetry: true,
          params: source ? { source } : undefined,
        }),
      );
    } catch {
      return { sources: [] };
    }
  },
};
