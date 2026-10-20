import type { AxiosRequestConfig } from 'axios';

import { api } from './client';
import { SOFT, softItems } from './soft';
import type {
  HandleCheck,
  MeActivity,
  MyCategoryCount,
  Order,
  OrderKind,
  Overview,
  PlanSummary,
  PromptState,
  PublishQueuePage,
  PublishQueueStatus,
  PublishQuota,
  RevenueSummary,
  User,
  UserPreferences,
  Visibility,
} from './types';

/** `GET /me/activity` (r4 §A); `available=false` while the endpoint is not deployed. */
export interface MeActivityResult {
  items: MeActivity[];
  available: boolean;
}

export function normalizeActivity(res: unknown): MeActivityResult {
  const available =
    Array.isArray(res) ||
    Boolean(res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items));
  if (!available) return { items: [], available: false };
  const items = softItems<MeActivity>(res).filter(
    (a) =>
      a &&
      typeof a === 'object' &&
      typeof a.id === 'string' &&
      a.group &&
      typeof a.group.id === 'string',
  );
  return { items, available: true };
}

/** Endpoints under `/me` added in the second contract round (§D, §E, §G). */
export const meApi = {
  /** Shape-checked by `useOverview`; a bare 404 (endpoint not deployed) comes back as data, not a toast. */
  overview: (config?: AxiosRequestConfig) =>
    api.get<Overview | unknown>('/me/overview', { ...SOFT, ...config }),
  /** `null` while the endpoint is missing: the server validates on save instead. */
  handleCheck: async (handle: string) => {
    const res = await api.get<HandleCheck | unknown>('/me/handle/check', {
      ...SOFT,
      params: { handle },
    });
    return res &&
      typeof res === 'object' &&
      typeof (res as { available?: unknown }).available === 'boolean'
      ? (res as HandleCheck)
      : null;
  },
  update: (body: {
    name?: string;
    avatar_asset_hash?: string | null;
    handle?: string;
    learn_from_feedback?: boolean;
    ai_region?: 'cn' | 'global';
  }) => api.patch<User>('/me', body),
  /** r9: `PATCH /me/preferences` — only the keys sent change; the whole user comes back. */
  updatePreferences: (body: UserPreferences) => api.patch<User>('/me/preferences', body),
  /**
   * Bulk edit of my posts. Resolves `null` when the endpoint is not deployed yet (bare 404), so
   * callers can fall back to one `PATCH /publications/{id}` per row; enveloped errors still throw.
   */
  publicationsBulk: async (body: {
    ids: string[];
    category_id?: string;
    blog_category_id?: string;
    visibility?: Visibility;
    show_in_blog?: boolean;
  }) => {
    const res = await api.post<{ updated: number } | unknown>('/me/publications/bulk', body, SOFT);
    return res &&
      typeof res === 'object' &&
      typeof (res as { updated?: unknown }).updated === 'number'
      ? (res as { updated: number })
      : null;
  },
  /** Same contract as `publicationsBulk`: `null` while the endpoint is missing. */
  mergeCategories: async (from_id: string, to_id: string) => {
    const res = await api.post<{ moved: number } | unknown>(
      '/me/blog/categories/merge',
      { from_id, to_id },
      SOFT,
    );
    return res && typeof res === 'object' && typeof (res as { moved?: unknown }).moved === 'number'
      ? (res as { moved: number })
      : null;
  },
  /** SPEC-r8-group-publisher: 「待发布」 across every group where I may publish (each item carries `group`). */
  publishQueue: (params: { status?: PublishQueueStatus; page?: number; page_size?: number } = {}) =>
    api.get<PublishQueuePage>('/me/publish-queue', { ...SOFT, params: { status: 'open', ...params } }),
  /** Cross-group activity for the home rail (r4 §A); empty + `available=false` while missing. */
  activity: async (limit = 30) =>
    normalizeActivity(
      await api.get<MeActivity[] | unknown>('/me/activity', { ...SOFT, params: { limit } }),
    ),
  /** Categories I have posts in, with counts; `[]` while the endpoint is missing. */
  publicationCategories: async () =>
    softItems<MyCategoryCount>(
      await api.get<MyCategoryCount[] | unknown>('/me/publications/categories', SOFT),
    ),

  // ---- SPEC-r10 商业化 阶段 A ----

  /** §7.4: guides the user closed; `null` on an older API (every guide then shows). */
  prompts: async (): Promise<PromptState | null> => {
    const res = (await api.get<PromptState | unknown>('/me/prompts', SOFT).catch(() => null)) as unknown;
    return res && typeof res === 'object' && (res as PromptState).dismissed ? (res as PromptState) : null;
  },
  dismissPrompt: (key: string) => api.post<PromptState>(`/me/prompts/${encodeURIComponent(key)}/dismiss`),
  onboardingDone: () => api.post<PromptState>('/me/onboarding/done'),
  /** §6 / §11: outbound publishes this month; `null` on an older API (no limit shown). */
  publishQuota: async (): Promise<PublishQuota | null> => {
    const res = (await api.get<PublishQuota | unknown>('/me/publish-quota', SOFT).catch(() => null)) as unknown;
    return res && typeof res === 'object' && typeof (res as PublishQuota).limit === 'number'
      ? (res as PublishQuota)
      : null;
  },
  /** Hand-offs the user confirmed (分享跳转 / 发布台): one per platform; 42902 when the month is used up. */
  countPublish: (platforms: string[]) => api.post<PublishQuota>('/me/publish-count', { platforms }),
  plan: () => api.get<PlanSummary>('/me/plan'),
  planNotify: (email?: string) => api.post<{ email: string }>('/me/plan/notify', email ? { email } : {}),
  revenue: () => api.get<RevenueSummary>('/me/revenue'),
  orders: async () => softItems<Order>(await api.get<{ items: Order[] } | unknown>('/me/orders', SOFT)),
  createOrder: (kind: OrderKind) => api.post<Order>('/me/orders', { kind }),
  /** `PAYMENT_PROVIDER=mock` only: the simulated outcome. */
  mockConfirmOrder: (id: string, result: 'success' | 'fail') =>
    api.post<Order>(`/me/orders/${id}/mock-confirm`, { result }),
};
