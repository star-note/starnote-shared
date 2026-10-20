import type { NoteTemplate } from './model';
import { OFFICIAL_LOOK_LIST } from './official';
import { recommendTemplates } from './recommend';
import type { CategoryHint } from './recommend';

/**
 * AI recommendation (feature `style.suggest`, a light model; CONTRACTS-r9 §7 — the feature key is unchanged
 * although the UI now says 模板). The system prompt carries `[sn-style]` so the API mock answers
 * deterministically; the user message is one JSON object. The model answers `{"styles": [id, id, id], "reason"}`;
 * anything unreadable falls back to the rules. Offered templates may be the official fourteen plus 我的 / 群组 ones.
 */

export const TEMPLATE_MARKER = '[sn-style]';
export const TEMPLATE_SUGGEST_FEATURE = 'style.suggest';
export const TEMPLATE_SUGGEST_MAX_TOKENS = 128;

export interface TemplateSuggestInput {
  title: string;
  /** Category name (the note's published category, else its tags joined). */
  category?: string | null;
  /** The first few hundred characters of the text. */
  excerpt?: string;
  /** Templates to choose from (official + 我的 / 群组); default: the official six looks. */
  templates?: NoteTemplate[];
  /** r9 name of `templates`. */
  styles?: NoteTemplate[];
}

function offeredOf(input: TemplateSuggestInput): NoteTemplate[] {
  const list = input.templates?.length ? input.templates : input.styles;
  return list?.length ? list : [...OFFICIAL_LOOK_LIST];
}

export function buildTemplateSuggestPrompt(input: TemplateSuggestInput): { system: string; user: string } {
  const templates = offeredOf(input);
  const system = [
    `${TEMPLATE_MARKER} 你是辰记的排版顾问。根据文章的分类、标题和开头，从给定的模板里挑 3 款最合适的，最合适的放最前。`,
    '只返回 JSON，不要解释，格式：{"styles":["id","id","id"],"reason":"一句话理由"}。',
    '模板说明：' +
      templates
        .map((s) => `${s.id}=${s.name}（${s.purpose ? `${s.purpose}；` : ''}${s.kind === 'look' ? '只换外观；' : ''}${s.description}）`)
        .join('；'),
  ].join('\n');
  const user = JSON.stringify({
    title: input.title,
    category: input.category ?? '',
    excerpt: (input.excerpt ?? '').slice(0, 400),
    styles: templates.map((s) => s.id),
  });
  return { system, user };
}

/** The model's three picks (ids it was offered, in order, no duplicates); `null` when the answer is unreadable. */
export function parseTemplateSuggestion(text: string, offered: NoteTemplate[]): NoteTemplate[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (data as { styles?: unknown; templates?: unknown })?.styles ?? (data as { templates?: unknown })?.templates;
  if (!Array.isArray(raw)) return null;
  const byId = new Map(offered.map((s) => [s.id, s]));
  const out: NoteTemplate[] = [];
  for (const id of raw) {
    const s = typeof id === 'string' ? byId.get(id) : undefined;
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length ? out.slice(0, 3) : null;
}

/** The model's picks padded with the rule-based ones to three. */
export function fillSuggestion(
  picked: NoteTemplate[] | null,
  category: CategoryHint,
  text: string,
  offered: NoteTemplate[] = [...OFFICIAL_LOOK_LIST],
): NoteTemplate[] {
  const out = [...(picked ?? [])];
  for (const s of recommendTemplates(category, text, 6)) {
    if (out.length >= 3) break;
    const match = offered.find((o) => o.id === s.id) ?? s;
    if (!out.some((o) => o.id === match.id)) out.push(match);
  }
  return out.slice(0, 3);
}

/** r9 names, kept one round. */
export const STYLE_MARKER = TEMPLATE_MARKER;
export const STYLE_SUGGEST_FEATURE = TEMPLATE_SUGGEST_FEATURE;
export const STYLE_SUGGEST_MAX_TOKENS = TEMPLATE_SUGGEST_MAX_TOKENS;
export type StyleSuggestInput = TemplateSuggestInput;
export const buildStyleSuggestPrompt = buildTemplateSuggestPrompt;
export const parseStyleSuggestion = parseTemplateSuggestion;
