import { docChars, extractiveCondense, type TiptapJSON } from '@starnote/publish-core';

import { callFeature, parseJsonAnswer } from './ai';
import type { TiptapDoc, TiptapNode } from '../api/types';


/**
 * 精简版 (CONTRACTS-r9 §3): two modes.
 *  - `extract` 摘编 — no AI, free: the SDK picks the most important original sentences (`extractiveCondense`).
 *  - `rewrite` 改写 — AI `rewrite.condense`: the model rewrites the article to the target length, block by block.
 */
export type CondenseMode = 'extract' | 'rewrite';

export const CONDENSE_TARGETS = [800, 1500, 3000] as const;

export function condenseExtract(doc: TiptapDoc, target: number): { doc: TiptapDoc; chars: number } {
  const r = extractiveCondense(doc as TiptapJSON, target);
  return { doc: r.doc as TiptapDoc, chars: r.chars };
}

export function noteChars(doc: TiptapDoc | null | undefined): number {
  return doc ? docChars(doc as TiptapJSON) : 0;
}

type BlockKind = 'h2' | 'h3' | 'p' | 'quote' | 'li';

function text(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(text).join('');
}

/** The article as `{kind, text}` blocks (what the rewrite prompt reads). */
export function condenseBlocks(doc: TiptapDoc): { kind: BlockKind; text: string }[] {
  const out: { kind: BlockKind; text: string }[] = [];
  const walk = (n: TiptapNode, inQuote = false) => {
    switch (n.type) {
      case 'heading': {
        const t = text(n).trim();
        if (t) out.push({ kind: Number(n.attrs?.level) >= 3 ? 'h3' : 'h2', text: t });
        return;
      }
      case 'paragraph': {
        const t = text(n).trim();
        if (t) out.push({ kind: inQuote ? 'quote' : 'p', text: t });
        return;
      }
      case 'listItem':
      case 'taskItem': {
        const t = text(n).trim();
        if (t) out.push({ kind: 'li', text: t });
        return;
      }
      case 'blockquote':
        (n.content ?? []).forEach((c) => walk(c, true));
        return;
      case 'codeBlock':
      case 'image':
      case 'imageBlock':
      case 'table':
        return;
      default:
        (n.content ?? []).forEach((c) => walk(c, inQuote));
    }
  };
  walk(doc);
  return out;
}

/** `{kind, text}` blocks → a doc (consecutive `li` become one bullet list). */
export function blocksToDoc(blocks: { kind: string; text: string }[]): TiptapDoc {
  const content: TiptapNode[] = [];
  const para = (t: string): TiptapNode => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] });
  for (const b of blocks) {
    const t = String(b.text ?? '').trim();
    if (!t) continue;
    if (b.kind === 'h2' || b.kind === 'h3')
      content.push({ type: 'heading', attrs: { level: b.kind === 'h2' ? 2 : 3 }, content: [{ type: 'text', text: t }] });
    else if (b.kind === 'quote') content.push({ type: 'blockquote', content: [para(t)] });
    else if (b.kind === 'li') {
      const last = content[content.length - 1];
      const item: TiptapNode = { type: 'listItem', content: [para(t)] };
      if (last?.type === 'bulletList') last.content!.push(item);
      else content.push({ type: 'bulletList', content: [item] });
    } else content.push(para(t));
  }
  return { type: 'doc', content: content.length ? content : [para('')] };
}

const SYSTEM = (target: number) =>
  [
    '[sn-condense]',
    `把这篇中文文章压缩到约 ${target} 字：保留结构（小标题）、关键事实、数字和结论，删掉重复、铺垫和次要例子。`,
    '用原文的语气，不要添加原文没有的信息。',
    '只回答 JSON：{"blocks":[{"kind":"h2|h3|p|quote|li","text":"…"}]}',
  ].join('\n');

export async function condenseRewrite(
  doc: TiptapDoc,
  target: number,
  opts: { signal?: AbortSignal; call?: typeof callFeature } = {},
): Promise<{ doc: TiptapDoc; chars: number }> {
  const blocks = condenseBlocks(doc);
  const call = opts.call ?? callFeature;
  const answer = await call('rewrite.condense', {
    system: SYSTEM(target),
    user: JSON.stringify({ target, blocks }),
    maxTokens: Math.min(8000, Math.round(target * 2.2) + 400),
    signal: opts.signal,
  });
  const parsed = parseJsonAnswer<{ blocks?: { kind: string; text: string }[] }>(answer);
  if (!parsed?.blocks?.length) throw new Error('AI 没有给出可用的精简稿，请重试或改用「摘编」');
  const out = blocksToDoc(parsed.blocks);
  return { doc: out, chars: noteChars(out) };
}

export function condenseInputChars(doc: TiptapDoc): number {
  return condenseBlocks(doc).reduce((n, b) => n + b.text.length, 0);
}
