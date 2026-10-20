import type { NoteTemplate, OfficialLookId, SkinId } from './model';
import { OFFICIAL_LOOKS } from './official';

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

/** r9 names, kept one round. */
export const bestStyleFor = bestLookFor;
export const recommendStyles = recommendTemplates;
