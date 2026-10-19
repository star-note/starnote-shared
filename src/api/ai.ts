import { api } from './client';
import { SOFT } from './soft';

/**
 * `GET /ai/status`: whether AI features are offered at all (a provider is configured on the API). Signed in, the
 * API also answers `activated` (用户级「开通 AI」, SPEC-r9-ai-billing) and the credits `balance`; an API without
 * them predates activation, so a missing `activated` counts as activated.
 */
export interface AiStatus {
  enabled: boolean;
  provider?: 'anthropic' | 'mock' | null;
  features?: string[];
  activated?: boolean;
  balance?: number;
}

/** `POST /api/ai/estimate`: what a call will cost — typically `credits_min`, at most `credits_max`. */
export interface AiEstimate {
  feature: string;
  credits_min: number;
  credits_max: number;
  balance: number;
  activated?: boolean;
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
  /** 开通 AI: accept the 《AI 功能说明》 of `termsVersion` (40001 when the API has a newer one). */
  activate: (termsVersion: string) =>
    api.post<AiUsage>('/me/ai/activate', { terms_version: termsVersion }),
};
