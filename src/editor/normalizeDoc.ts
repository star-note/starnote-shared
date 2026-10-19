import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * Node types written by older clients / other tools that the editor schema does not register, mapped to the node
 * that replaced them. ProseMirror rejects a document with an unknown node type as a whole (Tiptap then loads an
 * EMPTY editor), so these are rewritten before any JSON reaches `content` / `setContent`.
 *
 * * `horizontalRule` (StarterKit's `<hr>`) → `divider` with the plain `line` variant: the SDK kit registers
 *   `divider` instead of `horizontalRule` (opt-in only).
 */
const LEGACY: Record<string, (node: TiptapNode) => TiptapNode> = {
  horizontalRule: () => ({ type: 'divider', attrs: { variant: 'line', label: null } }),
};

function walk(node: TiptapNode): TiptapNode {
  const legacy = node.type ? LEGACY[node.type] : undefined;
  if (legacy) return legacy(node);
  if (!node.content?.length) return node;
  let changed = false;
  const content = node.content.map((c) => {
    const next = c && typeof c === 'object' ? walk(c) : c;
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, content } : node;
}

/** `doc` with legacy node types rewritten (the same object when there is nothing to rewrite). */
export function normalizeDoc<T extends TiptapDoc | null | undefined>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc;
  return walk(doc) as T;
}

/** True when the document holds anything besides empty paragraphs. */
export function hasBody(doc: TiptapNode | null | undefined): boolean {
  return (doc?.content ?? []).some((b) => b.type !== 'paragraph' || Boolean(b.content?.length));
}
