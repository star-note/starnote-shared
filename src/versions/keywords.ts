import type { TiptapDoc, TiptapNode } from '../api/types';
import { kindOf, textOf } from '../typeset/text';

/**
 * Local keyword extraction for 配图建议 and 小红书话题 (CONTRACTS-r9 §0: 本地词频 + 标题权重, AI only when this finds
 * nothing). Chinese has no spaces, so candidates are CJK 2–4-grams that neither start nor end on a function word;
 * a gram is dropped when a longer gram containing it is (almost) as frequent — 「机器学」「器学习」 fold into 「机器学习」.
 * English words are counted case-insensitively with a stopword list. Words that also occur in the title weigh triple.
 */

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const LATIN_WORD = /[A-Za-z][A-Za-z0-9+#]*(?:[.-][A-Za-z0-9+#]+)*/g;

/** Characters a keyword never starts or ends with (particles, pronouns, linking verbs, measure words…). */
const EDGE_STOP = new Set(
  Array.from(
    '的了是在和与也就都而及或被把这那我你他她它们个不为以于之其很更还又让给对从到将会要能可得地着过吗呢吧啊但并所因此些么怎样每该已没只再才若即却既则向往随并且如其各等你您咱啥哪谁么呀哦嘛哈嗯一两几多些该',
  ),
);

/** Characters that never sit inside a keyword. */
const INNER_STOP = new Set(Array.from('的了是在和与也都就不把被很到'));
/** Clock times and counts (「点半」「七点」「三十」) are not what a picture is about. */
const NUMERIC = /^[〇零一二三四五六七八九十百千万两几半点个号时分秒年月日]+$/;

/** Whole grams that are never keywords even though their edges pass. */
const GRAM_STOP = new Set([
  '一个', '一些', '一种', '一样', '一下', '一起', '一直', '一定', '一般', '一次', '一点', '一篇', '一边',
  '没有', '什么', '可以', '因为', '所以', '但是', '如果', '就是', '自己', '已经', '还是', '不是', '这样',
  '那么', '时候', '我们', '你们', '他们', '大家', '今天', '现在', '其实', '然后', '虽然', '而且', '以及',
  '通过', '进行', '需要', '应该', '可能', '这种', '那种', '这些', '那些', '怎么', '为什么', '比如', '例如',
  '同时', '之后', '之前', '以后', '以前', '当然', '只是', '不过', '非常', '真的', '觉得', '知道', '东西',
  '问题', '方面', '情况', '部分', '地方', '本文', '文章', '内容', '下面', '上面', '以下', '如下', '第一',
  '第二', '第三', '最后', '首先', '其次', '总之', '总结', '另外', '还有', '甚至', '开始', '结束', '出来',
  '起来', '下来', '上来', '东东', '有点', '有些', '特别', '直接', '主要', '重要', '不同', '相同', '使用',
]);

const EN_STOP = new Set(
  'a an and are as at be been but by can could did do does for from had has have how i if in into is it its just like more most my no not of on one or our out so some such than that the their them then there these they this those to too up us use used using very was we were what when where which while who why will with would you your yours about after all also any because before being both each few get got here him his her its me much must new now off only other over own same she should since still through under until upon well'.split(
    ' ',
  ),
);

export interface Keyword {
  word: string;
  score: number;
  count: number;
}

export interface ExtractOptions {
  title?: string;
  /** How many to return (default 8). */
  limit?: number;
  /** Minimum count for a word that is not in the title (default: 2, or 1 for short text). */
  minCount?: number;
}

function cjkGrams(text: string, counts: Map<string, number>) {
  for (const run of text.match(CJK_RUN) ?? []) {
    const chars = Array.from(run);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= chars.length; i++) {
        const g = chars.slice(i, i + n);
        if (EDGE_STOP.has(g[0]!) || EDGE_STOP.has(g[n - 1]!)) continue;
        // 「己的时间」「起不是目」: a particle inside a gram means it spans two words
        if (n > 2 && g.slice(1, -1).some((c) => INNER_STOP.has(c))) continue;
        if (NUMERIC.test(g.join(''))) continue;
        const w = g.join('');
        if (GRAM_STOP.has(w)) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
}

function latinWords(text: string, counts: Map<string, number>, forms: Map<string, Map<string, number>>) {
  for (const raw of text.match(LATIN_WORD) ?? []) {
    const key = raw.toLowerCase();
    const acronym = /^[A-Z0-9+#]{2,}$/.test(raw);
    if (EN_STOP.has(key)) continue;
    if (!acronym && key.length < 3) continue;
    if (/^\d+$/.test(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const f = forms.get(key) ?? new Map<string, number>();
    f.set(raw, (f.get(raw) ?? 0) + 1);
    forms.set(key, f);
  }
}

/** Ranked keywords of `text` (`title` boosts the words it shares and may contribute words of its own). */
export function rankKeywords(text: string, opts: ExtractOptions = {}): Keyword[] {
  const title = (opts.title ?? '').trim();
  // a long note says what it is about early on: 20k characters is plenty and keeps this instant
  const body = `${title}\n${text.slice(0, 20000)}`;
  const visible = body.replace(/\s+/g, '').length;
  const minCount = opts.minCount ?? (visible < 400 ? 1 : 2);

  const counts = new Map<string, number>();
  cjkGrams(body, counts);
  const latin = new Map<string, number>();
  const forms = new Map<string, Map<string, number>>();
  latinWords(body, latin, forms);

  // the most frequent one-character extension of each gram (「机器」→「机器学」→「机器学习」)
  const maxExt = new Map<string, number>();
  for (const [w, c] of counts) {
    const chars = Array.from(w);
    if (chars.length < 3) continue;
    for (const part of [chars.slice(1).join(''), chars.slice(0, -1).join('')])
      maxExt.set(part, Math.max(maxExt.get(part) ?? 0, c));
  }

  const titleLower = title.toLowerCase();
  const out: Keyword[] = [];
  for (const [w, c] of counts) {
    // subsumed: a longer gram containing this one is nearly as frequent
    const len = Array.from(w).length;
    if ((maxExt.get(w) ?? 0) >= c * 0.75) continue;
    const inTitle = Boolean(title) && title.includes(w);
    if (c < minCount && !inTitle) continue;
    const score = c * (1 + 0.3 * (len - 2)) * (inTitle ? 3 : 1);
    out.push({ word: w, score, count: c });
  }
  for (const [k, c] of latin) {
    const inTitle = Boolean(titleLower) && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}\\b`).test(titleLower);
    if (c < minCount && !inTitle) continue;
    const form = [...(forms.get(k) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;
    out.push({ word: form, score: c * 1.2 * (inTitle ? 3 : 1), count: c });
  }
  out.sort((a, b) => b.score - a.score || b.word.length - a.word.length || a.word.localeCompare(b.word));
  // never two overlapping CJK picks: 「学习方法」 and 「学习」 both chosen would read as a duplicate
  const picked: Keyword[] = [];
  for (const k of out) {
    if (picked.some((p) => p.word.includes(k.word) || k.word.includes(p.word))) continue;
    picked.push(k);
  }
  return picked;
}

/** The top keywords of `text`, words only. */
export function extractKeywords(text: string, opts: ExtractOptions = {}): string[] {
  return rankKeywords(text, opts)
    .slice(0, opts.limit ?? 8)
    .map((k) => k.word);
}

/**
 * Keywords for one part of a note (a section, a card): the note's own keywords that this part mentions come first
 * (a short stretch has too little text for its counts to mean much), then words the part itself repeats.
 */
export function partKeywords(
  partText: string,
  note: { text: string; title?: string } | string[],
  opts: { limit?: number } = {},
): string[] {
  const noteWords = Array.isArray(note) ? note : extractKeywords(note.text, { title: note.title, limit: 12 });
  const title = Array.isArray(note) ? undefined : note.title;
  const own = noteWords.filter((k) => partText.includes(k));
  const local = extractKeywords(partText, { title, minCount: 2, limit: 6 });
  const out: string[] = [];
  for (const w of [...own, ...local]) {
    if (out.some((o) => o.includes(w) || w.includes(o))) continue;
    out.push(w);
  }
  return out.slice(0, opts.limit ?? 5);
}

/* ------------------------------------------------------------------ sections */

const IMAGE_TYPES = new Set(['image', 'imageBlock', 'imageGif', 'figure']);

/** The node or anything inside it is a picture. */
export function hasImage(node: TiptapNode): boolean {
  if (IMAGE_TYPES.has(node.type ?? '') || kindOf(node) === 'image') return true;
  return (node.content ?? []).some(hasImage);
}

/** Every picture `src` in the note, in order, without duplicates. */
export function docImages(doc: TiptapDoc | null | undefined): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  const walk = (n: TiptapNode) => {
    if (IMAGE_TYPES.has(n.type ?? '') || kindOf(n) === 'image') {
      const src = typeof n.attrs?.src === 'string' ? n.attrs.src : '';
      if (src && !seen.has(src)) {
        seen.add(src);
        out.push({ src, alt: typeof n.attrs?.alt === 'string' ? n.attrs.alt : '' });
      }
    }
    (n.content ?? []).forEach(walk);
  };
  (doc?.content ?? []).forEach(walk);
  return out;
}

export interface DocSection {
  /** Ordinal of the section (0 = what comes before the first h2, when there is any). */
  index: number;
  /** The h2 text; '' for the opening stretch. */
  heading: string;
  text: string;
  /** Top-level block range `[start, end)`; `start` is the h2 itself (or 0). */
  start: number;
  end: number;
  /** Top-level index where a picture fits: right after the section's first paragraph (or after its heading). */
  insertAt: number;
  hasImage: boolean;
}

/** The note cut at every h2 (an h1 counts as a cut too). */
export function docSections(doc: TiptapDoc | null | undefined): DocSection[] {
  const blocks = doc?.content ?? [];
  const cuts: number[] = [];
  blocks.forEach((b, i) => {
    if (b.type === 'heading' && Number(b.attrs?.level ?? 2) <= 2) cuts.push(i);
  });
  const starts = cuts[0] === 0 ? cuts : [0, ...cuts];
  const out: DocSection[] = [];
  starts.forEach((start, k) => {
    const end = starts[k + 1] ?? blocks.length;
    const head = blocks[start];
    const isHead = head?.type === 'heading' && cuts.includes(start);
    const body = blocks.slice(isHead ? start + 1 : start, end);
    const text = body
      .map((b) => textOf(b).trim())
      .filter(Boolean)
      .join('\n');
    const firstPara = body.findIndex((b) => b.type === 'paragraph' && textOf(b).trim());
    const insertAt = firstPara >= 0 ? (isHead ? start + 1 : start) + firstPara + 1 : isHead ? start + 1 : start;
    out.push({
      index: out.length,
      heading: isHead ? textOf(head).trim() : '',
      text,
      start,
      end,
      insertAt: Math.min(insertAt, end),
      hasImage: blocks.slice(start, end).some(hasImage),
    });
  });
  return out.filter((s) => s.heading || s.text);
}

/** Sections with at least `minChars` visible characters and no picture: where 配图建议 looks. */
export function sectionsMissingImages(
  doc: TiptapDoc | null | undefined,
  opts: { minChars?: number } = {},
): DocSection[] {
  const min = opts.minChars ?? 160;
  return docSections(doc).filter((s) => !s.hasImage && s.text.replace(/\s+/g, '').length >= min);
}

/** Plain text of the whole note, one block per line. */
export function docPlainText(doc: TiptapDoc | null | undefined): string {
  return (doc?.content ?? [])
    .map((b) => textOf(b).trim())
    .filter(Boolean)
    .join('\n');
}
