import type { NoteTemplate, OfficialLookId, SkinId, TemplatePurpose } from './model';
import { OFFICIAL_LOOKS } from './official';
import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * Rule-based recommendation (no AI; the same map as `recommendThemes` in @starnote/publish-core, with 素雅默认 as
 * the neutral third choice). Picks among the six official looks only (a content template's skin is the same set). Used when AI is off, as the fallback when the model's answer cannot be read, and
 * by the API mock (`style.suggest`), so the three agree.
 */

const SLUG_SKIN: Record<string, SkinId> = {};
const add = (skin: SkinId, slugs: string) => {
  for (const slug of slugs.split(/\s+/).filter(Boolean)) SLUG_SKIN[slug] = skin;
};
add(
  'tech',
  'tech frontend backend mobile ai data devops architecture opensource science math physics biology earth-space popsci games auto military productivity',
);
add(
  'business',
  'business startup finance economics marketing workplace career management job-hunting product growth law government charity weekly retro',
);
add(
  'warm',
  'emotion society relationships humanities history philosophy writing fiction poetry essay screenplay craft reading book-review reading-notes journal thoughts',
);
add(
  'magazine',
  'arts photography fine-arts fashion design product-design entertainment film music variety travel travel-guides travelogue anime home',
);
add(
  'fresh',
  'education k12 textbook exam language college study-skills teaching health wellness mental-health fitness life food recipes restaurants family sports humor',
);

const NAME_RULES: [RegExp, SkinId][] = [
  [
    /技术|科技|编程|开发|代码|前端|后端|算法|数据|AI|人工智能|大模型|科学|科普|数码|硬件|互联网|运维|架构|开源|数学|物理|游戏|汽车/i,
    'tech',
  ],
  [/商业|商务|职场|财经|金融|投资|理财|经济|创业|营销|管理|产品|增长|求职|法律|政务|周报|复盘/, 'business'],
  [/文学|人文|历史|哲学|读书|书评|小说|诗|散文|随笔|写作|情感|心理|亲密|日志|日记|随想/, 'warm'],
  [/艺术|时尚|穿搭|美妆|设计|影视|电影|音乐|综艺|旅行|游记|摄影|绘画|书法|动漫|家居/, 'magazine'],
  [/教育|学习|考试|教学|健康|养生|运动|健身|生活|美食|菜谱|探店|亲子|育儿|母婴|体育/, 'fresh'],
];

/** Each best style followed by its neighbours (mirrors the API mock's `_STYLE_AFFINITY`). */
const AFFINITY: Record<OfficialLookId, OfficialLookId[]> = {
  business: ['business', 'tech', 'magazine', 'plain', 'fresh', 'warm'],
  tech: ['tech', 'business', 'fresh', 'plain', 'magazine', 'warm'],
  warm: ['warm', 'magazine', 'fresh', 'plain', 'business', 'tech'],
  magazine: ['magazine', 'warm', 'business', 'plain', 'fresh', 'tech'],
  fresh: ['fresh', 'warm', 'tech', 'plain', 'business', 'magazine'],
  plain: ['plain', 'business', 'warm', 'tech', 'magazine', 'fresh'],
};

export type CategoryHint = { slug?: string | null; name?: string | null } | string | null | undefined;

/** The best official look for a category (slug or name), or `plain` when nothing matches. */
export function bestLookFor(category: CategoryHint, text = ''): OfficialLookId {
  const slug = typeof category === 'string' ? category : category?.slug;
  const name = typeof category === 'string' ? category : category?.name;
  const bySlug = slug ? SLUG_SKIN[slug.trim().toLowerCase()] : undefined;
  if (bySlug) return bySlug;
  for (const probe of [name, text]) {
    if (!probe) continue;
    const hit = NAME_RULES.find(([re]) => re.test(probe))?.[1];
    if (hit) return hit;
  }
  return 'plain';
}

/**
 * Three official looks for a note, best first: by its category (slug / name), else by the title and an
 * excerpt of the text. Unknown everything → 素雅默认, 简约商务, 文艺暖.
 */
export function recommendTemplates(category: CategoryHint, text = '', count = 3): NoteTemplate[] {
  const best = bestLookFor(category, text);
  return AFFINITY[best].slice(0, count).map((id) => OFFICIAL_LOOKS[id]);
}

// ------------------------------------------------------------------ r10: recommend 模板 by content

/**
 * What the recommendation knows about a note: its words (title, category, opening) and its shape (小标题、列表、表格、
 * 图片、代码、引用). The same object goes to the model (`style.suggest`) and to the rules, so both judge alike.
 */
export interface NoteSignals {
  title: string;
  /** Category / tag words (published category, else tags). */
  category: string;
  /** The first ~300 characters of the text. */
  opening: string;
  headings: number;
  lists: number;
  tables: number;
  images: number;
  code: number;
  quotes: number;
  /** Characters of text in the whole note. */
  chars: number;
}

const OPENING_CHARS = 300;

/** Counts the note's structure and reads its opening (one walk over the document). */
export function noteSignals(input: { title?: string | null; doc?: TiptapDoc | null; category?: string | null }): NoteSignals {
  const sig: NoteSignals = {
    title: (input.title ?? '').trim(),
    category: (input.category ?? '').trim(),
    opening: '',
    headings: 0,
    lists: 0,
    tables: 0,
    images: 0,
    code: 0,
    quotes: 0,
    chars: 0,
  };
  const parts: string[] = [];
  let openLen = 0;
  const walk = (nodes: TiptapNode[] | undefined, inList: boolean) => {
    for (const n of nodes ?? []) {
      const t = n.type ?? '';
      const isList = t === 'bulletList' || t === 'orderedList' || t === 'taskList';
      if (t === 'heading') sig.headings++;
      // a list inside a list counts once (the outer one)
      else if (isList && !inList) sig.lists++;
      else if (t === 'table') sig.tables++;
      else if (/image/i.test(t)) sig.images++;
      else if (t === 'codeBlock') sig.code++;
      else if (t === 'blockquote') sig.quotes++;
      if (t === 'text') {
        const text = n.text ?? '';
        sig.chars += text.length;
        if (openLen < OPENING_CHARS) {
          parts.push(text);
          openLen += text.length;
        }
      }
      walk(n.content, inList || isList);
    }
  };
  walk(input.doc?.content, false);
  sig.opening = parts.join(' ').slice(0, OPENING_CHARS);
  return sig;
}

/** Words that say what a note is for, per 用途 (the official content templates carry one each). */
const PURPOSE_WORDS: [TemplatePurpose, RegExp][] = [
  ['周报', /周报|月报|季报|日报|复盘|本周|下周|上周|本月|进展|OKR|KPI|里程碑|待办|weekly/i],
  ['教程', /教程|步骤|入门|上手|手把手|怎么|如何|安装|配置|部署|实战|tutorial|how to/i],
  ['产品', /发布会|新品|上线|新版本|版本更新|更新日志|新功能|功能介绍|产品|release|changelog/i],
  ['读书', /读书|书评|读后感|《[^》]{1,30}》|书单|摘抄|阅读笔记/],
  ['访谈', /访谈|专访|对谈|对话|采访|问答|Q&A|嘉宾/i],
  ['活动', /活动|报名|邀请函|讲座|沙龙|大会|直播|招募|议程|时间地点/],
  ['随笔', /随笔|日记|散文|随想|感悟|生活|游记|心情|回忆|碎碎念/],
  ['知识', /方法|干货|经验|原理|技巧|清单|盘点|解读|分析|指南|总结|学习/],
];

export interface PurposeGuess {
  purpose: TemplatePurpose;
  /** How strongly the note points at it (0 = a guess from the shape alone). */
  score: number;
  /** Half a sentence for the reason: 「标题提到「周报」」 / 「有 5 个小标题」. */
  why: string;
}

/** Every 用途 scored for the note, best first (words in the title count most, then the category, then the opening and shape). */
export function purposeScores(sig: NoteSignals): PurposeGuess[] {
  const out = new Map<TemplatePurpose, PurposeGuess>();
  const bump = (p: TemplatePurpose, by: number, why: string) => {
    const cur = out.get(p) ?? { purpose: p, score: 0, why: '' };
    cur.score += by;
    if (!cur.why) cur.why = why;
    out.set(p, cur);
  };
  for (const [purpose, re] of PURPOSE_WORDS) {
    const t = sig.title.match(re)?.[0];
    if (t) bump(purpose, 3, `标题提到「${t}」`);
    const c = sig.category.match(re)?.[0];
    if (c) bump(purpose, 2, `分类是「${sig.category.split(/\s+/)[0]}」`);
    const o = sig.opening.match(re)?.[0];
    if (o) bump(purpose, 1, `开头讲到「${o}」`);
  }
  if (sig.code > 0) bump('教程', 2, `有 ${sig.code} 段代码`);
  if (sig.tables > 0) bump('周报', 1, `有 ${sig.tables} 张表格`);
  if (sig.headings >= 3) bump('知识', 1.5, `有 ${sig.headings} 个小标题`);
  if (sig.lists >= 2) bump('教程', 0.5, `有 ${sig.lists} 组列表`);
  if (sig.quotes >= 2) bump('读书', 0.5, `引用了 ${sig.quotes} 段`);
  if (sig.headings === 0 && sig.chars < 1500) bump('随笔', 1, '篇幅短、没有小标题');
  const ranked = [...out.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    const p: TemplatePurpose = sig.headings >= 2 ? '知识' : '随笔';
    ranked.push({ purpose: p, score: 0, why: sig.headings >= 2 ? `有 ${sig.headings} 个小标题` : '按全文的样子' });
  }
  return ranked;
}

export interface TemplatePick {
  template: NoteTemplate;
  /** One sentence: why this template for this note. */
  reason: string;
}

export interface RecommendOptions {
  /** The template the note wears now: never re-offered; when it is a content template, the 「至少 1 款内容模板」 rule is off. */
  current?: NoteTemplate | null;
  /** 换一批: ids shown last time, offered again only when nothing else is left. */
  exclude?: readonly string[];
}

/** 「概览卡片、完成与待办清单」: the first two items of a description's first clause. */
const looksOf = (s: string) =>
  (s.split(/[，,；;。]/)[0] ?? '')
    .split('、')
    .slice(0, 2)
    .join('、')
    .trim();

/** Half a sentence about the note's shape, when no words point at a 用途. */
function shapeWhy(sig: NoteSignals): string {
  if (sig.headings >= 2) return `有 ${sig.headings} 个小标题${sig.lists ? `、${sig.lists} 组列表` : ''}`;
  if (sig.lists) return `有 ${sig.lists} 组列表`;
  return '以段落为主';
}

function contentReason(t: NoteTemplate, why: string): string {
  const what = looksOf(t.description);
  return `${why}，${what ? `用${what}来排` : `套「${t.name}」的版式`}`.slice(0, 40);
}

function lookReason(t: NoteTemplate, sig: NoteSignals, best: boolean): string {
  const cat = sig.category.split(/\s+/)[0];
  if (!best) return `想保留现有结构，只换成${t.name}的配色`.slice(0, 40);
  // 素雅默认 = nothing in the category pointed anywhere: no 「X 类内容」 claim then
  return (cat && t.skin ? `「${cat}」类内容配${t.name}，只换配色和标题样式` : `${t.name}的配色合这篇，只换外观不动结构`).slice(0, 40);
}

/**
 * Every offered template ranked for the note: content templates by 用途 (and, for 我的 / 群组 ones, by words their
 * name shares with the title), looks by the category's best skin and its neighbours. Ties keep the offered order.
 */
export function rankTemplates(sig: NoteSignals, offered: readonly NoteTemplate[]): { contents: TemplatePick[]; looks: TemplatePick[] } {
  const purposes = purposeScores(sig);
  const purposeOf = new Map(purposes.map((p) => [p.purpose, p]));
  const best = bestLookFor(sig.category || null, `${sig.title} ${sig.opening}`);
  const affinity = AFFINITY[best];
  const scored = offered.map((t, i) => {
    if (t.kind === 'content') {
      const guess = t.purpose ? purposeOf.get(t.purpose as TemplatePurpose) : undefined;
      let score = guess ? guess.score * 2 + 1 : 0;
      let why = guess?.why ?? '';
      if (!t.purpose) {
        // 我的 / 群组: words of its name in the title
        const words = (t.name.match(/[\u4e00-\u9fff]{2}|[A-Za-z]{3,}/g) ?? []).filter((w) => sig.title.includes(w) || sig.category.includes(w));
        if (words.length) {
          score = 4 + words.length;
          why = `标题和「${t.name}」都讲「${words[0]}」`;
        }
      }
      if ((t.skin ?? 'plain') === best) score += 0.5;
      return { t, i, score, why: why || shapeWhy(sig), kind: 'content' as const };
    }
    const rank = affinity.indexOf((t.skin ?? 'plain') as OfficialLookId);
    return { t, i, score: 6 - (rank < 0 ? 6 : rank) - (t.source === 'official' ? 0 : 0.1), why: '', kind: 'look' as const };
  });
  const by = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.i - b.i;
  return {
    contents: scored.filter((s) => s.kind === 'content').sort(by).map((s) => ({ template: s.t, reason: contentReason(s.t, s.why) })),
    looks: scored
      .filter((s) => s.kind === 'look')
      .sort(by)
      .map((s, i) => ({ template: s.t, reason: lookReason(s.t, sig, i === 0) })),
  };
}

/** True when the note already wears a content template (then three looks are fine). */
export const wearsContentTemplate = (current: NoteTemplate | null | undefined) => current?.kind === 'content';

/**
 * Three templates for a note by the rules (no AI, no points): the best content template, the best look, then the
 * next best of either. At least one is a content template (kind=content) unless the note already wears one; the
 * note's current template is never offered; 换一批 (`exclude`) moves on to the next ones.
 */
export function recommendForNote(sig: NoteSignals, offered: readonly NoteTemplate[], opts: RecommendOptions = {}, count = 3): TemplatePick[] {
  const pool = offered.filter((t) => t.id !== opts.current?.id);
  const fresh = opts.exclude?.length ? pool.filter((t) => !opts.exclude!.includes(t.id)) : pool;
  const { contents, looks } = rankTemplates(sig, fresh.length >= count ? fresh : pool);
  const order: TemplatePick[] = [];
  const take = (list: TemplatePick[]) => {
    const next = list.find((p) => !order.some((o) => o.template.id === p.template.id));
    if (next) order.push(next);
  };
  if (wearsContentTemplate(opts.current)) {
    take(looks);
    take(contents);
    take(looks);
  } else {
    take(contents);
    take(looks);
    // the third: a second content template when the note points at another 用途 too, else the next look
    const second = contents[1];
    if (second && second.template.purpose && purposeScores(sig).some((p) => p.purpose === second.template.purpose && p.score > 0)) take(contents);
    else take(looks);
  }
  while (order.length < count) {
    const before = order.length;
    take(looks);
    take(contents);
    if (order.length === before) break;
  }
  return ensureContentPick(order.slice(0, count), contents, opts.current);
}

/**
 * The 「至少 1 款内容模板」 rule over any list of picks (the model's included): when none is a content template, the
 * note does not wear one and a content template exists, the last pick gives way to the best content template.
 */
export function ensureContentPick(picks: TemplatePick[], contents: TemplatePick[], current?: NoteTemplate | null): TemplatePick[] {
  if (wearsContentTemplate(current) || picks.some((p) => p.template.kind === 'content')) return picks;
  const best = contents.find((c) => !picks.some((p) => p.template.id === c.template.id));
  if (!best) return picks;
  const out = [...picks];
  if (out.length >= 3) out[out.length - 1] = best;
  else out.push(best);
  return out;
}

/** r9 names, kept one round. */
export const bestStyleFor = bestLookFor;
export const recommendStyles = recommendTemplates;
