import { OFFICIAL_STYLE_LIST } from './official';
import { recommendStyles } from './recommend';
import type { CategoryHint } from './recommend';
import type { Style } from './types';

/**
 * AI recommendation (`style.suggest`, a light model; CONTRACTS-r9 §7). The system prompt carries `[sn-style]`
 * so the API mock answers deterministically; the user message is one JSON object. The model answers
 * `{"styles": [id, id, id], "reason"}`; anything unreadable falls back to the rules.
 */

export const STYLE_MARKER = '[sn-style]';
export const STYLE_SUGGEST_FEATURE = 'style.suggest';
export const STYLE_SUGGEST_MAX_TOKENS = 128;

export interface StyleSuggestInput {
  title: string;
  /** Category name (the note's published category, else its tags joined). */
  category?: string | null;
  /** The first few hundred characters of the text. */
  excerpt?: string;
  /** Styles to choose from (official + 我的风格); default: the official six. */
  styles?: Style[];
}

export function buildStyleSuggestPrompt(input: StyleSuggestInput): { system: string; user: string } {
  const styles = input.styles?.length ? input.styles : [...OFFICIAL_STYLE_LIST];
  const system = [
    `${STYLE_MARKER} 你是辰记的排版顾问。根据文章的分类、标题和开头，从给定的风格里挑 3 套最合适的，最合适的放最前。`,
    '只返回 JSON，不要解释，格式：{"styles":["id","id","id"],"reason":"一句话理由"}。',
    '风格说明：' + styles.map((s) => `${s.id}=${s.name}（${s.description}）`).join('；'),
  ].join('\n');
  const user = JSON.stringify({
    title: input.title,
    category: input.category ?? '',
    excerpt: (input.excerpt ?? '').slice(0, 400),
    styles: styles.map((s) => s.id),
  });
  return { system, user };
}

/** The model's three picks (ids it was offered, in order, no duplicates); `null` when the answer is unreadable. */
export function parseStyleSuggestion(text: string, offered: Style[]): Style[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (data as { styles?: unknown })?.styles;
  if (!Array.isArray(raw)) return null;
  const byId = new Map(offered.map((s) => [s.id, s]));
  const out: Style[] = [];
  for (const id of raw) {
    const s = typeof id === 'string' ? byId.get(id) : undefined;
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length ? out.slice(0, 3) : null;
}

/** The model's picks padded with the rule-based ones to three. */
export function fillSuggestion(
  picked: Style[] | null,
  category: CategoryHint,
  text: string,
  offered: Style[] = [...OFFICIAL_STYLE_LIST],
): Style[] {
  const out = [...(picked ?? [])];
  for (const s of recommendStyles(category, text, 6)) {
    if (out.length >= 3) break;
    const match = offered.find((o) => o.id === s.id) ?? s;
    if (!out.some((o) => o.id === match.id)) out.push(match);
  }
  return out.slice(0, 3);
}
