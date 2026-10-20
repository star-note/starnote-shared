import type { TemplateLayout } from '../api/templates';
import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * 「套用版式」: dress an existing note in a template's looks without touching its words.
 *
 * Both paths produce the same small list of operations over the note's top-level blocks:
 * the rule-based one (`planLayout`) maps H2/H3, quotes and rules onto the template's
 * styled blocks; the AI one asks the model for the list (`buildLayoutPrompt` →
 * `parseLayoutOps`). `applyLayoutOps` then builds the new document, ignoring any
 * operation that does not fit the block it points at, so a confused model can never
 * corrupt or drop content.
 */

/** Mirrors the SDK's StyledBlocks / divider looks (ai-sparkwrite-editor). */
export const HEADING_LOOKS = ['pill', 'bar', 'underline', 'ornament', 'step', 'tag'] as const;
export const QUOTE_LOOKS = ['card', 'center', 'line', 'paper'] as const;
export const CARD_LOOKS = [
  'soft',
  'outline',
  'shadow',
  'accent',
  'ticket',
  'tip',
  'warn',
  'ask',
  'answer',
  'end',
  'dark',
  'stat',
] as const;
export const DIVIDER_LOOKS = [
  'line',
  'dashed',
  'dotted',
  'double',
  'short',
  'dots',
  'stars',
  'gradient',
  'diamond',
  'trio',
  'wave',
  'starsea',
  'leaf',
  'end',
  'bar',
  'pen',
  'ribbon',
  'ink',
  'fade',
  'chenji',
] as const;

/** `variant: null` resets a block to its plain look (the skin's styling then applies; CONTRACTS-r9 §7). */
export type LayoutOp =
  | { op: 'heading'; i: number; variant: string | null }
  | { op: 'quote'; i: number; variant: string | null }
  | { op: 'divider'; i: number; variant: string | null }
  | { op: 'divider'; after: number; variant: string }
  | { op: 'card'; from: number; to: number; variant: string; label?: string | null }
  | { op: 'ending' };

const has = (list: readonly string[], v: unknown): v is string =>
  typeof v === 'string' && list.includes(v);

function textOf(node: TiptapNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function withVariant(
  attrs: Record<string, unknown> | undefined,
  variant: string | null,
): Record<string, unknown> | undefined {
  if (variant !== null) return { ...attrs, variant };
  if (!attrs || !('variant' in attrs)) return attrs;
  const { variant: _dropped, ...rest } = attrs;
  return rest;
}

/** A block's kind as the prompt (and the mock model) names it. */
export function blockKind(node: TiptapNode): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level) || 2;
      return `h${Math.min(4, Math.max(1, level))}`;
    }
    case 'paragraph':
      return 'p';
    case 'blockquote':
      return 'blockquote';
    case 'horizontalRule':
    case 'divider':
      return 'hr';
    case 'bulletList':
    case 'taskList':
      return 'ul';
    case 'orderedList':
      return 'ol';
    case 'image':
    case 'imageBlock':
    case 'imageGif':
      return 'image';
    case 'codeBlock':
      return 'code';
    case 'card':
      return 'card';
    default:
      return 'other';
  }
}

/** One line per top-level block: `3. h2: 第一节`. */
export function describeBlocks(doc: TiptapDoc, max = 60): string[] {
  return (doc.content ?? []).map((node, i) => {
    const text = textOf(node).replace(/\s+/g, ' ').trim().slice(0, max);
    return `${i}. ${blockKind(node)}: ${text}`;
  });
}

const CALLOUT_RE = /^\s*(划重点|重点|注意|提示|关键|记住|小贴士|tips?)\s*[:：]/i;

/** The rule-based plan: the same choices a careful editor would make by hand. */
export function planLayout(doc: TiptapDoc, layout: TemplateLayout): LayoutOp[] {
  const ops: LayoutOp[] = [];
  (doc.content ?? []).forEach((node, i) => {
    const kind = blockKind(node);
    if (kind === 'h2' && layout.h2) ops.push({ op: 'heading', i, variant: layout.h2 });
    else if (kind === 'h3' && layout.h3) ops.push({ op: 'heading', i, variant: layout.h3 });
    else if (kind === 'blockquote' && layout.quote)
      ops.push({ op: 'quote', i, variant: layout.quote });
    else if (kind === 'hr' && layout.divider)
      ops.push({ op: 'divider', i, variant: layout.divider });
    else if (kind === 'p' && layout.callout && CALLOUT_RE.test(textOf(node)))
      ops.push({
        op: 'card',
        from: i,
        to: i,
        variant: layout.callout.variant,
        label: layout.callout.label ?? null,
      });
  });
  if (layout.ending?.length && !endsWithEnding(doc, layout)) ops.push({ op: 'ending' });
  return ops;
}

function endsWithEnding(doc: TiptapDoc, layout: TemplateLayout): boolean {
  const content = doc.content ?? [];
  const ending = layout.ending ?? [];
  if (!ending.length || content.length < ending.length) return false;
  const tail = content.slice(-ending.length);
  return JSON.stringify(tail) === JSON.stringify(ending);
}

/** Validates and normalises a model's answer; anything malformed is dropped. */
export function parseLayoutOps(text: string): LayoutOp[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (data as { ops?: unknown })?.ops;
  if (!Array.isArray(raw)) return null;
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  const ops: LayoutOp[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    const i = int(item.i);
    switch (item.op) {
      case 'heading':
        if (i !== null && has(HEADING_LOOKS, item.variant))
          ops.push({ op: 'heading', i, variant: item.variant });
        break;
      case 'quote':
        if (i !== null && has(QUOTE_LOOKS, item.variant))
          ops.push({ op: 'quote', i, variant: item.variant });
        break;
      case 'divider': {
        const after = int(item.after);
        if (!has(DIVIDER_LOOKS, item.variant)) break;
        if (i !== null) ops.push({ op: 'divider', i, variant: item.variant });
        else if (after !== null) ops.push({ op: 'divider', after, variant: item.variant });
        break;
      }
      case 'card': {
        const from = int(item.from);
        const to = int(item.to);
        if (from !== null && to !== null && to >= from && has(CARD_LOOKS, item.variant)) {
          const label = typeof item.label === 'string' ? item.label.slice(0, 12) : null;
          ops.push({ op: 'card', from, to, variant: item.variant, label: label || null });
        }
        break;
      }
      case 'ending':
        ops.push({ op: 'ending' });
        break;
    }
  }
  return ops;
}

/**
 * Builds the dressed document. Operations that don't match their block (a heading op on a
 * paragraph, an index out of range, overlapping cards) are skipped; text is never changed.
 */
export function applyLayoutOps(doc: TiptapDoc, ops: LayoutOp[], layout: TemplateLayout): TiptapDoc {
  const blocks = clone(doc.content ?? []);
  const n = blocks.length;
  const after = new Map<number, TiptapNode[]>();
  const wraps: { from: number; to: number; variant: string; label: string | null }[] = [];
  let ending = false;

  for (const op of ops) {
    if (op.op === 'ending') {
      ending = true;
      continue;
    }
    if (op.op === 'card') {
      if (op.to >= n || wraps.some((w) => !(op.to < w.from || op.from > w.to))) continue;
      const span = blocks.slice(op.from, op.to + 1);
      if (span.some((b) => b.type === 'card')) continue;
      wraps.push({ from: op.from, to: op.to, variant: op.variant, label: op.label ?? null });
      continue;
    }
    if (op.op === 'divider' && 'after' in op) {
      if (op.after >= n) continue;
      const list = after.get(op.after) ?? [];
      list.push({ type: 'divider', attrs: { variant: op.variant, label: null } });
      after.set(op.after, list);
      continue;
    }
    const node = blocks[op.i];
    if (!node) continue;
    if (op.op === 'heading' && node.type === 'heading') {
      node.attrs = withVariant(node.attrs, op.variant);
    } else if (op.op === 'quote' && node.type === 'blockquote') {
      node.attrs = withVariant(node.attrs, op.variant);
    } else if (op.op === 'divider' && (node.type === 'horizontalRule' || node.type === 'divider')) {
      blocks[op.i] =
        op.variant === null
          ? { type: 'horizontalRule' }
          : {
              type: 'divider',
              attrs: {
                variant: op.variant,
                label: node.type === 'divider' ? (node.attrs?.label ?? null) : null,
              },
            };
    }
  }

  const out: TiptapNode[] = [];
  for (let i = 0; i < n; i++) {
    const wrap = wraps.find((w) => w.from === i);
    if (wrap) {
      out.push({
        type: 'card',
        attrs: { variant: wrap.variant, label: wrap.label },
        content: blocks.slice(wrap.from, wrap.to + 1),
      });
      for (let j = wrap.from; j <= wrap.to; j++) out.push(...(after.get(j) ?? []));
      i = wrap.to;
      continue;
    }
    out.push(blocks[i]!);
    out.push(...(after.get(i) ?? []));
  }
  if (ending && layout.ending?.length && !endsWithEnding({ type: 'doc', content: out }, layout)) {
    // Drop a trailing empty paragraph so the ending sits right after the text.
    const isBlank = (b: TiptapNode | undefined) =>
      b?.type === 'paragraph' &&
      !textOf(b).trim() &&
      !(b.content ?? []).some((c) => c.type !== 'text');
    while (out.length && isBlank(out[out.length - 1])) out.pop();
    out.push(...clone(layout.ending));
  }
  return { ...doc, type: 'doc', content: out.length ? out : [{ type: 'paragraph' }] };
}

/** System prompt marker the API's mock model recognises; the real model just reads the instructions. */
export const LAYOUT_MARKER = '[sn-layout]';

export function buildLayoutPrompt(
  doc: TiptapDoc,
  title: string,
  layout: TemplateLayout,
): { system: string; user: string } {
  const convention = {
    h2: layout.h2,
    h3: layout.h3,
    quote: layout.quote,
    divider: layout.divider,
    callout: layout.callout,
    ending: layout.ending?.length ? true : undefined,
  };
  const system = [
    `${LAYOUT_MARKER} 你是辰记的排版助手。根据模板约定，为笔记的每个块挑选样式，不改动任何文字。`,
    '只返回 JSON，不要解释，格式：{"ops":[…]}。可用的 op：',
    '{"op":"heading","i":块序号,"variant":标题样式}；{"op":"quote","i":序号,"variant":引用样式}；',
    '{"op":"divider","i":序号,"variant":分割线样式}（把已有分割线换样式）；{"op":"divider","after":序号,"variant":…}（在某块后加分割线，用于大段落之间换节，少用）；',
    '{"op":"card","from":起,"to":止,"variant":卡片样式,"label":"角标，可空"}（把连续几块放进卡片，用于要点、提示、时间地点等）；{"op":"ending"}（文末加模板的结尾引导）。',
    `标题样式：${HEADING_LOOKS.join('|')}；引用样式：${QUOTE_LOOKS.join('|')}；卡片样式：${CARD_LOOKS.join('|')}；分割线样式：${DIVIDER_LOOKS.join('|')}。`,
    '优先遵守约定；同一种块用同一种样式；不要把标题放进卡片；卡片不要嵌套。',
  ].join('\n');
  const user = [
    `模板：${title}`,
    `约定JSON: ${JSON.stringify(convention)}`,
    '笔记块（序号. 类型: 文本开头）：',
    ...describeBlocks(doc),
  ].join('\n');
  return { system, user };
}

/** A user template's looks, read from its own content (the first of each kind wins). */
export function deriveLayout(doc: TiptapDoc): TemplateLayout {
  const layout: TemplateLayout = {};
  const walk = (nodes: TiptapNode[] | undefined) => {
    for (const node of nodes ?? []) {
      const variant = typeof node.attrs?.variant === 'string' ? node.attrs.variant : undefined;
      if (node.type === 'heading' && variant) {
        const level = Number(node.attrs?.level);
        if (level === 2) layout.h2 ??= variant;
        if (level === 3) layout.h3 ??= variant;
      } else if (node.type === 'blockquote' && variant) layout.quote ??= variant;
      else if (node.type === 'divider' && variant && variant !== 'end') layout.divider ??= variant;
      else if (
        node.type === 'card' &&
        variant &&
        ['tip', 'warn', 'soft', 'outline'].includes(variant) &&
        node.attrs?.label
      )
        layout.callout ??= { variant, label: String(node.attrs.label) };
      if (node.type !== 'card') walk(node.content);
    }
  };
  walk(doc.content);
  const content = doc.content ?? [];
  const last = content[content.length - 1];
  if (last?.type === 'card' && last.attrs?.variant === 'end') {
    const prev = content[content.length - 2];
    layout.ending = clone(prev?.type === 'divider' ? [prev, last] : [last]);
  }
  return layout;
}
