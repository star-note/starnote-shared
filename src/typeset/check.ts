import { LEAF, parseJsonObject, str, visibleLength } from './text';
import { LONG_PARAGRAPH, planSplit } from './tidy';

/**
 * 发布前「排版体检」(feature `check.typeset`). Rules run here, on the editor's document, with no network:
 * 中英文之间的空格、全角半角标点、图片说明、长段落、长区段没有小标题、链接格式 (format only — no request is ever
 * made to the link). The model only does what rules can't: 错别字 and 术语前后不一致; its answer is a list of
 * words, located in the text here, so every issue carries fresh positions and a fix the editor can apply.
 */

export const CHECK_MARKER = '[sn-check]';
export const LONG_SECTION = 800;

export type IssueKind = 'typo' | 'term' | 'spacing' | 'punct' | 'caption' | 'section' | 'paragraph' | 'link';

export const ISSUE_LABEL: Record<IssueKind, string> = {
  typo: '错别字',
  term: '术语不一致',
  spacing: '中英文空格',
  punct: '全角半角标点',
  caption: '图片缺说明',
  section: '长区段没有小标题',
  paragraph: '段落过长',
  link: '链接格式',
};

/** The rule-based kinds (work without AI). */
export const RULE_KINDS: IssueKind[] = ['spacing', 'punct', 'caption', 'section', 'paragraph', 'link'];
export const AI_KINDS: IssueKind[] = ['typo', 'term'];

export type Fix =
  | { type: 'text'; from: number; to: number; insert: string }
  | { type: 'caption'; pos: number; caption: string }
  | { type: 'split'; pos: number; offsets: number[] }
  | { type: 'link'; from: number; to: number; href: string };

export interface Issue {
  id: string;
  kind: IssueKind;
  message: string;
  /** A few words around the spot. */
  excerpt: string;
  /** Where 定位 goes. */
  from: number;
  to: number;
  fix?: Fix;
}

/** The parts of a document the rules need; `scanDoc` builds it from a ProseMirror node. */
export interface TextBlockScan {
  /** Position of the textblock node; its text starts at `pos + 1`. */
  pos: number;
  /** Text with inline leaves as `￼`, so offset k is at `pos + 1 + k`. */
  text: string;
  type: string;
  /** Top-level block index. */
  top: number;
  code: [number, number][];
  links: { from: number; to: number; href: string }[];
}
export interface ImageScan {
  pos: number;
  caption: string;
  alt: string;
  src: string;
}
export interface DocScan {
  blocks: TextBlockScan[];
  images: ImageScan[];
}

/** Minimal ProseMirror node surface (so this module needs no prosemirror import). */
export interface PMLike {
  type: { name: string };
  attrs: Record<string, unknown>;
  isText?: boolean;
  isTextblock?: boolean;
  isLeaf?: boolean;
  text?: string | null;
  nodeSize: number;
  marks?: { type: { name: string }; attrs: Record<string, unknown> }[];
  forEach(fn: (child: PMLike, offset: number, index: number) => void): void;
  descendants?(fn: (node: PMLike, pos: number) => boolean | void): void;
}

export function scanDoc(doc: PMLike): DocScan {
  const blocks: TextBlockScan[] = [];
  const images: ImageScan[] = [];
  let top = -1;
  doc.forEach((child, offset, index) => {
    top = index;
    visit(child, offset);
  });
  function visit(node: PMLike, pos: number) {
    const name = node.type.name;
    if (name === 'image' || name === 'imageBlock') {
      images.push({ pos, caption: String(node.attrs.caption ?? ''), alt: String(node.attrs.alt ?? ''), src: String(node.attrs.src ?? '') });
      return;
    }
    if (node.isTextblock) {
      let text = '';
      const code: [number, number][] = [];
      const links: { from: number; to: number; href: string }[] = [];
      node.forEach((c) => {
        const piece = c.isText ? (c.text ?? '') : LEAF;
        const from = text.length;
        text += piece;
        for (const m of c.marks ?? []) {
          if (m.type.name === 'code') code.push([from, text.length]);
          if (m.type.name === 'link') {
            const last = links[links.length - 1];
            const href = String(m.attrs.href ?? '');
            if (last && last.to === from && last.href === href) last.to = text.length;
            else links.push({ from, to: text.length, href });
          }
        }
      });
      blocks.push({ pos, text, type: name, top, code: name === 'codeBlock' ? [[0, text.length]] : code, links });
      return;
    }
    node.forEach((c, offset) => visit(c, pos + 1 + offset));
  }
  return { blocks, images };
}

const CJK = /[㐀-䶿一-鿿豈-﫿]/;
const isCJK = (ch: string | undefined) => Boolean(ch && CJK.test(ch));
const FULL: Record<string, string> = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };
const HALF: Record<string, string> = { '，': ',', '；': ';', '：': ':', '？': '?', '！': '!' };

const inRanges = (k: number, ranges: [number, number][]) => ranges.some(([a, b]) => k >= a && k < b);

function excerpt(text: string, from: number, to: number): string {
  const a = Math.max(0, from - 8);
  const b = Math.min(text.length, to + 8);
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(LEAF, '').replace(/\s+/g, ' ')}${b < text.length ? '…' : ''}`;
}

/** 中英文之间的空格 and 全角半角标点 on one textblock. Offsets are in `b.text`. */
export function textRules(b: TextBlockScan): Issue[] {
  const t = b.text;
  const skip: [number, number][] = [...b.code, ...b.links.map((l) => [l.from, l.to] as [number, number])];
  const out: Issue[] = [];
  const at = (k: number) => b.pos + 1 + k;
  const add = (kind: IssueKind, from: number, to: number, insert: string, message: string) =>
    out.push({ id: `${kind}:${at(from)}:${insert}`, kind, message, excerpt: excerpt(t, from, to), from: at(from), to: at(to), fix: { type: 'text', from: at(from), to: at(to), insert } });
  if (b.type === 'codeBlock') return out;

  for (let k = 1; k < t.length; k++) {
    const a = t[k - 1]!;
    const c = t[k]!;
    if (inRanges(k, skip) || inRanges(k - 1, skip)) continue;
    if ((isCJK(a) && /[A-Za-z0-9]/.test(c)) || (/[A-Za-z0-9]/.test(a) && isCJK(c)))
      add('spacing', k, k, ' ', '中文与英文、数字之间加一个空格');
  }

  for (let k = 0; k < t.length; k++) {
    const ch = t[k]!;
    if (inRanges(k, skip)) continue;
    const prev = t[k - 1];
    let n = k + 1;
    while (t[n] === ' ') n++;
    const next = t[n];
    if (ch in FULL) {
      if (ch === ':' && t[k + 1] === '/') continue;
      if (isCJK(prev) || (isCJK(next) && !/[0-9]/.test(prev ?? ''))) add('punct', k, n, FULL[ch]!, `中文里用全角「${FULL[ch]}」`);
    } else if (ch === '.' && isCJK(prev) && (next === undefined || isCJK(next))) {
      add('punct', k, n, '。', '中文句末用全角句号「。」');
    } else if (ch in HALF && /[A-Za-z0-9]/.test(prev ?? '') && /[A-Za-z]/.test(t[k + 1] ?? '')) {
      add('punct', k, k + 1, `${HALF[ch]} `, `英文里用半角「${HALF[ch]}」`);
    }
  }
  for (const m of t.matchAll(/\(([^()\n]{1,60})\)/g)) {
    const k = m.index ?? 0;
    if (inRanges(k, skip) || !isCJK(m[1]!.trim()[0]) || !isCJK(m[1]!.trim().slice(-1))) continue;
    add('punct', k, k + m[0].length, `（${m[1]}）`, '中文括号用全角「（）」');
  }
  return out;
}

const URL_OK = /^(https?:\/\/[^\s/$.?#][^\s]*|mailto:[^\s@]+@[^\s@]+\.[^\s@]+|\/[^\s]*|#[^\s]*)$/i;

/** All rule-based issues of a document (AI-free). */
export function ruleIssues(scan: DocScan): Issue[] {
  const out: Issue[] = [];
  for (const b of scan.blocks) {
    out.push(...textRules(b));
    if (b.type === 'paragraph' && visibleLength(b.text) > LONG_PARAGRAPH) {
      const offsets = planSplit(b.text);
      out.push({
        id: `paragraph:${b.pos}`,
        kind: 'paragraph',
        message: `这段有 ${visibleLength(b.text)} 字，手机上读很吃力，${offsets.length ? `可在句末拆成 ${offsets.length + 1} 段` : '建议拆开'}`,
        excerpt: excerpt(b.text, 0, 18),
        from: b.pos + 1,
        to: b.pos + 1 + b.text.length,
        fix: offsets.length ? { type: 'split', pos: b.pos, offsets } : undefined,
      });
    }
    for (const l of b.links) {
      if (URL_OK.test(l.href)) continue;
      const www = /^www\.[^\s]+\.[^\s]+$/i.test(l.href.trim());
      out.push({
        id: `link:${b.pos + 1 + l.from}`,
        kind: 'link',
        message: www ? '链接少了 https://' : `链接格式不对：${l.href || '（空）'}`,
        excerpt: excerpt(b.text, l.from, l.to),
        from: b.pos + 1 + l.from,
        to: b.pos + 1 + l.to,
        fix: www ? { type: 'link', from: b.pos + 1 + l.from, to: b.pos + 1 + l.to, href: `https://${l.href.trim()}` } : undefined,
      });
    }
  }
  for (const img of scan.images) {
    if (img.caption.trim()) continue;
    const alt = img.alt.trim();
    const usable = alt && !/^(image|img|图片|截图|screenshot)?[\w-]*\.(png|jpe?g|gif|webp)$/i.test(alt) && !/^[\w-]{12,}$/.test(alt);
    out.push({
      id: `caption:${img.pos}`,
      kind: 'caption',
      message: usable ? `用替代文字「${alt.slice(0, 20)}」做图片说明` : '图片没有说明，点「定位」后在图片下方补一句',
      excerpt: alt || '（图片）',
      from: img.pos,
      to: img.pos + 1,
      fix: usable ? { type: 'caption', pos: img.pos, caption: alt.slice(0, 60) } : undefined,
    });
  }
  // long stretches without a heading (top-level text only)
  let run = 0;
  let start: TextBlockScan | null = null;
  let flagged = false;
  for (const b of scan.blocks) {
    if (b.type === 'heading') {
      run = 0;
      start = null;
      flagged = false;
      continue;
    }
    start ??= b;
    run += visibleLength(b.text);
    if (run > LONG_SECTION && !flagged) {
      flagged = true;
      out.push({
        id: `section:${start.pos}`,
        kind: 'section',
        message: `连续 ${LONG_SECTION} 多字没有小标题，读者容易迷路；可以用「排成传播稿」补小标题`,
        excerpt: excerpt(start.text, 0, 18),
        from: start.pos + 1,
        to: start.pos + 1,
      });
    }
  }
  return out;
}

// ---------- AI: typos and terms ----------

export interface CheckAiResult {
  typos: { wrong: string; right: string }[];
  terms: { preferred: string; variants: string[] }[];
}

export function buildCheckPrompt(scan: DocScan): { system: string; user: string } {
  const system = [
    `${CHECK_MARKER} 你是严谨的校对。只找两类问题：错别字（含的地得、同音错字）和术语前后写法不一致（大小写、中英文写法）。`,
    '不要改文风，不要挑标点和空格。只返回 JSON：',
    '{"typos":[{"wrong":"原文里的错误写法","right":"正确写法"}],"terms":[{"preferred":"推荐写法","variants":["原文里出现的其他写法"]}]}',
  ].join('\n');
  let budget = 16000;
  const user = scan.blocks
    .filter((b) => b.type !== 'codeBlock')
    .map((b) => {
      const t = b.text.replace(new RegExp(LEAF, 'g'), ' ').slice(0, Math.max(0, budget));
      budget -= t.length;
      return t;
    })
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export function parseCheckResult(text: string): CheckAiResult | null {
  const d = parseJsonObject(text);
  if (!d) return null;
  const typos = Array.isArray(d.typos)
    ? (d.typos as Record<string, unknown>[])
        .map((x) => ({ wrong: str(x?.wrong, 30), right: str(x?.right, 30) }))
        .filter((x) => x.wrong && x.right && x.wrong !== x.right)
    : [];
  const terms = Array.isArray(d.terms)
    ? (d.terms as Record<string, unknown>[])
        .map((x) => ({
          preferred: str(x?.preferred, 40),
          variants: Array.isArray(x?.variants) ? (x.variants as unknown[]).map((v) => str(v, 40)).filter(Boolean) : [],
        }))
        .filter((x) => x.preferred && x.variants.some((v) => v !== x.preferred))
    : [];
  return { typos: typos.slice(0, 50), terms: terms.slice(0, 30) };
}

const WORDISH = /[A-Za-z0-9]/;

/** Where the model's words occur, as fixable issues (code and links skipped; Latin terms match whole words). */
export function aiIssues(scan: DocScan, result: CheckAiResult): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  const find = (word: string, kind: IssueKind, insert: string, message: string) => {
    for (const b of scan.blocks) {
      const skip: [number, number][] = [...b.code, ...b.links.map((l) => [l.from, l.to] as [number, number])];
      let k = b.text.indexOf(word);
      while (k >= 0) {
        const end = k + word.length;
        const latin = WORDISH.test(word);
        const whole = !latin || (!WORDISH.test(b.text[k - 1] ?? '') && !WORDISH.test(b.text[end] ?? ''));
        const from = b.pos + 1 + k;
        if (whole && !inRanges(k, skip) && !seen.has(`${from}`)) {
          seen.add(`${from}`);
          out.push({ id: `${kind}:${from}:${insert}`, kind, message, excerpt: excerpt(b.text, k, end), from, to: b.pos + 1 + end, fix: { type: 'text', from, to: b.pos + 1 + end, insert } });
        }
        k = b.text.indexOf(word, end);
      }
    }
  };
  for (const t of result.typos) find(t.wrong, 'typo', t.right, `「${t.wrong}」应为「${t.right}」`);
  for (const term of result.terms)
    for (const v of term.variants) if (v !== term.preferred) find(v, 'term', term.preferred, `统一写作「${term.preferred}」`);
  return out;
}

/**
 * The fixes to apply together: text edits that don't overlap (first wins), plus every caption / split fix.
 * The editor applies them in one transaction, mapping each original position through the steps before it.
 */
export function fixOrder(issues: Issue[]): Fix[] {
  const fixes = issues.map((i) => i.fix).filter((f): f is Fix => Boolean(f));
  const ranged = fixes
    .filter((f): f is Extract<Fix, { from: number }> => f.type === 'text' || f.type === 'link')
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const kept: Fix[] = [];
  let end = -1;
  let lastInsertAt = -1;
  for (const f of ranged) {
    if (f.from < end) continue;
    if (f.from === f.to && f.from === lastInsertAt) continue;
    kept.push(f);
    end = Math.max(end, f.to);
    if (f.from === f.to) lastInsertAt = f.from;
  }
  return [...kept, ...fixes.filter((f) => f.type === 'caption' || f.type === 'split')];
}
