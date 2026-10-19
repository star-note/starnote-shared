import { blockLines, clone, int, kindOf, p, parseJsonObject, str, textOf, visibleLength } from './text';
import type { TiptapDoc, TiptapNode } from '../api/types';
import { CARD_LOOKS } from '../templates/layout';

/**
 * 一键「排成传播稿」(feature `layout.compose`): the 套用版式 op protocol, extended.
 *
 * The model reads the note, says what kind of article it is (the recommended template follows from that) and
 * answers `{"type","reason","template","ops":[…]}`. Besides the style ops of 套用版式 (heading / quote / divider /
 * card) it may add blocks: a lead card, subheadings where a long stretch has none, pull quotes taken verbatim from
 * the text, a 「本文要点」 card and an ending card. Nothing it sends can change the note's words: existing blocks
 * only get a look or a card around them, everything new is a new block (and is marked 「AI 添加」 in the preview).
 * The preview lists every change as an item that can be ticked off; the result is applied as one edit, so one undo
 * takes it all back.
 */

export const COMPOSE_MARKER = '[sn-compose]';

export const ARTICLE_TYPES = ['教程', '观点', '资讯', '清单', '访谈'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export interface ComposeLooks {
  key: string;
  /** The official template these looks come from. */
  name: string;
  h2: string;
  h3: string;
  quote: string;
  divider: string;
}

/** The official templates' looks (`starnote-api/app/services/official_templates/*.json` → layout). */
export const TEMPLATE_LOOKS: ComposeLooks[] = [
  { key: 'jiaocheng', name: '教程步骤', h2: 'step', h3: 'bar', quote: 'line', divider: 'pen' },
  { key: 'zhishi', name: '知识干货', h2: 'pill', h3: 'bar', quote: 'card', divider: 'diamond' },
  { key: 'chanpin', name: '产品发布', h2: 'ornament', h3: 'bar', quote: 'center', divider: 'gradient' },
  { key: 'fangtan', name: '访谈', h2: 'ornament', h3: 'bar', quote: 'center', divider: 'starsea' },
  { key: 'dushu', name: '读书笔记', h2: 'underline', h3: 'bar', quote: 'card', divider: 'leaf' },
  { key: 'suibi', name: '极简随笔', h2: 'ornament', h3: 'bar', quote: 'center', divider: 'chenji' },
  { key: 'zhoubao', name: '周报 / 月报', h2: 'bar', h3: 'underline', quote: 'line', divider: 'fade' },
  { key: 'huodong', name: '活动通知', h2: 'tag', h3: 'bar', quote: 'center', divider: 'ribbon' },
];

export const TYPE_TEMPLATE: Record<ArticleType, string> = {
  教程: 'jiaocheng',
  观点: 'zhishi',
  资讯: 'chanpin',
  清单: 'zhishi',
  访谈: 'fangtan',
};

export function looksOf(key: string | null | undefined): ComposeLooks {
  return TEMPLATE_LOOKS.find((l) => l.key === key) ?? TEMPLATE_LOOKS[1]!;
}

export type ComposeOp =
  | { op: 'heading'; i: number }
  | { op: 'quote'; i: number }
  | { op: 'divider'; after: number }
  | { op: 'divider'; i: number }
  | { op: 'card'; from: number; to: number; variant: string; label: string | null }
  | { op: 'insert_lead'; text: string }
  | { op: 'insert_heading'; before: number; text: string }
  | { op: 'pull_quote'; i: number; text: string }
  | { op: 'key_points'; items: string[] }
  | { op: 'ending_cta'; text: string };

export interface ComposePlan {
  type: ArticleType;
  reason: string;
  /** Recommended template (key of TEMPLATE_LOOKS). */
  template: string;
  ops: ComposeOp[];
}

export function buildComposePrompt(doc: TiptapDoc, title: string): { system: string; user: string } {
  const system = [
    `${COMPOSE_MARKER} 你是公众号主编，负责把长文排成专业、好读、适合传播的版式。原文一个字都不能改。`,
    `先判断文章类型（${ARTICLE_TYPES.join('、')}之一），再给出排版动作。只返回 JSON：`,
    '{"type":"教程","reason":"一句话说明判断依据","template":"模板 key，可空","ops":[…]}',
    '可用的 op（i / after / before 都是块序号）：',
    '{"op":"insert_lead","text":"开头导语，60–90 字，概括文章价值，吸引读下去"}；',
    '{"op":"key_points","items":["本文要点，3–5 条，每条不超过 30 字"]}；',
    '{"op":"insert_heading","before":序号,"text":"小标题，4–14 字"}（只在连续约 800 字以上没有小标题的地方加）；',
    '{"op":"pull_quote","i":序号,"text":"从该块原文里一字不差摘出的一句话"}（共 2–3 句，原文保留）；',
    '{"op":"divider","after":序号}（在章节之间放分割线，按章节节奏放，不要每段都放）；',
    '{"op":"heading","i":序号}（已有小标题统一样式）；{"op":"quote","i":序号}（已有引用统一样式）；',
    `{"op":"card","from":起,"to":止,"variant":"${CARD_LOOKS.join('|')}","label":"角标"}（把提示、注意事项放进卡片，少用）；`,
    '{"op":"ending_cta","text":"结尾引导语，邀请点赞、转发、留言，40 字以内"}。',
    `模板 key：${TEMPLATE_LOOKS.map((l) => `${l.key}=${l.name}`).join('，')}。`,
  ].join('\n');
  const chars = visibleLength(textOf(doc));
  const user = [
    `标题：${title || '无标题'}`,
    `全文约 ${chars} 字`,
    '笔记块（序号. 类型(字数): 全文）：',
    ...blockLines(doc),
  ].join('\n');
  return { system, user };
}

/** Validates the model's answer. Unknown ops and malformed fields are dropped; `null` when it isn't JSON at all. */
export function parseComposePlan(text: string): ComposePlan | null {
  const data = parseJsonObject(text);
  if (!data) return null;
  const raw = Array.isArray(data.ops) ? (data.ops as Record<string, unknown>[]) : [];
  const type = (ARTICLE_TYPES as readonly string[]).includes(String(data.type)) ? (data.type as ArticleType) : '观点';
  const template = TEMPLATE_LOOKS.some((l) => l.key === data.template) ? String(data.template) : TYPE_TEMPLATE[type];
  const ops: ComposeOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const i = int(item.i);
    switch (item.op) {
      case 'heading':
        if (i !== null) ops.push({ op: 'heading', i });
        break;
      case 'quote':
        if (i !== null) ops.push({ op: 'quote', i });
        break;
      case 'divider': {
        const after = int(item.after);
        if (after !== null) ops.push({ op: 'divider', after });
        else if (i !== null) ops.push({ op: 'divider', i });
        break;
      }
      case 'card': {
        const from = int(item.from);
        const to = int(item.to);
        const variant = String(item.variant ?? '');
        if (from !== null && to !== null && to >= from && (CARD_LOOKS as readonly string[]).includes(variant))
          ops.push({ op: 'card', from, to, variant, label: str(item.label, 12) || null });
        break;
      }
      case 'insert_lead': {
        const t = str(item.text, 200);
        if (t) ops.push({ op: 'insert_lead', text: t });
        break;
      }
      case 'insert_heading': {
        const before = int(item.before);
        const t = str(item.text, 24);
        if (before !== null && t) ops.push({ op: 'insert_heading', before, text: t });
        break;
      }
      case 'pull_quote': {
        const t = typeof item.text === 'string' ? item.text.trim() : '';
        if (i !== null && t) ops.push({ op: 'pull_quote', i, text: t.slice(0, 160) });
        break;
      }
      case 'key_points': {
        const items = Array.isArray(item.items) ? item.items.map((x) => str(x, 60)).filter(Boolean).slice(0, 6) : [];
        if (items.length) ops.push({ op: 'key_points', items });
        break;
      }
      case 'ending_cta':
      case 'ending': {
        const t = str(item.text, 120);
        if (t) ops.push({ op: 'ending_cta', text: t });
        break;
      }
    }
  }
  return { type, reason: str(data.reason, 120), template, ops };
}

export type ComposeItemKind = 'lead' | 'points' | 'heading' | 'pullquote' | 'ending' | 'dividers' | 'styles' | 'card';

export interface ComposeItem {
  id: string;
  kind: ComposeItemKind;
  /** What the checkbox says. */
  label: string;
  /** A line of the new text, or what it applies to. */
  detail?: string;
  /** New content written by AI (vs. a look on existing blocks). */
  added: boolean;
}

const isHeading = (n: TiptapNode | undefined) => n?.type === 'heading';
const isImage = (n: TiptapNode | undefined) => kindOf(n ?? {}) === 'image';
const isBlank = (n: TiptapNode | undefined) =>
  n?.type === 'paragraph' && !textOf(n).trim() && !(n.content ?? []).some((c) => c.type !== 'text');

/** Ops that fit the note; anything pointing at the wrong block, out of range or not verbatim is dropped. */
export function validOps(doc: TiptapDoc, ops: ComposeOp[]): ComposeOp[] {
  const blocks = doc.content ?? [];
  const n = blocks.length;
  const seen = new Set<string>();
  const cards: { from: number; to: number }[] = [];
  const out: ComposeOp[] = [];
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  for (const op of ops) {
    switch (op.op) {
      case 'heading':
        if (isHeading(blocks[op.i]) && [2, 3].includes(Number(blocks[op.i]!.attrs?.level)) && once(`h${op.i}`)) out.push(op);
        break;
      case 'quote':
        if (blocks[op.i]?.type === 'blockquote' && once(`q${op.i}`)) out.push(op);
        break;
      case 'divider':
        if ('after' in op) {
          const next = blocks[op.after + 1];
          // not after the last block, not next to an existing rule
          if (op.after < n - 1 && kindOf(blocks[op.after]!) !== 'hr' && kindOf(next ?? {}) !== 'hr' && once(`d${op.after}`))
            out.push(op);
        } else if (kindOf(blocks[op.i] ?? {}) === 'hr' && once(`di${op.i}`)) out.push(op);
        break;
      case 'card': {
        if (op.to >= n) break;
        const span = blocks.slice(op.from, op.to + 1);
        if (span.some((b) => isHeading(b) || b.type === 'card')) break;
        if (cards.some((c) => !(op.to < c.from || op.from > c.to))) break;
        cards.push(op);
        out.push(op);
        break;
      }
      case 'insert_lead':
      case 'key_points':
      case 'ending_cta':
        if (once(op.op)) out.push(op);
        break;
      case 'insert_heading':
        if (op.before > 0 && op.before < n && !isHeading(blocks[op.before]) && !isHeading(blocks[op.before - 1]) && once(`ih${op.before}`))
          out.push(op);
        break;
      case 'pull_quote': {
        const source = textOf(blocks[op.i]);
        const quotes = out.filter((o) => o.op === 'pull_quote').length;
        if (blocks[op.i]?.type === 'paragraph' && op.text.length >= 6 && source.includes(op.text) && quotes < 3 && once(`pq${op.text}`))
          out.push(op);
        break;
      }
    }
  }
  return out;
}

const headingLevelAt = (blocks: TiptapNode[], before: number): 2 | 3 =>
  blocks.slice(0, before).some((b) => isHeading(b) && Number(b.attrs?.level) <= 2) ? 3 : 2;

/** The checklist of the preview, in reading order. */
export function composeItems(doc: TiptapDoc, plan: ComposePlan): ComposeItem[] {
  const ops = validOps(doc, plan.ops);
  const blocks = doc.content ?? [];
  const items: ComposeItem[] = [];
  const lead = ops.find((o) => o.op === 'insert_lead');
  if (lead) items.push({ id: 'lead', kind: 'lead', label: '开头导语卡', detail: lead.text, added: true });
  const points = ops.find((o) => o.op === 'key_points');
  if (points) items.push({ id: 'points', kind: 'points', label: '「本文要点」卡', detail: points.items.join(' / '), added: true });
  for (const op of ops) {
    if (op.op === 'insert_heading')
      items.push({ id: `h:${op.before}`, kind: 'heading', label: `补小标题「${op.text}」`, detail: textOf(blocks[op.before]).slice(0, 40), added: true });
    if (op.op === 'pull_quote') items.push({ id: `q:${op.i}:${op.text.slice(0, 12)}`, kind: 'pullquote', label: '引用卡', detail: op.text, added: true });
    if (op.op === 'card')
      items.push({ id: `c:${op.from}`, kind: 'card', label: `放进卡片${op.label ? `「${op.label}」` : ''}`, detail: textOf(blocks[op.from]).slice(0, 40), added: false });
  }
  const dividers = ops.filter((o) => o.op === 'divider').length;
  if (dividers) items.push({ id: 'dividers', kind: 'dividers', label: `章节分割线（${dividers} 处）`, added: false });
  const styles = ops.filter((o) => o.op === 'heading' || o.op === 'quote').length;
  if (styles) items.push({ id: 'styles', kind: 'styles', label: `统一标题和引用样式（${styles} 处）`, added: false });
  const ending = ops.find((o) => o.op === 'ending_cta');
  if (ending) items.push({ id: 'ending', kind: 'ending', label: '结尾引导卡', detail: ending.text, added: true });
  return items;
}

function itemIdOf(op: ComposeOp): string {
  switch (op.op) {
    case 'insert_lead':
      return 'lead';
    case 'key_points':
      return 'points';
    case 'ending_cta':
      return 'ending';
    case 'insert_heading':
      return `h:${op.before}`;
    case 'pull_quote':
      return `q:${op.i}:${op.text.slice(0, 12)}`;
    case 'card':
      return `c:${op.from}`;
    case 'divider':
      return 'dividers';
    default:
      return 'styles';
  }
}

export interface ComposeResult {
  doc: TiptapDoc;
  /** Top-level indexes (in the new doc) of blocks AI wrote: the preview marks them 「AI 添加」. */
  added: number[];
}

/**
 * Builds the laid-out note. `accepted` limits it to the ticked items (all when omitted). Existing blocks keep
 * their text; new blocks are only ever inserted between them.
 */
export function applyCompose(
  doc: TiptapDoc,
  plan: ComposePlan,
  looks: ComposeLooks = looksOf(plan.template),
  accepted?: ReadonlySet<string>,
): ComposeResult {
  const ops = validOps(doc, plan.ops).filter((op) => !accepted || accepted.has(itemIdOf(op)));
  const blocks = clone(doc.content ?? []);
  const n = blocks.length;
  const divider = (variant: string): TiptapNode => ({ type: 'divider', attrs: { variant, label: null } });
  // slot k = between block k-1 and block k; each slot keeps [pull quotes of k-1, dividers after k-1, headings before k]
  const quotesAt = new Map<number, TiptapNode[]>();
  const dividersAt = new Map<number, TiptapNode[]>();
  const headingsAt = new Map<number, TiptapNode[]>();
  const push = (m: Map<number, TiptapNode[]>, k: number, node: TiptapNode) => m.set(k, [...(m.get(k) ?? []), node]);
  const cards: { from: number; to: number; variant: string; label: string | null }[] = [];
  let lead: TiptapNode | null = null;
  let points: TiptapNode | null = null;
  let ending: TiptapNode[] = [];

  for (const op of ops) {
    switch (op.op) {
      case 'heading': {
        const node = blocks[op.i]!;
        const level = Number(node.attrs?.level);
        node.attrs = { ...node.attrs, variant: level === 3 ? looks.h3 : looks.h2 };
        break;
      }
      case 'quote':
        blocks[op.i]!.attrs = { ...blocks[op.i]!.attrs, variant: looks.quote };
        break;
      case 'divider':
        if ('after' in op) push(dividersAt, op.after + 1, divider(looks.divider));
        else blocks[op.i] = divider(looks.divider);
        break;
      case 'card':
        cards.push(op);
        break;
      case 'insert_lead':
        lead = { type: 'card', attrs: { variant: 'accent', label: '导语' }, content: [p(op.text)] };
        break;
      case 'key_points':
        points = {
          type: 'card',
          attrs: { variant: 'soft', label: '本文要点' },
          content: [{ type: 'bulletList', content: op.items.map((t) => ({ type: 'listItem', content: [p(t)] })) }],
        };
        break;
      case 'insert_heading': {
        const level = headingLevelAt(blocks, op.before);
        push(headingsAt, op.before, {
          type: 'heading',
          attrs: { level, variant: level === 3 ? looks.h3 : looks.h2 },
          content: [{ type: 'text', text: op.text }],
        });
        break;
      }
      case 'pull_quote':
        push(quotesAt, op.i + 1, { type: 'blockquote', attrs: { variant: looks.quote }, content: [p(op.text)] });
        break;
      case 'ending_cta':
        ending = [divider('end'), { type: 'card', attrs: { variant: 'end', label: null }, content: [p(op.text)] }];
        break;
    }
  }

  const out: TiptapNode[] = [];
  const added: number[] = [];
  const emit = (node: TiptapNode, isNew: boolean) => {
    if (isNew) added.push(out.length);
    out.push(node);
  };
  const top = isImage(blocks[0]) ? 1 : 0;
  const slot = (k: number) => {
    for (const q of quotesAt.get(k) ?? []) emit(q, true);
    for (const d of dividersAt.get(k) ?? []) emit(d, false);
    for (const h of headingsAt.get(k) ?? []) emit(h, true);
  };
  for (let i = 0; i < n; i++) {
    if (i === top) {
      if (lead) emit(lead, true);
      if (points) emit(points, true);
    }
    if (i > 0) slot(i);
    const card = cards.find((c) => c.from === i);
    if (card) {
      emit({ type: 'card', attrs: { variant: card.variant, label: card.label }, content: blocks.slice(card.from, card.to + 1) }, false);
      i = card.to;
      continue;
    }
    emit(blocks[i]!, false);
  }
  if (n === 0) {
    if (lead) emit(lead, true);
    if (points) emit(points, true);
  }
  slot(n);
  if (ending.length) {
    while (out.length && isBlank(out[out.length - 1]) && !added.includes(out.length - 1)) out.pop();
    for (const node of ending) emit(node, true);
  }
  return { doc: { ...doc, type: 'doc', content: out.length ? out : [{ type: 'paragraph' }] }, added };
}

/** The note's own words, in order, with everything AI added left out: must equal the original's. */
export function originalText(doc: TiptapDoc, added: number[]): string {
  return (doc.content ?? []).filter((_, i) => !added.includes(i)).map(textOf).join('');
}
