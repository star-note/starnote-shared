import type { AxiosRequestConfig } from 'axios';

import type { CommentsPage, Paged } from './types';

/**
 * Request config for endpoints that may not be deployed yet. Every HTTP status
 * resolves, so a bare framework 404 (`{detail: "Not Found"}`, no envelope) comes
 * back as data instead of raising the client's "请求失败" toast; enveloped errors
 * (`code !== 0`) are still thrown by the response interceptor as usual.
 */
export const SOFT: AxiosRequestConfig = { validateStatus: () => true };

/** Normalise `Paged<T> | T[] | <garbage>` into a plain array. */
export function softItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as Paged<T>).items))
    return (res as Paged<T>).items;
  return [];
}

/** Normalise a comments list response; missing endpoint → empty page with no policy. */
export function softComments(res: unknown): CommentsPage {
  if (res && typeof res === 'object' && Array.isArray((res as CommentsPage).items)) {
    const r = res as CommentsPage;
    return {
      items: r.items,
      total: typeof r.total === 'number' ? r.total : r.items.length,
      policy: r.policy,
      can_comment: r.can_comment,
      reason: r.reason,
    };
  }
  return { items: [], total: 0 };
}

/** `{items,total}` or a bare array for small lists like viewers. */
export function softListWithTotal<T>(res: unknown): { items: T[]; total: number } {
  const items = softItems<T>(res);
  const total =
    res && typeof res === 'object' && typeof (res as { total?: unknown }).total === 'number'
      ? (res as { total: number }).total
      : items.length;
  return { items, total };
}
