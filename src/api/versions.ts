import { api } from './client';
import { SOFT } from './soft';
import type { TiptapDoc } from './types';

/**
 * 一稿多版 (CONTRACTS-r9 §3): versions generated from a note — the note itself never changes.
 *   - `xhs`: 小红书图集 (6–9 cards 3:4 + ≤1000 字正文 + 话题)
 *   - `en`: 英文海外版 (node-by-node translation, layout and images kept)
 *   - `condensed`: 精简版 (摘编 = free extractive, 改写 = AI)
 */
export type VersionKind = 'xhs' | 'en' | 'condensed';

export type XhsCardKind = 'cover' | 'points' | 'section' | 'quote' | 'ending';

export interface XhsCard {
  id: string;
  kind: XhsCardKind;
  /** Canvas template key (see `components/versions/xhs/templates`). */
  template: string;
  title: string;
  body?: string;
  items?: string[];
  /** A picture on the card (素材 / note image URL). */
  image?: string;
  /** The exported 1080×1440 PNG, once rendered and uploaded. */
  render?: { asset_hash: string; url: string };
}

export interface XhsContent {
  cards: XhsCard[];
  /** 正文笔记, ≤ 1000 字. */
  caption: string;
  /** 话题, without `#`. */
  topics: string[];
}

export interface EnContent {
  doc: TiptapDoc;
  lang: 'en';
  glossary?: Record<string, string>;
}

export interface CondensedContent {
  doc: TiptapDoc;
  chars: number;
}

export interface VersionOptionsMap {
  xhs: { template?: string };
  en: { mode: 'literal' | 'localized' };
  condensed: { target: number; mode: 'extract' | 'rewrite' };
}

export interface VersionContentMap {
  xhs: XhsContent;
  en: EnContent;
  condensed: CondensedContent;
}

export interface NoteVersionSummary<K extends VersionKind = VersionKind> {
  id: string;
  kind: K;
  title: string;
  options: Partial<VersionOptionsMap[K]>;
  /** The note's `version` when this was generated. */
  source_version: number;
  /** The note changed since (`source_version < note.version`). */
  stale: boolean;
  created_at: string;
  updated_at: string;
  created_by?: { id: string; name: string } | null;
}

export interface NoteVersion<K extends VersionKind = VersionKind> extends NoteVersionSummary<K> {
  content: VersionContentMap[K];
}

export interface VersionInput<K extends VersionKind = VersionKind> {
  kind: K;
  title: string;
  content: VersionContentMap[K];
  options?: Partial<VersionOptionsMap[K]>;
  source_version?: number;
}

export const VERSION_LABELS: Record<VersionKind, string> = {
  xhs: '小红书图集',
  en: '英文版',
  condensed: '精简版',
};

export const versionsApi = {
  /** Soft: an older API without the endpoint reads as "no versions". */
  list: async (noteId: string): Promise<NoteVersionSummary[]> => {
    const res = (await api.get<unknown>(`/notes/${noteId}/versions`, SOFT).catch(() => null)) as unknown;
    if (Array.isArray(res)) return res as NoteVersionSummary[];
    const items = (res as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as NoteVersionSummary[]) : [];
  },
  get: <K extends VersionKind = VersionKind>(noteId: string, versionId: string) =>
    api.get<NoteVersion<K>>(`/notes/${noteId}/versions/${versionId}`),
  create: <K extends VersionKind>(noteId: string, body: VersionInput<K>) =>
    api.post<NoteVersion<K>>(`/notes/${noteId}/versions`, body),
  update: <K extends VersionKind>(
    noteId: string,
    versionId: string,
    body: Partial<Omit<VersionInput<K>, 'kind'>>,
  ) => api.put<NoteVersion<K>>(`/notes/${noteId}/versions/${versionId}`, body),
  remove: (noteId: string, versionId: string) => api.delete<null>(`/notes/${noteId}/versions/${versionId}`),
};
