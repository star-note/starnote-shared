import type { NoteTemplate } from './model';
import { OFFICIAL_LOOK_LIST } from './official';
import {
  ensureContentPick,
  type NoteSignals,
  rankTemplates,
  type RecommendOptions,
  recommendForNote,
  recommendTemplates,
  type TemplatePick,
  wearsContentTemplate,
 type CategoryHint } from './recommend';

/**
 * AI recommendation (feature `style.suggest`, a light model; CONTRACTS-r9 §7 — the feature key is unchanged
 * although the UI now says 模板). The system prompt carries `[sn-style]` so the API mock answers
 * deterministically; the user message is one JSON object. The model answers `{"styles": [id, id, id], "reason"}`;
 * anything unreadable falls back to the rules. Offered templates may be the official fourteen plus 我的 / 群组 ones.
 */

export const TEMPLATE_MARKER = '[sn-style]';
export const TEMPLATE_SUGGEST_FEATURE = 'style.suggest';
/** Three ids and a short reason each (r10); the API's `style.suggest` cap matches. */
export const TEMPLATE_SUGGEST_MAX_TOKENS = 320;

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

// ------------------------------------------------------------------ r10: by content, with a reason per pick

export interface TemplateRecommendInput extends RecommendOptions {
  signals: NoteSignals;
  /** Every template the user may wear: the official fourteen + 我的 + the groups'. */
  candidates: readonly NoteTemplate[];
}

const REASON_MAX = 40;

/** What the model may choose from: everything offered except the note's current template. */
export function recommendCandidates(input: Pick<TemplateRecommendInput, 'candidates' | 'current'>): NoteTemplate[] {
  return input.candidates.filter((t) => t.id !== input.current?.id);
}

/**
 * The `[sn-style]` prompt (r10): every candidate's id / name / 用途 / kind / 简述, and the note's title, opening and
 * shape. The model answers `{"picks":[{"id","reason"}×3]}`; at least one pick must be a content template unless the
 * note already wears one.
 */
export function buildTemplateRecommendPrompt(input: TemplateRecommendInput): { system: string; user: string } {
  const candidates = recommendCandidates(input);
  const needContent = !wearsContentTemplate(input.current) && candidates.some((t) => t.kind === 'content');
  const system = [
    `${TEMPLATE_MARKER} 你是辰记的排版顾问。按文章的内容和结构，从候选模板里挑 3 款最合适的，最合适的放最前。`,
    'kind=content 的模板是一整套版式（卡片、步骤、清单、问答等）加配色；kind=look 只换配色和标题样式，不动结构。先看文章是写什么的（周报、教程、读书、访谈……）和它的结构，再挑模板。',
    needContent ? '3 款里至少 1 款必须是 kind=content。' : '',
    input.exclude?.length ? `尽量不要再选这些：${input.exclude.join('、')}。` : '',
    `只能用候选里的 id。只返回 JSON，不要解释：{"picks":[{"id":"…","reason":"一句理由，不超过 ${REASON_MAX - 16} 字"}]}`,
  ]
    .filter(Boolean)
    .join('\n');
  const s = input.signals;
  const user = JSON.stringify({
    title: s.title,
    category: s.category,
    opening: s.opening.slice(0, 300),
    structure: { headings: s.headings, lists: s.lists, tables: s.tables, images: s.images, code: s.code, quotes: s.quotes, chars: s.chars },
    current: input.current ? { id: input.current.id, kind: input.current.kind } : null,
    exclude: input.exclude ?? [],
    candidates: candidates.map((t) => ({
      id: t.id,
      name: t.name,
      purpose: t.purpose ?? '',
      kind: t.kind,
      brief: (t.description ?? '').slice(0, 48),
    })),
  });
  return { system, user };
}

/**
 * The model's picks: only candidate ids, in order, no duplicates, at most three, each with its reason (trimmed);
 * the r9 `{"styles":[…],"reason"}` answer is read too. `null` when nothing usable came back.
 */
export function parseTemplatePicks(text: string, candidates: readonly NoteTemplate[]): TemplatePick[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const obj = (data ?? {}) as { picks?: unknown; styles?: unknown; templates?: unknown; reason?: unknown };
  const shared = typeof obj.reason === 'string' ? obj.reason : '';
  const raw: { id: unknown; reason?: unknown }[] = Array.isArray(obj.picks)
    ? obj.picks.map((p) => (typeof p === 'string' ? { id: p } : ((p ?? {}) as { id: unknown; reason?: unknown })))
    : Array.isArray(obj.styles ?? obj.templates)
      ? ((obj.styles ?? obj.templates) as unknown[]).map((id) => ({ id, reason: shared }))
      : [];
  const byId = new Map(candidates.map((t) => [t.id, t]));
  const out: TemplatePick[] = [];
  for (const r of raw) {
    const t = typeof r.id === 'string' ? byId.get(r.id) : undefined;
    if (!t || out.some((o) => o.template.id === t.id)) continue;
    const reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, REASON_MAX) : '';
    out.push({ template: t, reason });
    if (out.length === 3) break;
  }
  return out.length ? out : null;
}

/**
 * The model's picks completed by the rules: missing reasons and missing picks come from the rule ranking (so there
 * are always three when three exist), and the 「至少 1 款内容模板」 rule holds whatever the model said.
 */
export function completeTemplatePicks(picked: TemplatePick[] | null, input: TemplateRecommendInput): TemplatePick[] {
  const rules = recommendForNote(input.signals, input.candidates, input, 3);
  const ranked = rankTemplates(input.signals, recommendCandidates(input));
  const ruleReason = (id: string) =>
    [...ranked.contents, ...ranked.looks].find((p) => p.template.id === id)?.reason ?? '';
  const out: TemplatePick[] = (picked ?? [])
    .filter((p) => p.template.id !== input.current?.id)
    .map((p) => ({ template: p.template, reason: p.reason || ruleReason(p.template.id) }));
  for (const r of [...rules, ...ranked.contents, ...ranked.looks]) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.template.id === r.template.id)) out.push(r);
  }
  return ensureContentPick(out.slice(0, 3), ranked.contents, input.current);
}

export interface TemplateRecommendation {
  picks: TemplatePick[];
  /** `ai` when the model's answer was used (even padded), `rules` otherwise. */
  source: 'ai' | 'rules';
}

/**
 * 「AI 推荐 3 款」 end to end: with a caller (AI on) the model picks, the rules complete and check; without one (AI off,
 * no points spent) or when the call fails, the rules alone. Errors other than a failed call never surface.
 */
export async function recommendTemplatesForNote(
  input: TemplateRecommendInput,
  call?: ((prompt: { system: string; user: string; maxTokens: number }) => Promise<string>) | null,
): Promise<TemplateRecommendation> {
  if (call) {
    try {
      const text = await call({ ...buildTemplateRecommendPrompt(input), maxTokens: TEMPLATE_SUGGEST_MAX_TOKENS });
      const picked = parseTemplatePicks(text, recommendCandidates(input));
      if (picked) return { picks: completeTemplatePicks(picked, input), source: 'ai' };
    } catch {
      /* the rules answer below */
    }
  }
  return { picks: recommendForNote(input.signals, input.candidates, input, 3), source: 'rules' };
}

/** r9 names, kept one round. */
export const STYLE_MARKER = TEMPLATE_MARKER;
export const STYLE_SUGGEST_FEATURE = TEMPLATE_SUGGEST_FEATURE;
export const STYLE_SUGGEST_MAX_TOKENS = TEMPLATE_SUGGEST_MAX_TOKENS;
export type StyleSuggestInput = TemplateSuggestInput;
export const buildStyleSuggestPrompt = buildTemplateSuggestPrompt;
export const parseStyleSuggestion = parseTemplateSuggestion;
