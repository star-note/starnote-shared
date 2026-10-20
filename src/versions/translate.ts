import { callFeature, parseJsonAnswer } from './ai';
import type { TiptapDoc, TiptapNode } from '../api/types';


/**
 * 英文海外版 (CONTRACTS-r9 §3): node-by-node translation that keeps the layout.
 *
 * Every text block (paragraph, heading, list item paragraph, table cell, card…) becomes one segment; its inline
 * formatting is written as small tags the model must keep — `<b> <i> <u> <s> <code>`, links `<a1>…</a1>`, other
 * marks `<m1>…</m1>`, and atoms (hard break, inline image, emoji, formula) as `<x1/>`. The answer is parsed back
 * onto the same marks, so bold stays bold and links keep their `href`. Images, code blocks, dividers and every
 * node attribute are copied as they are; image captions / alt texts are translated as their own segments.
 *
 * Terms: a glossary (rules, not AI) — sent with the request and enforced again on the answer, so 辰记 is always
 * StarNote however the model phrases it.
 */

export type TranslateMode = 'literal' | 'localized';

/** Product / platform names that must come out the same every time. */
export const DEFAULT_GLOSSARY: Record<string, string> = {
  辰记: 'StarNote',
  公众号: 'WeChat Official Account',
  微信公众号: 'WeChat Official Account',
  小红书: 'Xiaohongshu (RED)',
  知乎: 'Zhihu',
  掘金: 'Juejin',
  微博: 'Weibo',
  抖音: 'Douyin',
  B站: 'Bilibili',
  哔哩哔哩: 'Bilibili',
  语雀: 'Yuque',
  一稿多版: 'one draft, many versions',
};

const SIMPLE_MARKS: Record<string, string> = { bold: 'b', italic: 'i', underline: 'u', strike: 's', code: 'code' };
const SIMPLE_TAGS: Record<string, string> = Object.fromEntries(Object.entries(SIMPLE_MARKS).map(([k, v]) => [v, k]));

type Mark = NonNullable<TiptapNode['marks']>[number];

export interface Segment {
  id: string;
  text: string;
}

interface SegmentRef {
  id: string;
  /** Path of child indexes from the doc root to the text block (or the image node for attr segments). */
  path: number[];
  /** Inline content: the block's children. Attr segment: the attribute name. */
  kind: 'inline' | 'attr';
  attr?: string;
  links: Mark[];
  others: Mark[];
  atoms: TiptapNode[];
}

const SKIP_BLOCKS = new Set(['codeBlock', 'mermaid', 'katex', 'iframe', 'horizontalRule', 'divider', 'excalidraw', 'drawio']);
const IMAGE_NODES = new Set(['image', 'imageBlock', 'imageGif']);

function hasCjkOrText(s: string): boolean {
  return /\S/.test(s);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeText(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

/** Inline children → tagged text. */
function encodeInline(nodes: TiptapNode[], ref: SegmentRef): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      let t = escapeText(node.text ?? '');
      // innermost first: simple marks, then other marks, link outermost
      const marks = node.marks ?? [];
      for (const m of marks) {
        const tag = SIMPLE_MARKS[m.type];
        if (tag) t = `<${tag}>${t}</${tag}>`;
      }
      for (const m of marks) {
        if (SIMPLE_MARKS[m.type] || m.type === 'link') continue;
        let i = ref.others.findIndex((x) => sameMark(x, m));
        if (i < 0) i = ref.others.push(m) - 1;
        t = `<m${i + 1}>${t}</m${i + 1}>`;
      }
      const link = marks.find((m) => m.type === 'link');
      if (link) {
        let i = ref.links.findIndex((x) => sameMark(x, link));
        if (i < 0) i = ref.links.push(link) - 1;
        t = `<a${i + 1}>${t}</a${i + 1}>`;
      }
      out += t;
    } else {
      const i = ref.atoms.push(node) - 1;
      out += `<x${i + 1}/>`;
    }
  }
  return out;
}

/** Tagged text → inline children; `null` when the tags don't parse (the caller keeps the plain text). */
export function decodeInline(text: string, ref: Pick<SegmentRef, 'links' | 'others' | 'atoms'>): TiptapNode[] | null {
  const out: TiptapNode[] = [];
  const stack: { tag: string; mark: Mark }[] = [];
  const usedAtoms = new Set<number>();
  const re = /<(\/?)([a-z]+)(\d*)(\/?)>/g;
  let last = 0;
  const pushText = (raw: string) => {
    if (!raw) return;
    const t = unescapeText(raw);
    const marks = stack.map((s) => s.mark);
    const prev = out[out.length - 1];
    if (prev?.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(marks)) prev.text = (prev.text ?? '') + t;
    else out.push(marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [whole, close, name, num, selfClose] = m;
    const tag = `${name}${num}`;
    let mark: Mark | undefined;
    if (name === 'x' && num && selfClose) {
      pushText(text.slice(last, m.index));
      last = m.index + whole.length;
      const atom = ref.atoms[Number(num) - 1];
      if (atom && !usedAtoms.has(Number(num))) {
        usedAtoms.add(Number(num));
        out.push(atom);
      }
      continue;
    }
    if (SIMPLE_TAGS[tag]) mark = { type: SIMPLE_TAGS[tag] };
    else if (name === 'a' && num) mark = ref.links[Number(num) - 1];
    else if (name === 'm' && num) mark = ref.others[Number(num) - 1];
    if (!mark) continue; // not ours: leave it in the text
    pushText(text.slice(last, m.index));
    last = m.index + whole.length;
    if (close) {
      const top = stack[stack.length - 1];
      if (!top || top.tag !== tag) return null;
      stack.pop();
    } else stack.push({ tag, mark });
  }
  if (stack.length) return null;
  pushText(text.slice(last));
  // atoms the model dropped (an inline image…) go back at the end rather than vanish
  ref.atoms.forEach((a, i) => {
    if (!usedAtoms.has(i + 1)) out.push(a);
  });
  return out;
}

function isTextBlock(node: TiptapNode): boolean {
  return Boolean(node.content?.length) && node.content!.every((c) => c.type === 'text' || !c.content);
}

/** Every translatable piece of the doc, in order. */
export function collectSegments(doc: TiptapDoc): { segments: Segment[]; refs: SegmentRef[] } {
  const segments: Segment[] = [];
  const refs: SegmentRef[] = [];
  const walk = (node: TiptapNode, path: number[]) => {
    if (!node || SKIP_BLOCKS.has(node.type ?? '')) return;
    if (IMAGE_NODES.has(node.type ?? '')) {
      for (const attr of ['caption', 'alt', 'title']) {
        const v = node.attrs?.[attr];
        if (typeof v === 'string' && hasCjkOrText(v)) {
          const ref: SegmentRef = { id: `s${refs.length}`, path, kind: 'attr', attr, links: [], others: [], atoms: [] };
          refs.push(ref);
          segments.push({ id: ref.id, text: escapeText(v) });
        }
      }
      return;
    }
    if (node.type !== 'doc' && node.type !== 'text' && isTextBlock(node)) {
      const ref: SegmentRef = { id: `s${refs.length}`, path, kind: 'inline', links: [], others: [], atoms: [] };
      const text = encodeInline(node.content ?? [], ref);
      if (hasCjkOrText(text.replace(/<[^>]+>/g, ''))) {
        refs.push(ref);
        segments.push({ id: ref.id, text });
      }
      return;
    }
    // a card's label is a visible word too
    (node.content ?? []).forEach((c, i) => walk(c, [...path, i]));
  };
  walk(doc, []);
  // card / notice labels
  const labels = (node: TiptapNode, path: number[]) => {
    if (node.type === 'card' && typeof node.attrs?.label === 'string' && node.attrs.label.trim()) {
      const ref: SegmentRef = { id: `s${refs.length}`, path, kind: 'attr', attr: 'label', links: [], others: [], atoms: [] };
      refs.push(ref);
      segments.push({ id: ref.id, text: escapeText(String(node.attrs.label)) });
    }
    (node.content ?? []).forEach((c, i) => labels(c, [...path, i]));
  };
  labels(doc, []);
  return { segments, refs };
}

function at(root: TiptapNode, path: number[]): TiptapNode | undefined {
  let n: TiptapNode | undefined = root;
  for (const i of path) n = n?.content?.[i];
  return n;
}

/** Glossary rules on an answer: leftover source terms → their translation, and one spelling per term. */
export function applyGlossary(text: string, glossary: Record<string, string>): string {
  let out = text;
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  for (const zh of terms) {
    const en = glossary[zh];
    if (!en) continue;
    out = out.split(zh).join(en);
    // same term, different case ("Starnote", "STARNOTE") → the glossary's spelling
    const re = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, en);
  }
  return out;
}

/** The doc with every segment replaced by its translation (`translated[id]`); untranslated segments stay. */
export function applySegments(doc: TiptapDoc, refs: SegmentRef[], translated: Record<string, string>): TiptapDoc {
  const copy = structuredClone(doc) as TiptapDoc;
  for (const ref of refs) {
    const t = translated[ref.id];
    if (typeof t !== 'string' || !t.trim()) continue;
    const node = at(copy, ref.path);
    if (!node) continue;
    if (ref.kind === 'attr' && ref.attr) {
      node.attrs = { ...(node.attrs ?? {}), [ref.attr]: unescapeText(t.replace(/<[^>]+>/g, '')) };
      continue;
    }
    const inline = decodeInline(t, ref);
    node.content = inline ?? [{ type: 'text', text: unescapeText(t.replace(/<[^>]+>/g, '')) }];
  }
  return copy;
}

const SYSTEM = (mode: TranslateMode) =>
  [
    '[sn-translate]',
    'You translate a Chinese article into natural English, segment by segment.',
    mode === 'literal'
      ? 'mode: literal — stay close to the original wording and sentence order; do not add or drop content.'
      : 'mode: localized — write for English-speaking readers on Medium / DEV: idiomatic phrasing, explain China-specific references briefly, convert units and dates; keep every fact.',
    'Keep every inline tag exactly as given (<b> <i> <u> <s> <code> <a1> <m1> and self-closing <x1/>), wrapped around the matching translated words.',
    'Use the glossary for these terms. Do not translate code, URLs or product names not in the glossary.',
    'Answer with JSON only: {"segments":[{"id":"…","text":"…"}]} with every id.',
  ].join('\n');

/** Splits segments into requests of about `size` characters. */
export function batchSegments(segments: Segment[], size = 2400): Segment[][] {
  const out: Segment[][] = [];
  let cur: Segment[] = [];
  let n = 0;
  for (const s of segments) {
    if (cur.length && n + s.text.length > size) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(s);
    n += s.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface TranslateOptions {
  mode: TranslateMode;
  glossary?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
  /** Test seam: the AI call. */
  call?: typeof callFeature;
}

/** Translates the doc (AI `rewrite.translate`, one call per ~2400 characters). */
export async function translateDoc(doc: TiptapDoc, opts: TranslateOptions): Promise<{ doc: TiptapDoc; glossary: Record<string, string> }> {
  const glossary = { ...DEFAULT_GLOSSARY, ...(opts.glossary ?? {}) };
  const { segments, refs } = collectSegments(doc);
  const batches = batchSegments(segments);
  const call = opts.call ?? callFeature;
  const translated: Record<string, string> = {};
  let done = 0;
  opts.onProgress?.(0, batches.length);
  for (const batch of batches) {
    const used = Object.fromEntries(Object.entries(glossary).filter(([zh]) => batch.some((s) => s.text.includes(zh))));
    const answer = await call('rewrite.translate', {
      system: SYSTEM(opts.mode),
      user: JSON.stringify({ mode: opts.mode, glossary: used, segments: batch }),
      maxTokens: 4000,
      signal: opts.signal,
    });
    const parsed = parseJsonAnswer<{ segments?: Segment[] }>(answer);
    for (const s of parsed?.segments ?? []) {
      if (s && typeof s.id === 'string' && typeof s.text === 'string') translated[s.id] = applyGlossary(s.text, glossary);
    }
    done += 1;
    opts.onProgress?.(done, batches.length);
  }
  return { doc: applySegments(doc, refs, translated), glossary };
}

/** Characters the translation will send (for the estimate). */
export function translateChars(doc: TiptapDoc): number {
  return collectSegments(doc).segments.reduce((n, s) => n + s.text.length, 0);
}
