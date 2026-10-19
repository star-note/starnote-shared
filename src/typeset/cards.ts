import { kindOf, parseJsonObject, str, textOf, visibleLength } from './text';
import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * 配图建议 (feature `image.card`). Long stretches without a picture are found locally; for each one the model
 * either pulls structured data out of the text (流程 / 时间线 / 对比 / 要点清单 → an 信息图卡 we draw ourselves) or
 * picks one sentence for a 金句卡. No stock photos, no image generation service.
 */

export const CARD_MARKER = '[sn-card]';

/** A picture every 600–800 characters: past this many without one, a stretch gets a suggestion. */
export const GAP_CHARS = 700;
export const GAP_MIN = 600;

export interface ImageGap {
  /** First and last top-level block of the stretch; the picture goes in after `to`. */
  from: number;
  to: number;
  chars: number;
  /** The heading the stretch sits under, if any. */
  heading: string;
  /** Opening words of the stretch, for the list. */
  excerpt: string;
  /** Plain text of the stretch (what the model reads). */
  text: string;
}

const hasImage = (n: TiptapNode): boolean =>
  kindOf(n) === 'image' || (n.content ?? []).some((c) => c.type === 'image' || hasImage(c));

export function findImageGaps(doc: TiptapDoc, every = GAP_CHARS, min = GAP_MIN): ImageGap[] {
  const blocks = doc.content ?? [];
  const gaps: ImageGap[] = [];
  let start = 0;
  let chars = 0;
  let heading = '';
  let sectionHeading = '';
  const close = (to: number) => {
    const text = blocks
      .slice(start, to + 1)
      .filter((b) => b.type !== 'heading')
      .map((b) => textOf(b).trim())
      .filter(Boolean)
      .join('\n');
    gaps.push({ from: start, to, chars, heading: sectionHeading, excerpt: text.replace(/\s+/g, ' ').slice(0, 36), text: text.slice(0, 3000) });
  };
  blocks.forEach((b, i) => {
    if (b.type === 'heading') heading = textOf(b).trim();
    if (hasImage(b)) {
      start = i + 1;
      chars = 0;
      return;
    }
    if (chars === 0) sectionHeading = heading;
    chars += visibleLength(textOf(b));
    // don't put a picture right under a heading
    if (chars >= every && b.type !== 'heading') {
      close(i);
      start = i + 1;
      chars = 0;
    }
  });
  if (chars >= min) {
    let last = blocks.length - 1;
    while (last > start && blocks[last]?.type === 'heading') last--;
    close(last);
  }
  return gaps;
}

export type InfoKind = 'flow' | 'timeline' | 'compare' | 'list';
export const INFO_KIND_LABEL: Record<InfoKind, string> = { flow: '流程', timeline: '时间线', compare: '对比', list: '要点清单' };

export interface InfographicSpec {
  kind: InfoKind;
  title: string;
  items: { title: string; text: string }[];
  /** compare: the two sides and rows of [维度, 左, 右]. */
  columns?: [string, string];
  rows?: [string, string, string][];
  caption: string;
  alt: string;
}

export interface QuoteSpec {
  quote: string;
  caption: string;
  alt: string;
}

export function buildCardPrompt(kind: 'infographic' | 'quote', gap: ImageGap, title: string): { system: string; user: string } {
  const system =
    kind === 'infographic'
      ? [
          `${CARD_MARKER} 你是信息设计师。从给定文字里提炼结构化数据，用来画一张信息图卡。不编造原文没有的信息。只返回 JSON：`,
          '{"kind":"flow|timeline|compare|list","title":"图标题，不超过 16 字","items":[{"title":"不超过 12 字","text":"不超过 36 字"}],',
          '"columns":["对比左侧","对比右侧"],"rows":[["维度","左","右"]],"caption":"图片说明，不超过 30 字","alt":"给读屏软件的描述"}',
          'flow=步骤流程，timeline=时间先后，compare=两者对比（填 columns 与 rows），list=要点清单；items 3–6 条。',
        ].join('\n')
      : [
          `${CARD_MARKER} 你是公众号编辑。从给定文字里挑一句最值得做成金句卡的话，必须一字不差取自原文。只返回 JSON：`,
          '{"quote":"原句","caption":"图片说明，不超过 30 字","alt":"给读屏软件的描述"}',
        ].join('\n');
  const user = [`类型：${kind}`, `文章：${title || '无标题'}`, `小节：${gap.heading || '（无）'}`, '原文：', gap.text].join('\n');
  return { system, user };
}

export function parseInfographic(text: string): InfographicSpec | null {
  const d = parseJsonObject(text);
  if (!d) return null;
  const kind = (['flow', 'timeline', 'compare', 'list'] as const).find((k) => k === d.kind) ?? 'list';
  const items = Array.isArray(d.items)
    ? (d.items as Record<string, unknown>[])
        .map((x) => ({ title: str(x?.title, 24), text: str(x?.text, 80) }))
        .filter((x) => x.title || x.text)
        .slice(0, 6)
    : [];
  const columns =
    Array.isArray(d.columns) && d.columns.length === 2 ? ([str(d.columns[0], 16), str(d.columns[1], 16)] as [string, string]) : undefined;
  const rows = Array.isArray(d.rows)
    ? (d.rows as unknown[])
        .filter((r): r is unknown[] => Array.isArray(r) && r.length === 3)
        .map((r) => [str(r[0], 16), str(r[1], 40), str(r[2], 40)] as [string, string, string])
        .slice(0, 6)
    : undefined;
  if (kind === 'compare' ? !(columns && rows?.length) : items.length < 2) {
    if (items.length < 2) return null;
    return { kind: 'list', title: str(d.title, 24) || '要点速览', items, caption: str(d.caption, 60), alt: str(d.alt, 160) };
  }
  return { kind, title: str(d.title, 24) || '要点速览', items, columns, rows, caption: str(d.caption, 60), alt: str(d.alt, 160) };
}

/** The quote must be the author's own sentence. */
export function parseQuote(text: string, source: string): QuoteSpec | null {
  const d = parseJsonObject(text);
  const quote = typeof d?.quote === 'string' ? d.quote.trim() : '';
  if (!quote || quote.length > 80 || !source.replace(/\s+/g, '').includes(quote.replace(/\s+/g, ''))) return null;
  return { quote, caption: str(d?.caption, 60), alt: str(d?.alt, 160) || quote };
}

/** The image block a card goes in as: full width on phones, with a caption and alt text. */
export function cardImageNode(src: string, caption: string, alt: string): TiptapNode {
  return { type: 'imageBlock', attrs: { src, alt, caption: caption || null, width: '100%', align: 'center' } };
}
