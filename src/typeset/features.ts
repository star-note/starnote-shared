import { aiApi } from '../api/ai';
import { currentAccessToken } from '../api/client';
import { AI_ENDPOINT } from '../editor/aiTransport';

/**
 * Calls for the AI typesetting tools. Every call names its billing `feature`; big calls ask
 * `POST /api/ai/estimate` first so the confirm step can say 「约消耗 N 点」.
 */
export type AiFeature = 'layout.compose' | 'paragraph.tidy' | 'image.card' | 'check.typeset';

export interface AiEstimate {
  credits_min: number;
  credits_max: number;
  balance: number | null;
}

/** Points ran out (RATE_LIMITED): the UI says so plainly instead of a generic error. */
export class AiQuotaError extends Error {
  readonly quota = true;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = currentAccessToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const QUOTA_CODE = 42901;

async function failure(res: Response): Promise<Error> {
  let message = '';
  let code: number | undefined;
  try {
    const body = (await res.json()) as { code?: number; message?: string };
    message = body?.message ?? '';
    code = body?.code;
  } catch {
    /* not json */
  }
  if (res.status === 429 || code === QUOTA_CODE)
    return new AiQuotaError(message || 'AI 点不足，升级 Pro 或等下月再送');
  return new Error(message || `AI 暂时不可用（${res.status}）`);
}

/** `POST /api/ai` with `feature`, non-streaming: the tools need the whole JSON answer anyway. */
export async function callAiFeature(
  feature: AiFeature,
  req: { system: string; user: string; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: headers(),
    signal: req.signal,
    body: JSON.stringify({
      feature,
      messages: [{ role: 'user', content: req.user }],
      systemPrompt: req.system,
      stream: false,
      maxTokens: req.maxTokens ?? 2000,
    }),
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { code?: number; message?: string; data?: { text?: string }; text?: string };
  if (body && typeof body.code === 'number' && body.code !== 0) {
    if (body.code === QUOTA_CODE) throw new AiQuotaError(body.message || 'AI 点不足');
    throw new Error(body.message || 'AI 暂时不可用');
  }
  return body?.data?.text ?? body?.text ?? '';
}

/** `{credits_min, credits_max, balance}` via `POST /api/ai/estimate`, or `null` when the API can't estimate. */
export async function estimateAiFeature(feature: AiFeature, chars: number, maxTokens?: number): Promise<AiEstimate | null> {
  try {
    const data = (await aiApi.estimate(feature, Math.max(0, Math.round(chars)), maxTokens)) as Partial<AiEstimate> | null;
    if (typeof data?.credits_min !== 'number' || typeof data?.credits_max !== 'number') return null;
    return {
      credits_min: data.credits_min,
      credits_max: data.credits_max,
      balance: typeof data.balance === 'number' ? data.balance : null,
    };
  } catch {
    return null;
  }
}

/** 「约消耗 3 点 · 本月剩余 120 点」 (same wording as the editor's cost bubble). */
export function estimateText(e: AiEstimate | null): string {
  if (!e) return '';
  return `约消耗 ${e.credits_min} 点${e.balance !== null ? ` · 本月剩余 ${e.balance} 点` : ''}`;
}

/** The balance can't cover the upper bound held while the call runs. */
export function estimateShort(e: AiEstimate | null): boolean {
  return Boolean(e && e.balance !== null && e.credits_max > e.balance);
}
