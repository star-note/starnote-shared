import type { TiptapDoc, TiptapNode } from '../api/types';

/** Plain text of the first paragraphs of a document, trimmed to `max` characters (for previews). */
export function docExcerpt(doc: TiptapDoc | null | undefined, max = 140): string {
  if (!doc) return '';
  const out: string[] = [];
  let len = 0;
  const walk = (n: TiptapNode): boolean => {
    if (len >= max) return false;
    if (n.type === 'heading') return true; // headings repeat the title; skip them
    if (n.text) {
      out.push(n.text);
      len += n.text.length;
      return true;
    }
    for (const c of n.content ?? []) if (!walk(c)) return false;
    if (n.type === 'paragraph' && out.length && !out[out.length - 1].endsWith(' ')) out.push(' ');
    return true;
  };
  walk(doc);
  const text = out.join('').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
