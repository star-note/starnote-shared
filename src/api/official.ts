import { api } from './client';
import { groupsApi } from './groups';
import { asItems } from './notes';
import { SOFT, softItems } from './soft';
import type { Group } from './types';

/** One row of `GET /official/guides` (contract r4 §C.3): a note in 「辰记官方」 the UI can deep-link. */
export interface OfficialGuide {
  key: 'platforms' | 'earn' | string;
  note_id: string;
  title: string;
}

/** `guides_by_platform` of `GET /official/guides`: each platform's 「发布指南」 article, by platform key. */
export type PlatformGuides = Record<string, { note_id: string; title: string }>;

export interface OfficialGuides {
  guides: OfficialGuide[];
  group: Group | null;
  /** Empty when the endpoint predates the 「发布指南」 column. */
  byPlatform?: PlatformGuides;
}

function validByPlatform(res: unknown): PlatformGuides {
  const raw =
    res && typeof res === 'object'
      ? (res as { guides_by_platform?: unknown }).guides_by_platform
      : null;
  const out: PlatformGuides = {};
  if (raw && typeof raw === 'object') {
    for (const [key, g] of Object.entries(raw as Record<string, unknown>)) {
      const note = g as { note_id?: unknown; title?: unknown };
      if (note && typeof note.note_id === 'string')
        out[key] = { note_id: note.note_id, title: String(note.title ?? '') };
    }
  }
  return out;
}

/** Title words that identify each guide when the endpoint is missing and we read the group's notes. */
const GUIDE_WORDS: Record<string, string[]> = {
  platforms: ['平台', '绑定'],
  earn: ['收入', '打赏'],
};

function validGuides(res: unknown): OfficialGuide[] {
  return softItems<Partial<OfficialGuide>>(res).filter((g): g is OfficialGuide =>
    Boolean(g && typeof g.key === 'string' && typeof g.note_id === 'string'),
  );
}

/**
 * Where the guides live while `GET /official/guides` is not deployed: the `is_official` group from
 * `/groups`, and its notes matched by title. Resolves `{group}` alone when only the group is known.
 */
async function composeGuides(): Promise<{ guides: OfficialGuide[]; group: Group | null }> {
  const groups = softItems<Group>(await groupsApi.list().catch(() => [] as Group[]));
  const group =
    groups.find((g) => (g as Group & { is_official?: boolean }).is_official) ??
    groups.find((g) => g.slug === 'starnote-official') ??
    null;
  if (!group) return { guides: [], group: null };
  const notes = await groupsApi
    .notes(group.id, { limit: 50 })
    .then(asItems)
    .catch(() => []);
  const guides: OfficialGuide[] = [];
  for (const [key, words] of Object.entries(GUIDE_WORDS)) {
    const note =
      notes.find((n) => words.every((w) => (n.title ?? '').includes(w))) ??
      notes.find((n) => words.some((w) => (n.title ?? '').includes(w)));
    if (note) guides.push({ key, note_id: note.id, title: note.title });
  }
  return { guides, group };
}

export const officialApi = {
  /** Never throws; `group` lets callers fall back to the group page when a guide is unknown. */
  guides: async (): Promise<OfficialGuides> => {
    try {
      const res = await api.get<OfficialGuide[] | unknown>('/official/guides', {
        ...SOFT,
        skipAuthRetry: true,
      });
      const guides = validGuides(res);
      if (guides.length) return { guides, group: null, byPlatform: validByPlatform(res) };
    } catch {
      /* compose below */
    }
    return composeGuides().catch(() => ({ guides: [], group: null }));
  },
};

/** The `/notes/{id}` of a guide, else the official group, else the groups index. */
export function guideHref(data: OfficialGuides | undefined, key: string): string {
  const g = data?.guides.find((x) => x.key === key);
  if (g) return `/notes/${g.note_id}`;
  if (data?.group) return `/groups/${data.group.id}`;
  return '/groups';
}

/** A platform's own 「发布指南」 article, else the 「如何注册与绑定」 guide (the overview). */
export function platformGuideHref(data: OfficialGuides | undefined, platform: string): string {
  const g = data?.byPlatform?.[platform];
  return g ? `/notes/${g.note_id}` : guideHref(data, 'platforms');
}
