import type { TiptapDoc, TiptapNode } from '../../api/types';
import type { XhsCard } from '../../api/versions';
import { sentences, textOf } from '../../typeset/text';
import { type DocSection, rankKeywords } from '../keywords';
import { clip, newCardId } from './split';

/**
 * 配图建议's own pictures (CONTRACTS-r9 §0 配图来源: 信息图卡 / 金句卡): a section of the article as a card painted with
 * the 小红书 templates at an inline size. 信息图卡 = the heading plus the section's list (or its key sentences);
 * 金句卡 = the line most worth quoting (a block quote, a bold sentence, a 「」/！ line, else the densest short one).
 */

const isList = (n: TiptapNode) => n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'taskList';

function sectionBlocks(doc: TiptapDoc | null | undefined, s: Pick<DocSection, 'start' | 'end' | 'heading'>): TiptapNode[] {
  const blocks = (doc?.content ?? []).slice(s.start, s.end);
  return s.heading && blocks[0]?.type === 'heading' ? blocks.slice(1) : blocks;
}

function boldText(n: TiptapNode): string[] {
  const out: string[] = [];
  const walk = (x: TiptapNode) => {
    if (x.type === 'text' && (x.marks ?? []).some((m) => m.type === 'bold' || m.type === 'strong')) out.push(x.text ?? '');
    (x.content ?? []).forEach(walk);
  };
  walk(n);
  return out.map((t) => t.trim()).filter((t) => Array.from(t).length >= 6 && Array.from(t).length <= 60);
}

/** The section's best line to quote. */
export function pickQuote(doc: TiptapDoc | null | undefined, s: DocSection, title = ''): string {
  const blocks = sectionBlocks(doc, s);
  const bq = blocks.find((b) => b.type === 'blockquote' && textOf(b).trim());
  if (bq) return clip(textOf(bq), 60);
  const bold = blocks.flatMap(boldText)[0];
  if (bold) return clip(bold, 60);
  const kws = rankKeywords(s.text, { title, minCount: 2 })
    .slice(0, 6)
    .map((k) => k.word);
  const ss = sentences(s.text.replace(/\s+/g, ' ')).map((x) => x.text);
  const scored = ss
    .map((t, i) => {
      const len = Array.from(t).length;
      let sc = 0;
      if (len >= 8 && len <= 40) sc += 1;
      if (/[「」『』“”]/.test(t)) sc += 1;
      if (/[！!]$/.test(t)) sc += 1;
      sc += 0.5 * kws.filter((k) => t.includes(k)).length;
      return { t, sc: sc - i * 0.01 };
    })
    .sort((a, b) => b.sc - a.sc);
  return clip(scored[0]?.t ?? s.text, 60);
}

/** 信息图卡 for a section: its list as points, else its first sentences under the heading. */
export function infoCard(doc: TiptapDoc | null | undefined, s: DocSection, template: string, newId = newCardId): XhsCard {
  const blocks = sectionBlocks(doc, s);
  const list = blocks.find(isList);
  const heading = clip(s.heading || '划重点', 24);
  const items = list
    ? (list.content ?? []).map((li) => clip(textOf((li.content ?? [])[0] ?? li), 36)).filter(Boolean)
    : [];
  if (items.length >= 2) return { id: newId(), kind: 'points', template, title: heading, items: items.slice(0, 5) };
  // no list: up to four short sentences read as points; otherwise one section card
  const ss = sentences(s.text.replace(/\s+/g, ' '))
    .map((x) => x.text)
    .filter((t) => Array.from(t).length <= 36);
  if (ss.length >= 3) return { id: newId(), kind: 'points', template, title: heading, items: ss.slice(0, 4).map((t) => clip(t, 36)) };
  return { id: newId(), kind: 'section', template, title: heading, body: clip(s.text, 110) };
}

/** 金句卡 for a section (the heading is the attribution line). */
export function quoteCard(doc: TiptapDoc | null | undefined, s: DocSection, template: string, newId = newCardId, title = ''): XhsCard {
  return { id: newId(), kind: 'quote', template, title: s.heading ? clip(s.heading, 24) : '', body: pickQuote(doc, s, title) };
}
