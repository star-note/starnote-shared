import { api } from './client';
import { SOFT } from './soft';

/**
 * `GET /ai/status`: whether AI features are offered at all (a provider is configured on the API). Signed in, the
 * API also answers `activated` (用户级「开启 AI 功能」, SPEC-r9-ai-billing) and the credits `balance`; an API without
 * them predates activation, so a missing `activated` counts as activated.
 */
export interface AiStatus {
  enabled: boolean;
  provider?: 'anthropic' | 'deepseek' | 'doubao' | 'qwen' | 'mock' | null;
  features?: string[];
  activated?: boolean;
  balance?: number;
  /** SPEC-r10: this month's grant / use (for the 80% and 用尽 notices), the plan in force and the AI region. */
  monthly_grant?: number;
  used_this_period?: number;
  plan?: 'free' | 'pro';
  region?: AiRegion;
  terms_version?: string;
}

/** The 《AI 功能说明》 version 「开启 AI 功能」 accepts (web settings page and the phone's in-place sheet). */
export const AI_TERMS_VERSION = '2026-11';

/** SPEC-r10 §5 / §11: `cn` = only mainland models, `global` = overseas models allowed. */
export type AiRegion = 'cn' | 'global';

/** `GET /me/ai/region`: where this account's calls go right now. */
export interface AiRegionStatus {
  region: AiRegion;
  /** A mainland provider is usable (key configured). */
  cn_available: boolean;
  /** A `cn` account whose calls fall back to overseas models because no mainland provider is usable. */
  fallback: boolean;
  model: string | null;
  provider: string | null;
}

/** One 加值点 lot (SPEC-r10 §11: valid 12 months, spent earliest-expiring first). */
export interface AiBonusLot {
  credits: number;
  expires_at: string | null;
  days_left: number | null;
  kind: 'topup' | 'admin' | string;
}

/** `POST /api/ai/estimate`: what a call will cost — typically `credits_min`, at most `credits_max`. */
export interface AiEstimate {
  feature: string;
  credits_min: number;
  credits_max: number;
  balance: number;
  activated?: boolean;
  model_tier?: 'main' | 'light';
  region?: AiRegion;
  route_reason?: string;
}

export interface AiUsageRecord {
  feature: string;
  credits: number;
  status?: 'settled' | 'refunded';
  created_at: string;
}

/** `GET /me/ai/usage`. */
export interface AiUsage {
  activated: boolean;
  terms_version: string;
  plan: string;
  balance: number;
  monthly_balance: number;
  bonus_balance: number;
  held: number;
  monthly_grant: number;
  used_this_period: number;
  period: string;
  period_end: string;
  /** 辰记 Pro until when (null = no expiry / free). */
  plan_expires_at?: string | null;
  bonus_lots?: AiBonusLot[];
  /** The soonest-expiring lot once inside a notice window (30 / 7 days). */
  bonus_expiring?: (AiBonusLot & { notice_days: number }) | null;
  by_feature: { feature: string; calls: number; credits: number }[];
  recent: AiUsageRecord[];
}

/** The AI proxy lives on `/api/ai*` (SparkWrite's endpoint convention), not under `/api/v1`. */
const PROXY = { baseURL: '/api' };

export const aiApi = {
  /** Soft: an API without the endpoint (or any error) reads as "AI off". */
  status: async (): Promise<AiStatus> => {
    const res = (await api.get<AiStatus>('/ai/status', SOFT).catch(() => null)) as unknown;
    if (res && typeof res === 'object' && typeof (res as AiStatus).enabled === 'boolean')
      return res as AiStatus;
    return { enabled: false, features: [] };
  },
  estimate: (feature: string, chars: number, maxTokens?: number) =>
    api.post<AiEstimate>('/ai/estimate', { feature, chars, maxTokens }, PROXY),
  usage: () => api.get<AiUsage>('/me/ai/usage'),
  /** 开启 AI 功能: accept the 《AI 功能说明》 of `termsVersion` (40001 when the API has a newer one). */
  activate: (termsVersion: string) =>
    api.post<AiUsage>('/me/ai/activate', { terms_version: termsVersion }),
  /** SPEC-r10: the account's AI region and whether mainland providers are usable; `null` on an older API. */
  region: async (): Promise<AiRegionStatus | null> => {
    const res = (await api.get<AiRegionStatus | unknown>('/me/ai/region', SOFT).catch(() => null)) as unknown;
    return res && typeof res === 'object' && typeof (res as AiRegionStatus).region === 'string'
      ? (res as AiRegionStatus)
      : null;
  },
};
