import type { TiptapDoc } from '../../api/types';
import type { XhsCard, XhsContent } from '../../api/versions';
import {
  AiPointsError,
  callFeature,
  costText,
  estimateFeature,
  type FeatureEstimate,
  parseJsonAnswer,
  pointsShort,
  type VersionAiFeature,
} from '../ai';
import { docPlainText, extractKeywords } from '../keywords';
import { clip, splitXhsCards, type SplitOptions, XHS_KIND_LABELS } from './split';

/**
 * 小红书图集的 AI 部分 (CONTRACTS-r9 §6): `rewrite.xhs` writes every card's copy and the 正文笔记 from the rule split,
 * `tags.suggest` (cheap model) the 话题. Both answers are JSON; anything malformed falls back to the rule text, so a bad
 * answer never loses the cards. The callers here are injectable for tests; the defaults go through `POST /api/ai`.
 */

export { AiPointsError, costText, pointsShort, type FeatureEstimate };

export const XHS_MARKER = '[sn-xhs]';
export const TAGS_MARKER = '[sn-tags]';
export const IMAGE_KEYWORDS_MARKER = '[sn-image-keywords]';

export const CAPTION_MAX = 1000;
export const TOPICS_MAX = 10;

export type AiCaller = (
  feature: VersionAiFeature,
  req: { system: string; user: string; maxTokens?: number; signal?: AbortSignal },
) => Promise<string>;

/** Characters, as 小红书 counts them (code points). */
export const charCount = (s: string) => Array.from(s).length;

/** ≤ `max` characters: cut at the last line / sentence end before the limit when there is one. */
export function clampCaption(text: string, max = CAPTION_MAX): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, max).join('');
  const cut = Math.max(head.lastIndexOf('\n'), ...['。', '！', '？', '!', '?'].map((p) => head.lastIndexOf(p)));
  return (cut >= max * 0.7 ? head.slice(0, cut + 1) : head).trim();
}

/** Topics without `#`, 1–20 characters, no duplicates, at most `TOPICS_MAX`. */
export function cleanTopics(list: unknown[]): string[] {
  const out: string[] = [];
  for (const t of list) {
    if (typeof t !== 'string') continue;
    const v = t.replace(/^[#＃]+/, '').replace(/[#＃\s]+/g, '').trim();
    if (!v || charCount(v) > 20 || out.includes(v)) continue;
    out.push(v);
    if (out.length >= TOPICS_MAX) break;
  }
  return out;
}

/* ------------------------------------------------------------- rewrite.xhs */

export const XHS_SYSTEM = `${XHS_MARKER} 你是小红书图文编辑。用户给出一篇文章和按规则拆好的卡片（i 是序号，kind 是卡片类型，source 是规则摘出的原文）。
为每张卡片写适合小红书的文案，并写一段正文笔记：
- 只用文章里有的事实，不编造数据、人名和链接；不加联系方式和二维码；
- 封面 cover：title ≤ 20 字，抓人但不夸张，body 一句副标题 ≤ 24 字；
- 要点 points：title ≤ 14 字，items 3–5 条，每条 ≤ 18 字；
- 小节 section：title ≤ 14 字，body ≤ 70 字；
- 金句 quote：body ≤ 40 字，尽量保留原句，title 可留空；
- 结尾 ending：title ≤ 12 字，body ≤ 50 字的总结，items 是 1–2 句收藏 / 关注引导；
- caption 是正文笔记：口语、分段、可以有少量 emoji，不超过 900 字，不写话题标签（话题另外生成）。
只回答 JSON，不要解释：{"title":"…","cards":[{"i":0,"title":"…","body":"…","items":["…"]}],"caption":"…"}`;

/** The user message of `rewrite.xhs`: `{title, cards:[{i, kind, source}], article}`. */
export function xhsRequest(title: string, cards: XhsCard[], article: string): string {
  return JSON.stringify({
    title,
    cards: cards.map((c, i) => ({
      i,
      kind: c.kind,
      source: [c.title, c.body, ...(c.items ?? [])].filter(Boolean).join('\n'),
    })),
    article: article.slice(0, 6000),
  });
}

interface XhsAnswer {
  title?: unknown;
  caption?: unknown;
  cards?: unknown;
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? clip(v, max) : '');

/**
 * Lays the model's copy over the rule cards. Fields that are missing, empty or the wrong type keep the rule text;
 * cards the answer doesn't mention stay as they were. `ok` is false when nothing usable came back.
 */
export function applyXhsAnswer(
  cards: XhsCard[],
  answer: string,
): { cards: XhsCard[]; caption: string; title: string; ok: boolean } {
  const data = parseJsonAnswer<XhsAnswer>(answer);
  if (!data || typeof data !== 'object') return { cards, caption: '', title: '', ok: false };
  const list = Array.isArray(data.cards) ? (data.cards as Record<string, unknown>[]) : [];
  let touched = 0;
  const out = cards.map((c, idx) => {
    const a = list.find((x) => x && typeof x === 'object' && Number(x.i) === idx);
    if (!a) return c;
    const next: XhsCard = { ...c };
    const t = str(a.title, 30);
    const b = str(a.body, 140);
    if (t) next.title = t;
    else if (c.kind === 'quote' && typeof a.title === 'string') next.title = '';
    if (b) next.body = b;
    if (Array.isArray(a.items)) {
      const items = a.items.map((x) => str(x, 40)).filter(Boolean).slice(0, 6);
      if (items.length) next.items = items;
    }
    if (t || b || next.items !== c.items) touched++;
    delete next.render;
    return next;
  });
  const caption = typeof data.caption === 'string' ? clampCaption(data.caption) : '';
  const title = str(data.title, 30);
  return { cards: out, caption, title, ok: touched > 0 || Boolean(caption) };
}

/** 正文笔记 from the cards alone (no AI): subtitle, one line per card, the closing prompt. */
export function ruleCaption(title: string, cards: XhsCard[]): string {
  const lines: string[] = [];
  const cover = cards.find((c) => c.kind === 'cover');
  if (cover?.body) lines.push(cover.body);
  else if (title) lines.push(title);
  lines.push('');
  for (const c of cards) {
    if (c.kind === 'points') {
      if (c.title) lines.push(`📌 ${c.title}`);
      for (const it of c.items ?? []) lines.push(`· ${it}`);
      lines.push('');
    } else if (c.kind === 'section') {
      lines.push(`📌 ${c.title}`);
      if (c.body) lines.push(c.body);
      lines.push('');
    } else if (c.kind === 'quote' && c.body) {
      lines.push(`「${c.body.replace(/^[「“"]|[」”"]$/g, '')}」`);
      lines.push('');
    }
  }
  const end = cards.find((c) => c.kind === 'ending');
  if (end?.body) lines.push(end.body);
  if (end?.items?.length) lines.push(end.items.join('，'));
  return clampCaption(lines.join('\n').replace(/\n{3,}/g, '\n\n'));
}

/* ------------------------------------------------------------ tags.suggest */

export const TAGS_SYSTEM = `${TAGS_MARKER} 你为小红书笔记推荐话题标签。根据标题和正文给出 5–10 个话题：贴合内容、有人搜、每个 2–10 字、不带 #、不要重复、不要和内容无关的热门词。
只回答 JSON：{"tags":["…"]}`;

export function tagsRequest(title: string, text: string, platform = 'xiaohongshu'): string {
  return `标题：${title}\n正文：${text.replace(/\s+/g, ' ').slice(0, 1500)}\n平台：${platform}`;
}

export function parseTags(answer: string): string[] {
  const data = parseJsonAnswer<{ tags?: unknown }>(answer);
  return Array.isArray(data?.tags) ? cleanTopics(data.tags) : [];
}

/** Topics without AI: the note's top keywords. */
export function ruleTopics(title: string, text: string): string[] {
  return cleanTopics(extractKeywords(text, { title, limit: 6 }));
}

/* ---------------------------------------------------------- image.keywords */

export const IMAGE_KEYWORDS_SYSTEM = `${IMAGE_KEYWORDS_MARKER} 为下面这段文字想 3–6 个用来搜索配图的关键词：具体的名词或场景（如「咖啡」「城市夜景」「键盘」），每个 2–6 字，不要抽象词。
只回答 JSON：{"keywords":["…"]}`;

export function parseImageKeywords(answer: string): string[] {
  const data = parseJsonAnswer<{ keywords?: unknown }>(answer);
  return Array.isArray(data?.keywords) ? cleanTopics(data.keywords).slice(0, 6) : [];
}

export async function aiImageKeywords(text: string, call: AiCaller = callFeature, signal?: AbortSignal): Promise<string[]> {
  const answer = await call('image.keywords', {
    system: IMAGE_KEYWORDS_SYSTEM,
    user: text.replace(/\s+/g, ' ').slice(0, 1500),
    maxTokens: 200,
    signal,
  });
  return parseImageKeywords(answer);
}

/* -------------------------------------------------------------- generation */

export type XhsStep = 'split' | 'copy' | 'topics' | 'render';

export const XHS_STEP_LABELS: Record<XhsStep, string> = {
  split: '拆分卡片',
  copy: 'AI 写文案',
  topics: '生成话题',
  render: '渲染',
};

export interface GenerateOptions extends SplitOptions {
  /** Use `rewrite.xhs` + `tags.suggest`; false = rules only (free). */
  ai?: boolean;
  call?: AiCaller;
  signal?: AbortSignal;
  onStep?: (step: XhsStep) => void;
}

export interface GenerateResult {
  content: XhsContent;
  /** The title the version is saved under. */
  title: string;
  /** What fell back to rules, for a quiet notice: 'copy' / 'topics'. */
  fallbacks: ('copy' | 'topics')[];
}

/**
 * split (rules) → AI 文案 + 正文 → AI 话题. Points running out stops the run (`AiPointsError`); any other AI failure
 * falls back to the rule text for that step. The `render` step is the caller's (canvas + upload).
 */
export async function generateXhsContent(
  note: { title: string; doc: TiptapDoc | null | undefined },
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const call = opts.call ?? callFeature;
  const title = note.title.trim() || '无标题';
  const text = docPlainText(note.doc);
  const fallbacks: GenerateResult['fallbacks'] = [];

  opts.onStep?.('split');
  let cards = splitXhsCards(note.doc, title, opts);
  let caption = '';
  let versionTitle = title;

  if (opts.ai) {
    opts.onStep?.('copy');
    try {
      const answer = await call('rewrite.xhs', {
        system: XHS_SYSTEM,
        user: xhsRequest(title, cards, text),
        maxTokens: 2048,
        signal: opts.signal,
      });
      const applied = applyXhsAnswer(cards, answer);
      if (applied.ok) {
        cards = applied.cards;
        caption = applied.caption;
        if (applied.title) {
          versionTitle = applied.title;
          // the cover follows the AI title unless the card itself got one
          const cover = cards[0];
          if (cover?.kind === 'cover' && !cover.title) cards[0] = { ...cover, title: applied.title };
        }
      } else fallbacks.push('copy');
    } catch (e) {
      if (e instanceof AiPointsError || (e as { name?: string })?.name === 'AbortError') throw e;
      fallbacks.push('copy');
    }
  }
  if (!caption) caption = ruleCaption(title, cards);

  opts.onStep?.('topics');
  let topics: string[] = [];
  if (opts.ai) {
    try {
      topics = parseTags(
        await call('tags.suggest', {
          system: TAGS_SYSTEM,
          user: tagsRequest(title, text),
          maxTokens: 256,
          signal: opts.signal,
        }),
      );
    } catch (e) {
      if (e instanceof AiPointsError || (e as { name?: string })?.name === 'AbortError') throw e;
    }
    if (!topics.length) fallbacks.push('topics');
  }
  if (!topics.length) topics = ruleTopics(title, text);

  return { content: { cards, caption: clampCaption(caption), topics }, title: versionTitle, fallbacks };
}

/** 「约消耗 N 点」 for a whole generation: `rewrite.xhs` on the note plus a `tags.suggest`. */
export async function estimateXhs(note: { title: string; doc: TiptapDoc | null | undefined }): Promise<FeatureEstimate | null> {
  const chars = Math.min(6000, docPlainText(note.doc).length) + note.title.length;
  const [a, b] = await Promise.all([estimateFeature('rewrite.xhs', chars), estimateFeature('tags.suggest', Math.min(1500, chars))]);
  if (!a) return null;
  return {
    credits_min: a.credits_min + (b?.credits_min ?? 0),
    credits_max: a.credits_max + (b?.credits_max ?? 0),
    balance: a.balance,
  };
}

export const estimateImageKeywords = (chars: number) => estimateFeature('image.keywords', Math.min(1500, chars));

/** The kind name for UI lists. */
export const kindLabel = (c: XhsCard) => XHS_KIND_LABELS[c.kind];
