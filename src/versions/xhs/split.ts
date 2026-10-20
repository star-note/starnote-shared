import type { TiptapDoc, TiptapNode } from '../../api/types';
import type { XhsCard, XhsCardKind } from '../../api/versions';
import { sentences, textOf } from '../../typeset/text';
import { extractKeywords, rankKeywords } from '../keywords';

/**
 * 小红书拆卡, rules only (CONTRACTS-r9 §0: free, no AI). A note becomes 6–9 cards of 3:4:
 *   1 封面 (title + a subtitle from the first paragraph)
 *   要点卡 from lists (4–5 items a card), 小节卡 from h2/h3 (heading + its first 1–2 sentences),
 *   金句卡 from block quotes, bold sentences and short punchy lines (「」/！, or dense in the note's keywords),
 *   1 结尾卡 (a summary and a 收藏 / 关注 prompt).
 * Candidates are scored, the best kept up to the 9-card cap, then put back in reading order; a short note is padded
 * with cards cut from its longest paragraphs so it still reaches 6 when it has the text for it.
 */

export const XHS_MIN_CARDS = 6;
export const XHS_MAX_CARDS = 9;
export const DEFAULT_XHS_TEMPLATE = 'cream';

export const ENDING_PROMPTS = ['收藏这篇，用的时候翻出来', '关注我，下次更新不错过'];

export interface SplitOptions {
  /** Template key every card starts with. */
  template?: string;
  minCards?: number;
  maxCards?: number;
  /** Card id factory (tests pass a counter). */
  newId?: () => string;
}

interface Candidate {
  kind: Exclude<XhsCardKind, 'cover' | 'ending'>;
  title: string;
  body?: string;
  items?: string[];
  /** Top-level block index it came from: the final order. */
  pos: number;
  score: number;
  /** Dedupe key. */
  key: string;
}

let seq = 0;
export function newCardId(): string {
  seq = (seq + 1) % 1e6;
  return `c${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** At most `max` characters, cut at a clause end when one is near, else with 「…」. */
export function clip(text: string, max: number): string {
  const chars = Array.from(clean(text));
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, max).join('');
  const cut = Math.max(...['。', '！', '？', '；', '!', '?', ';'].map((p) => head.lastIndexOf(p)));
  if (cut >= max * 0.6) return head.slice(0, cut + 1);
  const comma = Math.max(head.lastIndexOf('，'), head.lastIndexOf(','), head.lastIndexOf('、'));
  if (comma >= max * 0.6) return `${head.slice(0, comma)}…`;
  return `${chars.slice(0, max - 1).join('')}…`;
}

/** The first `n` sentences, kept under `max` characters. */
function lead(text: string, n: number, max: number): string {
  const ss = sentences(clean(text)).slice(0, n);
  let out = '';
  for (const s of ss) {
    if (out && Array.from(out + s.text).length > max) break;
    out += s.text;
  }
  return clip(out || text, max);
}

const isHeading = (n: TiptapNode | undefined, max = 3) =>
  n?.type === 'heading' && Number(n.attrs?.level ?? 2) <= max;
const isList = (n: TiptapNode) => n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'taskList';

function listItems(list: TiptapNode): string[] {
  return (list.content ?? [])
    .map((li) => {
      const first = (li.content ?? []).find((c) => c.type === 'paragraph') ?? li;
      return clip(textOf(first), 40);
    })
    .filter(Boolean);
}

/** Runs of bold text inside a paragraph (consecutive bold text nodes joined). */
function boldRuns(p: TiptapNode): string[] {
  const out: string[] = [];
  let run = '';
  for (const n of p.content ?? []) {
    const bold = n.type === 'text' && (n.marks ?? []).some((m) => m.type === 'bold' || m.type === 'strong');
    if (bold) run += n.text ?? '';
    else {
      if (run) out.push(run);
      run = '';
    }
  }
  if (run) out.push(run);
  return out.map(clean).filter((t) => t.length >= 6 && t.length <= 60);
}

const SUMMARY_HEAD = /总结|结语|小结|结论|写在最后|最后|尾声|一句话/;

/** `「…」` / `！` lines, or lines that carry several of the note's keywords: what reads as a 金句. */
function punchScore(s: string, keywords: string[]): number {
  const len = Array.from(s).length;
  if (len < 8 || len > 40) return 0;
  let sc = 0;
  if (/[「」『』“”]/.test(s)) sc += 1;
  if (/[！!]$/.test(s)) sc += 1;
  const hits = keywords.filter((k) => s.includes(k)).length;
  if (hits >= 2) sc += 0.6 * hits;
  return sc;
}

export function splitXhsCards(doc: TiptapDoc | null | undefined, title: string, opts: SplitOptions = {}): XhsCard[] {
  const template = opts.template ?? DEFAULT_XHS_TEMPLATE;
  const min = opts.minCards ?? XHS_MIN_CARDS;
  const max = Math.max(3, opts.maxCards ?? XHS_MAX_CARDS);
  const newId = opts.newId ?? newCardId;
  const blocks = (doc?.content ?? []).filter((b) => b.type !== 'paragraph' || textOf(b).trim() || (b.content ?? []).length);
  const allText = blocks.map((b) => textOf(b)).join('\n');
  // only words the note actually repeats make a line 「dense」: in a short note every gram is a keyword
  const keywords = rankKeywords(allText, { title, minCount: 2 })
    .slice(0, 8)
    .map((k) => k.word);

  const card = (kind: XhsCardKind, c: { title: string; body?: string; items?: string[] }): XhsCard => ({
    id: newId(),
    kind,
    template,
    title: c.title,
    ...(c.body ? { body: c.body } : {}),
    ...(c.items?.length ? { items: c.items } : {}),
  });

  // ---- cover
  const firstPara = blocks.find((b) => b.type === 'paragraph' && textOf(b).trim());
  const firstHeading = blocks.find((b) => isHeading(b, 6));
  const coverTitle = clip(title.trim() || (firstHeading ? textOf(firstHeading) : '') || '无标题', 30);
  const subtitle = firstPara ? lead(textOf(firstPara), 1, 40) : '';
  const usedParas = new Set<TiptapNode>();
  if (firstPara) usedParas.add(firstPara);

  // ---- sections: a heading owns the blocks up to the next heading of level ≤ 3
  interface Section {
    pos: number;
    heading: string;
    body: TiptapNode[];
  }
  const sections: Section[] = [];
  let current: Section | null = null;
  const loose: { node: TiptapNode; pos: number; prev?: TiptapNode }[] = [];
  blocks.forEach((b, i) => {
    if (isHeading(b)) {
      current = { pos: i, heading: clean(textOf(b)), body: [] };
      sections.push(current);
      return;
    }
    if (current) current.body.push(b);
    else loose.push({ node: b, pos: i, prev: blocks[i - 1] });
  });

  // the ending: a 总结 section, else the last paragraph
  const summarySection = [...sections].reverse().find((s) => SUMMARY_HEAD.test(s.heading));
  const paragraphs = blocks.filter((b) => b.type === 'paragraph' && textOf(b).trim());
  const lastPara = paragraphs[paragraphs.length - 1];
  let summary = '';
  const summaryPara = summarySection
    ? summarySection.body.find((b) => b.type === 'paragraph' && textOf(b).trim())
    : lastPara !== firstPara
      ? lastPara
      : undefined;
  if (summaryPara) {
    summary = lead(textOf(summaryPara), 2, 80);
    usedParas.add(summaryPara);
  }

  const candidates: Candidate[] = [];
  const add = (c: Candidate) => {
    if (!candidates.some((o) => o.key === c.key)) candidates.push(c);
  };

  const pointsFrom = (items: string[], heading: string, pos: number) => {
    // 4–5 items a card; 6 → 3 + 3, 7 → 4 + 3, 9 → 5 + 4
    const n = Math.ceil(items.length / 5);
    const per = Math.ceil(items.length / n);
    for (let k = 0; k < n; k++) {
      const chunk = items.slice(k * per, (k + 1) * per);
      if (!chunk.length) continue;
      add({
        kind: 'points',
        title: clip(n > 1 && k > 0 ? `${heading}（续）` : heading, 24),
        items: chunk,
        pos: pos + k * 0.01,
        score: 4 - k * 0.5,
        key: `pts|${pos}|${k}`,
      });
    }
  };

  const sectionCount = sections.filter((s) => s !== summarySection).length;
  for (const s of sections) {
    if (s === summarySection) continue;
    const paras = s.body.filter((b) => b.type === 'paragraph' && textOf(b).trim());
    const lists = s.body.filter(isList);
    const p = paras[0];
    // 「下面这几个方法：」 only introduces the list: the points card says it better
    const intro = Boolean(p && lists.length && /[：:]\s*$/.test(textOf(p)) && Array.from(textOf(p).trim()).length <= 40);
    if (p && !intro) {
      add({
        kind: 'section',
        title: clip(s.heading, 24),
        body: lead(textOf(p), 2, 110),
        pos: s.pos,
        // many sections: each one matters less than the overview card below
        score: sectionCount > 5 ? 2 : 3,
        key: `sec|${s.pos}`,
      });
      usedParas.add(p);
    }
    for (const list of lists) {
      const items = listItems(list);
      if (items.length >= 2) pointsFrom(items, s.heading, blocks.indexOf(list));
    }
    for (const b of s.body) if (b.type === 'blockquote') addQuote(b, blocks.indexOf(b), s.heading);
  }

  // an article with many sections gets one 「这篇讲了」 overview of its headings
  if (sectionCount > 5) {
    const heads = sections.filter((s) => s !== summarySection).map((s) => clip(s.heading, 24));
    add({
      kind: 'points',
      title: '这篇讲了这些',
      items: heads.slice(0, 5),
      pos: sections[0]!.pos - 0.5,
      score: 4.5,
      key: 'overview',
    });
  }

  for (const { node, pos, prev } of loose) {
    if (isList(node)) {
      const items = listItems(node);
      if (items.length < 2) continue;
      const intro = prev && prev.type === 'paragraph' ? clean(textOf(prev)) : '';
      const heading = /[：:]$/.test(intro) && Array.from(intro).length <= 26 ? intro.replace(/[：:]$/, '') : '划重点';
      pointsFrom(items, heading, pos);
    } else if (node.type === 'blockquote') addQuote(node, pos, '');
  }

  function addQuote(node: TiptapNode, pos: number, heading: string) {
    const text = clean(textOf(node));
    if (Array.from(text).length < 6) return;
    add({ kind: 'quote', title: heading ? clip(heading, 24) : '', body: lead(text, 2, 90), pos, score: 3.5, key: `q|${text.slice(0, 20)}` });
  }

  // bold sentences and punchy lines from every paragraph the cover / ending haven't used
  blocks.forEach((b, i) => {
    if (b.type !== 'paragraph' || b === firstPara || b === summaryPara) return;
    for (const run of boldRuns(b))
      add({ kind: 'quote', title: '', body: clip(run, 60), pos: i, score: 2.6, key: `q|${run.slice(0, 20)}` });
    for (const s of sentences(clean(textOf(b)))) {
      const sc = punchScore(s.text, keywords);
      if (sc >= 1) add({ kind: 'quote', title: '', body: s.text, pos: i, score: 1.2 + sc, key: `q|${s.text.slice(0, 20)}` });
    }
  });

  // ---- pick: best first, quotes capped at three, then back into reading order
  const budget = max - 2;
  const picked: Candidate[] = [];
  let quotes = 0;
  for (const c of [...candidates].sort((a, b) => b.score - a.score || a.pos - b.pos)) {
    if (picked.length >= budget) break;
    if (c.kind === 'quote') {
      if (quotes >= 3) continue;
      // two quotes taken from the same paragraph say the same thing
      if (picked.some((p) => p.kind === 'quote' && Math.floor(p.pos) === Math.floor(c.pos))) continue;
      quotes++;
    }
    picked.push(c);
  }

  // ---- pad a short note with cards cut from its longest unused paragraphs
  if (picked.length < min - 2) {
    const spare = blocks
      .map((b, pos) => ({ b, pos }))
      .filter(
        ({ b, pos }) =>
          b.type === 'paragraph' &&
          !usedParas.has(b) &&
          // a quote already speaks for this paragraph
          !picked.some((c) => Math.floor(c.pos) === pos) &&
          Array.from(textOf(b).trim()).length >= 30,
      )
      .sort((a, b) => textOf(b.b).length - textOf(a.b).length);
    for (const { b, pos } of spare) {
      if (picked.length >= min - 2) break;
      const ss = sentences(clean(textOf(b)));
      const head = ss[0]?.text ?? '';
      const short = Array.from(head).length <= 20;
      const rest = short ? ss.slice(1).map((s) => s.text).join('') : ss.map((s) => s.text).join('');
      const kw = extractKeywords(textOf(b), { title, limit: 1 })[0];
      picked.push({
        kind: 'section',
        title: short ? head.replace(/[。！？!?；;]+$/, '') : kw ? kw : clip(head, 16),
        body: clip(rest || head, 110),
        pos,
        score: 1,
        key: `pad|${pos}`,
      });
      usedParas.add(b);
    }
  }
  picked.sort((a, b) => a.pos - b.pos);

  const out: XhsCard[] = [card('cover', { title: coverTitle, body: subtitle })];
  for (const c of picked) out.push(card(c.kind, c));
  out.push(
    card('ending', {
      title: summarySection ? clip(summarySection.heading, 24) : '写在最后',
      body: summary || (subtitle ? subtitle : clip(coverTitle, 40)),
      items: ENDING_PROMPTS,
    }),
  );
  return out.slice(0, Math.max(max, 2));
}

/** A new blank card of `kind` (the editor's 添加卡片). */
export function blankCard(kind: XhsCardKind, template = DEFAULT_XHS_TEMPLATE, newId: () => string = newCardId): XhsCard {
  const base = { id: newId(), kind, template };
  switch (kind) {
    case 'cover':
      return { ...base, title: '标题', body: '一句话说清这篇讲什么' };
    case 'points':
      return { ...base, title: '划重点', items: ['第一点', '第二点', '第三点'] };
    case 'quote':
      return { ...base, title: '', body: '把最想让人记住的一句话放在这里' };
    case 'ending':
      return { ...base, title: '写在最后', body: '一句话总结', items: ENDING_PROMPTS };
    default:
      return { ...base, title: '小标题', body: '这一页想说的话' };
  }
}

export const XHS_KIND_LABELS: Record<XhsCardKind, string> = {
  cover: '封面',
  points: '要点',
  section: '小节',
  quote: '金句',
  ending: '结尾',
};
