/**
 * SPEC-r10 §6 / §11: 「本月已发布 x/30（辰记博客不计）」 beside the publish title. Over the limit for the platforms
 * ticked it turns amber and offers 「升级 Pro」; the detail says why and how to publish anyway (辰记 only).
 */
import type { PublishQuota } from '../api/types';

export interface QuotaLine {
  /** 「本月已发布 3/30（辰记博客不计）」 · Pro: 「本月已发布 3/不限」. */
  text: string;
  over: boolean;
  /** Why it is over (null when it is not). */
  detail: string | null;
}

/** Outbound platforms of a selection: everything but 辰记 (the blog is never counted). */
export const externalCount = (keys: readonly string[]) => keys.filter((k) => k !== 'chenji').length;

export function quotaLine(quota: PublishQuota | null | undefined, count: number): QuotaLine | null {
  if (!quota) return null;
  const over = !quota.unlimited && count > 0 && quota.used + count > quota.limit;
  const text = `本月已发布 ${quota.used}/${quota.unlimited ? '不限' : quota.limit}${quota.unlimited ? '' : '（辰记博客不计）'}`;
  const detail = !over
    ? null
    : quota.used >= quota.limit
      ? `本月对外发布次数已用完（${quota.limit} 次），去掉勾选的外部平台可以只发到辰记博客`
      : `本次要发 ${count} 个平台，本月只剩 ${quota.remaining} 次；去掉勾选的外部平台可以只发到辰记博客`;
  return { text, over, detail };
}
