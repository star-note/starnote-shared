import { applyLayoutOps, blockKind, type LayoutOp } from './layout';
import type { NoteTemplate } from './model';
import type { TiptapDoc, TiptapNode } from '../api/types';


/**
 * 套用到本文: the layout half. A template fully decides the looks of the note's top-level headings, quotes and
 * dividers — a kind the layout does not name goes back to plain (so the skin's own look shows) — wraps
 * 「重点 / 注意 / 提示 …」 paragraphs in the template's callout card and appends its ending. Words never change; the
 * result goes into the editor as one undoable step. The skin half is the note's `style_id` (= 模板 id) → `theme`
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

/** The operations that turn `doc` into the template's layout (empty when nothing would change). */
export function planLookOps(doc: TiptapDoc, template: NoteTemplate): LayoutOp[] {
  const { layout } = template;
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

/** The document dressed in the template's looks; `doc` itself is not modified. */
export function applyTemplateLook(doc: TiptapDoc, template: NoteTemplate): TiptapDoc {
  return applyLayoutOps(doc, planLookOps(doc, template), template.layout);
}

/** True when applying the template would change nothing in the document (the layout half is already on). */
export function lookApplied(doc: TiptapDoc, template: NoteTemplate): boolean {
  const ops = planLookOps(doc, template);
  if (!ops.length) return true;
  return JSON.stringify(applyLayoutOps(doc, ops, template.layout)) === JSON.stringify(doc);
}

/** r9 names, kept one round. */
export const planStyleOps = planLookOps;
export const applyStyle = applyTemplateLook;
export const styleApplied = lookApplied;
