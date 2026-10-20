import { currentAccessToken } from '../api/client';

export const AI_ENDPOINT = '/api/ai';

interface AIRequestLike {
  messages: { role: string; content: string }[];
  systemPrompt: string;
  signal: AbortSignal;
}

/**
 * Transport for SparkWrite's `ai.generate`: POSTs the SparkWrite contract to
 * `/api/ai` with the *current* bearer token (the SDK's `headers` option is a
 * static record, so a fresh token per call needs this override) and streams
 * `data: {"text"}` events into `onChunk`.
 */
export async function generateViaApi(
  request: AIRequestLike,
  onChunk?: (text: string) => void,
  maxTokens = 2048,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = currentAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers,
    signal: request.signal,
    body: JSON.stringify({
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      systemPrompt: request.systemPrompt,
      stream: true,
      maxTokens,
    }),
  });
  if (!res.ok) {
    let msg = `AI 服务错误（${res.status}）`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    const body = await res.json();
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0)
      throw new Error(body.message);
    const text = body?.data?.text ?? body?.text ?? '';
    onChunk?.(text);
    return text;
  }
  return readSse(res.body!, onChunk);
}

export async function readSse(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (t: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const text = parseSseLine(line);
      if (text === null) continue;
      full += text;
      onChunk?.(text);
    }
  }
  return full;
}

/** Returns the text delta of one `data:` line, `''` for ignorable lines, `null` for [DONE]/non-data. */
export function parseSseLine(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const obj = JSON.parse(payload);
    if (typeof obj?.text === 'string') return obj.text;
    // Anthropic / OpenAI passthrough shapes
    if (obj?.delta?.text) return obj.delta.text;
    if (obj?.choices?.[0]?.delta?.content) return obj.choices[0].delta.content;
    return '';
  } catch {
    return payload;
  }
}

/**
 * The kit's AI options. AI off (no provider on the API): no AI kit at all — no toolbar button, slash entry,
 * bubble menu or autocomplete, and so no call to `/api/ai`.
 */
export function editorAiOptions(
  enabled: boolean,
  handlers: { generate: unknown; onComposeResult: unknown },
): Record<string, unknown> {
  if (!enabled) return { ai: false, aiAutocomplete: false };
  return { ai: { endpoint: AI_ENDPOINT, ...handlers } };
}
