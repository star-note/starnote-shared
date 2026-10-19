import { currentAccessToken } from '../api/client';
import { AI_ENDPOINT } from '../editor/aiTransport';

/**
 * AI calls of 一稿多版 and 发布合规 (CONTRACTS-r9 §0 / §6). Every call names its billing `feature`; the big ones ask
 * `POST /api/ai/estimate` first so the UI can say 「约消耗 N 点」. Points running out (RATE_LIMITED) is its own
 * error so the UI can say so plainly.
 */
export type VersionAiFeature =
  | 'rewrite.xhs'
  | 'tags.suggest'
  | 'rewrite.translate'
  | 'rewrite.condense'
  | 'image.keywords'
  | 'check.platform'
  | 'style.suggest';

export interface FeatureEstimate {
  credits_min: number;
  credits_max: number;
  balance: number | null;
}

export class AiPointsError extends Error {
  readonly quota = true;
}

const QUOTA_CODE = 42901;

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = currentAccessToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

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
  if (res.status === 429 || code === QUOTA_CODE) return new AiPointsError(message || 'AI 点数不够了，充值或等下月重置后再试');
  return new Error(message || `AI 暂时不可用（${res.status}）`);
}

/** `POST /api/ai` with `feature`, non-streaming (the callers need the whole JSON answer). */
export async function callFeature(
  feature: VersionAiFeature,
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
    if (body.code === QUOTA_CODE) throw new AiPointsError(body.message || 'AI 点数不够了');
    throw new Error(body.message || 'AI 暂时不可用');
  }
  return body?.data?.text ?? body?.text ?? '';
}

/** `{credits_min, credits_max, balance}`, or `null` when the API can't estimate (older API, network). */
export async function estimateFeature(feature: VersionAiFeature, chars: number): Promise<FeatureEstimate | null> {
  try {
    const res = await fetch(`${AI_ENDPOINT}/estimate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ feature, chars: Math.max(0, Math.round(chars)) }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: FeatureEstimate } & Partial<FeatureEstimate>;
    const data = (body?.data ?? body) as Partial<FeatureEstimate>;
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

/** 「约消耗 3–5 点」 (the balance is shown separately where there is room). */
export function costText(e: FeatureEstimate | null | undefined): string {
  if (!e) return '';
  const range = e.credits_min === e.credits_max ? `${e.credits_max}` : `${e.credits_min}–${e.credits_max}`;
  return `约消耗 ${range} 点`;
}

/** The balance can't cover even the cheapest run. */
export function pointsShort(e: FeatureEstimate | null | undefined): boolean {
  return Boolean(e && e.balance !== null && e.balance < e.credits_min);
}

/** The first JSON object in a model answer (code fences and chatter around it are ignored); `null` when none parses. */
export function parseJsonAnswer<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  // walk to the matching brace, strings aware
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
