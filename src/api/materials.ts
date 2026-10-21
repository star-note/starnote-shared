import { api } from './client';
import { SOFT } from './soft';
import type { Asset, Paged } from './types';

/** `mine` = my own; `group` = every group I'm in; `group:{id}` = one group. */
export type MaterialScope = 'mine' | 'group' | `group:${string}`;

export interface Material {
  id: string;
  owner_type: 'user' | 'group';
  owner_id: string;
  owner_name?: string | null;
  asset_hash: string;
  url: string;
  title: string;
  tags: string[];
  kind: 'gif' | 'image' | 'svg';
  mime: string;
  width?: number | null;
  height?: number | null;
  size: number;
  created_at: string;
  can_edit: boolean;
  /** 授权给辰记官方使用 (CONTRACTS-r9 §4); see `licenseOf`. */
  license?: MaterialLicense;
}

export interface GiphyItem {
  id: string;
  title: string;
  preview_url: string;
  url: string;
  width?: number;
  height?: number;
}

export interface GiphyPage {
  items: GiphyItem[];
  next_offset: number | null;
  total: number;
}

export const materialsApi = {
  list: (params: {
    scope?: MaterialScope;
    q?: string;
    tag?: string;
    kind?: string;
    page?: number;
    page_size?: number;
  }) => api.get<Paged<Material>>('/materials', { params }),
  create: (body: { asset_hash: string; title?: string; tags?: string[]; scope: MaterialScope }) =>
    api.post<Material>('/materials', body),
  update: (id: string, body: { title?: string; tags?: string[] }) =>
    api.patch<Material>(`/materials/${id}`, body),
  remove: (id: string) => api.delete<null>(`/materials/${id}`),
  /** Soft: an older API without the endpoint reads as "GIPHY off". */
  status: async (): Promise<{ giphy: boolean }> => {
    const res = (await api.get<unknown>('/materials/status', SOFT).catch(() => null)) as {
      giphy?: unknown;
    } | null;
    return { giphy: res?.giphy === true };
  },
  giphy: (q: string, offset = 0) =>
    api.get<GiphyPage>('/materials/giphy', { params: { q: q || undefined, offset } }),
  /** Server downloads the GIF into our asset store, so published articles never hotlink GIPHY. */
  giphyImport: (id: string) =>
    api.post<{ asset: Asset; url: string }>('/materials/giphy/import', { id }),
  // 授权给辰记官方使用 (CONTRACTS-r9 §4) — implemented in `materialLicenseApi` below
  licenseTerms: () => materialLicenseApi.terms(),
  applyLicense: (id: string, termsVersion: string) => materialLicenseApi.apply(id, termsVersion),
  revokeLicense: (id: string) => materialLicenseApi.revoke(id),
  search: (q: string, opts?: { kind?: Material['kind']; limit?: number }) =>
    materialLicenseApi.search(q, opts),
  adminLicenses: (status?: Exclude<MaterialLicenseStatus, 'none'>, page?: number) =>
    materialLicenseApi.adminList(status, page),
  reviewLicense: (id: string, action: 'approve' | 'reject', note?: string) =>
    materialLicenseApi.review(id, action, note),
  /** 点赞 counts for official (`officialLikeKey`), 开源 and group materials; targets I can't see are left out. */
  likes: async (targets: string[]): Promise<Record<string, MaterialLike>> => {
    if (!targets.length) return {};
    const res = await api
      .get<{ items?: Record<string, MaterialLike> }>('/materials/likes', {
        ...SOFT,
        params: { targets: targets.join(',') },
      })
      .catch(() => null);
    return res?.items ?? {};
  },
  like: (target: string, liked: boolean) =>
    liked
      ? api.put<MaterialLike>(`/materials/likes/${encodeURIComponent(target)}`)
      : api.delete<MaterialLike>(`/materials/likes/${encodeURIComponent(target)}`),
};

export interface MaterialLike {
  count: number;
  liked: boolean;
}

/** The like target of a shipped official material. */
export const officialLikeKey = (id: string) => `official:${id}`;

/* ---------- official materials: static files shipped with the web app ---------- */

export interface OfficialMaterial {
  id: string;
  title: string;
  tags: string[];
  category: string;
  file: string;
  poster: string;
  size: number;
  w: number;
  h: number;
  frames?: number;
  duration?: number;
  bg?: 'white' | 'transparent';
}

export interface OfficialManifest {
  version: number;
  categories: { key: string; label: string }[];
  items: OfficialMaterial[];
}

export const OFFICIAL_BASE = '/materials/official';

let manifest: Promise<OfficialManifest> | null = null;

export function loadOfficialManifest(): Promise<OfficialManifest> {
  manifest ??= fetch(`${OFFICIAL_BASE}/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`素材清单加载失败（${r.status}）`);
      return r.json() as Promise<OfficialManifest>;
    })
    .catch((e) => {
      manifest = null;
      throw e;
    });
  return manifest;
}

/* ---------- 授权给辰记官方使用（CONTRACTS-r9 §4） ---------- */

export type MaterialLicenseStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';

/** `Material.license` (older APIs omit it: treat as `none`). */
export interface MaterialLicense {
  status: MaterialLicenseStatus;
  version: string | null;
  licensed_at: string | null;
  revoked_at: string | null;
  review_note: string | null;
}

export interface MaterialLicenseTerms {
  version: string;
  title: string;
  body: string;
  updated_at: string;
}

export type MaterialSource = 'mine' | 'group' | 'licensed';

export interface MaterialSearchItem {
  id: string;
  title: string;
  tags: string[];
  kind: Material['kind'];
  url: string;
  width?: number | null;
  height?: number | null;
  source: MaterialSource;
  /** `@handle` of the author for licensed materials, else null. */
  attribution: string | null;
}

/** A row of the admin review list: the material plus its owner. */
export type MaterialLicenseReviewItem = Material & {
  license: MaterialLicense;
  owner: { id: string; name: string; handle: string };
  reviewed_at?: string | null;
};

export const NO_LICENSE: MaterialLicense = {
  status: 'none',
  version: null,
  licensed_at: null,
  revoked_at: null,
  review_note: null,
};

/** The license block of a material, defaulting to `none` for older APIs. */
export function licenseOf(m: { license?: MaterialLicense | null }): MaterialLicense {
  return m.license ?? NO_LICENSE;
}

/** Normalise a search response; a missing endpoint (bare 404) or garbage reads as no results. */
export function softSearchItems(res: unknown): MaterialSearchItem[] {
  const items = res && typeof res === 'object' ? (res as { items?: unknown }).items : null;
  return Array.isArray(items) ? (items as MaterialSearchItem[]) : [];
}

export const materialLicenseApi = {
  terms: () => api.get<MaterialLicenseTerms>('/materials/license-terms'),
  apply: (id: string, termsVersion: string) =>
    api.post<Material>(`/materials/${id}/license`, { terms_version: termsVersion }),
  revoke: (id: string) => api.delete<Material>(`/materials/${id}/license`),
  /** 我的 + 我所在群组的 + 已进入官方素材池的授权素材. Soft: an older API → []. */
  search: async (
    q: string,
    opts: { kind?: Material['kind']; limit?: number } = {},
  ): Promise<MaterialSearchItem[]> => {
    const res = await api
      .get<unknown>('/materials/search', {
        ...SOFT,
        params: { q: q || undefined, kind: opts.kind, limit: opts.limit },
      })
      .catch(() => null);
    return softSearchItems(res);
  },
  adminList: (status: Exclude<MaterialLicenseStatus, 'none'> = 'pending', page = 1) =>
    api.get<Paged<MaterialLicenseReviewItem>>('/admin/materials/licenses', {
      params: { status, page },
    }),
  review: (id: string, action: 'approve' | 'reject', note?: string) =>
    api.post<MaterialLicenseReviewItem>(`/admin/materials/${id}/license/review`, {
      action,
      note: note || undefined,
    }),
};
