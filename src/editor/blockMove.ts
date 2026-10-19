import type { Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';

export type BlockDirection = 'up' | 'down';

/** The top-level block that holds the selection: its index and start position. */
export function currentBlock(
  state: EditorState,
): { index: number; start: number; node: PMNode } | null {
  const { doc, selection } = state;
  if (!doc.childCount) return null;
  const index = Math.min(selection.$from.index(0), doc.childCount - 1);
  let start = 0;
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
  return { index, start, node: doc.child(index) };
}

/**
 * Swap the selection's top-level block with its neighbour (the touch replacement for dragging a block by its
 * handle). The selection moves with the block. `null` when there is nowhere to go.
 */
export function moveBlockTr(state: EditorState, dir: BlockDirection): Transaction | null {
  const cur = currentBlock(state);
  if (!cur) return null;
  const { doc, selection } = state;
  const { index, start, node } = cur;
  const neighbourIndex = dir === 'up' ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= doc.childCount) return null;
  const neighbour = doc.child(neighbourIndex);
  const tr = state.tr;
  const relFrom = selection.from - start;
  const relTo = selection.to - start;
  tr.delete(start, start + node.nodeSize);
  const target = dir === 'up' ? start - neighbour.nodeSize : start + neighbour.nodeSize;
  tr.insert(target, node);
  if (selection instanceof NodeSelection)
    tr.setSelection(NodeSelection.create(tr.doc, target + relFrom));
  else tr.setSelection(TextSelection.create(tr.doc, target + relFrom, target + relTo));
  return tr.scrollIntoView();
}

/** Insert a copy of the selection's top-level block right after it. */
export function duplicateBlockTr(state: EditorState): Transaction | null {
  const cur = currentBlock(state);
  if (!cur) return null;
  return state.tr
    .insert(cur.start + cur.node.nodeSize, cur.node.copy(cur.node.content))
    .scrollIntoView();
}

/** Remove the selection's top-level block (a lone empty paragraph stays: the document needs one block). */
export function deleteBlockTr(state: EditorState): Transaction | null {
  const cur = currentBlock(state);
  if (!cur) return null;
  const tr = state.tr;
  if (state.doc.childCount === 1) {
    const para = state.schema.nodes.paragraph;
    if (!para) return null;
    tr.replaceWith(0, state.doc.content.size, para.create());
    return tr;
  }
  tr.delete(cur.start, cur.start + cur.node.nodeSize);
  return tr.scrollIntoView();
}
