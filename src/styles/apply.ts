import type { Style } from './types';
import type { TiptapDoc, TiptapNode } from '../api/types';
import { applyLayoutOps, blockKind, type LayoutOp } from '../templates/layout';


/**
 * 套用风格: the layout half. A style fully decides the looks of the note's top-level headings, quotes and
 * dividers — a kind the layout does not name goes back to plain (so the skin's own look shows) — wraps
 * 「重点 / 注意 / 提示 …」 paragraphs in the style's callout card and appends its ending. Words never change; the
 * result goes into the editor as one undoable step. The skin half is the note's `style_id` → `theme`
 * (`PATCH /notes/{id}/meta`) and a class on the article root (`skinClassName`).
 */

const CALLOUT_RE = /^\s*(划重点|重点|注意|提示|关键|记住|小贴士|tips?)\s*[:：]/i;

function textOf(node: TiptapNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

const variantOf = (node: TiptapNode): string | null =>
  typeof node.attrs?.variant === 'string' ? node.attrs.variant : null;

/** The operations that turn `doc` into the style's layout (empty when nothing would change). */
export function planStyleOps(doc: TiptapDoc, style: Style): LayoutOp[] {
  const { layout } = style;
  const ops: LayoutOp[] = [];
  const want = (kind: 'h2' | 'h3' | 'quote' | 'divider'): string | null => layout[kind] ?? null;
  (doc.content ?? []).forEach((node, i) => {
    const kind = blockKind(node);
    const current = variantOf(node);
    if (kind === 'h2' || kind === 'h3') {
      const target = want(kind);
      if (target !== current) ops.push({ op: 'heading', i, variant: target });
    } else if (kind === 'blockquote') {
      const target = want('quote');
      if (target !== current) ops.push({ op: 'quote', i, variant: target });
    } else if (kind === 'hr') {
      // the ending's own `end` divider is part of the ending, not a rule to restyle
      if (current === 'end') return;
      const target = want('divider');
      const plain = node.type === 'horizontalRule' || current === null || current === 'line';
      if (target === null ? !plain : target !== current) ops.push({ op: 'divider', i, variant: target });
    } else if (kind === 'p' && layout.callout && CALLOUT_RE.test(textOf(node))) {
      ops.push({
        op: 'card',
        from: i,
        to: i,
        variant: layout.callout.variant,
        label: layout.callout.label ?? null,
      });
    }
  });
  if (layout.ending?.length) ops.push({ op: 'ending' });
  return ops;
}

/** The document dressed in the style; `doc` itself is not modified. */
export function applyStyle(doc: TiptapDoc, style: Style): TiptapDoc {
  return applyLayoutOps(doc, planStyleOps(doc, style), style.layout);
}

/** True when applying the style would change nothing in the document (the layout half is already on). */
export function styleApplied(doc: TiptapDoc, style: Style): boolean {
  const ops = planStyleOps(doc, style);
  if (!ops.length) return true;
  return JSON.stringify(applyLayoutOps(doc, ops, style.layout)) === JSON.stringify(doc);
}
