import { dashboardApi } from './dashboard';
import { groupsApi } from './groups';
import { meApi } from './me';
import { asItems, notesApi } from './notes';
import { publicationsApi } from './publications';
import type { Overview } from './types';

const settled = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined);

/**
 * The home page's data: `GET /me/overview` (contract §G), or — while that endpoint is not
 * deployed — the same picture assembled from the dashboard, recent notes, publications and groups.
 * Fields the fallback cannot know (today's words, the streak) come back `null` and the page omits them.
 */
export async function loadOverview(): Promise<Overview> {
  try {
    const o = (await meApi.overview()) as Overview | null;
    if (o && Array.isArray(o.recent_notes)) {
      return {
        ...o,
        today: o.today ?? null,
        streak_days: o.streak_days ?? null,
        pinned_notes: o.pinned_notes ?? [],
        groups: o.groups ?? [],
        publications: {
          total: o.publications?.total ?? 0,
          reads_7d: o.publications?.reads_7d ?? null,
          recent: o.publications?.recent ?? [],
        },
        unpublished_count: o.unpublished_count ?? o.drafts_count ?? null,
      };
    }
  } catch {
    /* fall through to the composed version */
  }
  const [dash, recent, stats, posts, groups] = await Promise.all([
    settled(dashboardApi.get()),
    notesApi.recent(12).then(asItems),
    settled(publicationsApi.stats()),
    settled(publicationsApi.mine({ page_size: 4 })),
    settled(groupsApi.list().then(asItems)),
  ]);
  const published = stats?.posts ?? dash?.published ?? 0;
  return {
    today: null,
    streak_days: null,
    recent_notes: recent,
    pinned_notes: recent.filter((n) => n.pinned),
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      avatar_url: g.avatar_url ?? null,
      unread: 0,
    })),
    publications: {
      total: published,
      reads_7d: stats?.reads_7d ?? null,
      recent: (posts?.items ?? []).map((p) => ({
        short_id: p.short_id || p.slug,
        title: p.title,
        reads: p.reads,
        published_at: p.published_at,
      })),
    },
    unpublished_count: dash ? Math.max(0, dash.notes - published) : null,
  };
}
