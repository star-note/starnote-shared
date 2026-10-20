import type { NoteTemplate, OfficialLookId } from './model';

/**
 * The six official 「只换外观」 templates: 素雅默认 plus one per skin, each with the layout that suits it. Their layouts
 * set only the callout card (a 「重点 / 提示」 paragraph becomes that card) — plain headings, quotes and rules take
 * the skin's own looks, which is what makes the skin visible — so applying one also resets styled blocks to plain
 * (`planLookOps`). The API ships the same six (`official_templates/look-*.json`, `kind: look`) so the library's
 * official list is one request; this constant is the offline copy used by the recommendations and `findTemplate`.
 */
export const OFFICIAL_LOOKS: Record<OfficialLookId, NoteTemplate> = {
  plain: {
    id: 'plain',
    name: '素雅默认',
    description: '辰记默认的黑白灰，留白克制，哪里都合适',
    skin: null,
    layout: { callout: { variant: 'soft', label: '提示' } },
    kind: 'look',
    source: 'official',
  },
  business: {
    id: 'business',
    name: '简约商务',
    description: '藏青与暗金，左侧竖条标题，描边要点框，适合商业、职场、财经',
    skin: 'business',
    layout: { callout: { variant: 'outline', label: '要点' } },
    kind: 'look',
    source: 'official',
  },
  tech: {
    id: 'tech',
    name: '科技蓝',
    description: '亮蓝到青的渐变，色块标题、卡片引用与提示框，适合技术、科学、数码',
    skin: 'tech',
    layout: { callout: { variant: 'tip', label: '重点' } },
    kind: 'look',
    source: 'official',
  },
  warm: {
    id: 'warm',
    name: '文艺暖',
    description: '赭石暖色，居中标题，宽行距、斜体图注与柔和便签，适合文学、读书、随笔',
    skin: 'warm',
    layout: { callout: { variant: 'soft', label: '小记' } },
    kind: 'look',
    source: 'official',
  },
  magazine: {
    id: 'magazine',
    name: '杂志感',
    description: '黑白加一抹正红，粗细线标题、上下线引语与深色要点卡，适合艺术、时尚、影视、旅行',
    skin: 'magazine',
    layout: { callout: { variant: 'dark', label: '要点' } },
    kind: 'look',
    source: 'official',
  },
  fresh: {
    id: 'fresh',
    name: '清新绿',
    description: '薄荷绿，圆角色块标题、柔和引用与提示框，适合教育、健康、生活、美食',
    skin: 'fresh',
    layout: { callout: { variant: 'tip', label: '提示' } },
    kind: 'look',
    source: 'official',
  },
};

export const OFFICIAL_LOOK_LIST: readonly NoteTemplate[] = (
  ['plain', 'business', 'tech', 'warm', 'magazine', 'fresh'] as const
).map((id) => OFFICIAL_LOOKS[id]);

/** r9 names, kept one round. */
export const OFFICIAL_STYLES = OFFICIAL_LOOKS;
export const OFFICIAL_STYLE_LIST = OFFICIAL_LOOK_LIST;
