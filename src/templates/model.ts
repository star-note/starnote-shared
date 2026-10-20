import type { TemplateLayout } from '../api/templates';

/**
 * 模板 = 版式 + 皮肤 + 可选示例内容 (CONTRACTS-r9 §7, r10). One template is a complete look for a note — the layout
 * (block looks: callout cards, styled headings / quotes / dividers, an ending block) plus the skin (colour / type
 * tokens) — and, for `kind: 'content'`, example content to start a new note from. The same template has two uses:
 * 「套用到本文」 (looks only, words untouched) and 「用它新建」 (a new note with the example content). A template
 * without example content is 「只换外观」 (`kind: 'look'`): the six former official 风格 are these.
 */

/** Skin ids = the article theme ids of `@starnote/publish-core` (`ARTICLE_THEME_IDS`); `null` = plain. */
export type SkinId = 'business' | 'tech' | 'warm' | 'magazine' | 'fresh';

export const SKIN_IDS: readonly SkinId[] = ['business', 'tech', 'warm', 'magazine', 'fresh'];

/** The six official 「只换外观」 templates (ids unchanged from the r9 风格 ids, so `notes.style_id` keeps working). */
export type OfficialLookId = 'plain' | SkinId;

export const OFFICIAL_LOOK_IDS: readonly OfficialLookId[] = [
  'plain',
  'business',
  'tech',
  'warm',
  'magazine',
  'fresh',
];

export type TemplateKind = 'content' | 'look';

/** The 用途 tags the library filters by (official content templates carry one each). */
export const TEMPLATE_PURPOSES = ['周报', '教程', '产品', '读书', '访谈', '活动', '随笔', '知识'] as const;
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number];

export interface NoteTemplate {
  /** An official look id (`plain` | skin id), an official content id (`official-{key}`) or a 我的 / 群组 row id. */
  id: string;
  name: string;
  description: string;
  skin: SkinId | null;
  layout: TemplateLayout;
  /** `content`: has example content (用它新建 + 套用到本文); `look`: 只换外观. */
  kind: TemplateKind;
  /** 用途 tag (周报 / 教程 / …); `null` for saved templates. */
  purpose?: string | null;
  thumbnail?: string | null;
  source: 'official' | 'mine' | 'group';
  /** Group templates: the group's id and name. */
  ownerId?: string | null;
  ownerName?: string | null;
  /** The user may rename / delete it (never for official templates). */
  canEdit?: boolean;
}

/** r9 name, kept one round: a 风格 is a template. */
export type Style = NoteTemplate;
export type OfficialStyleId = OfficialLookId;
export const OFFICIAL_STYLE_IDS = OFFICIAL_LOOK_IDS;

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}

export function isOfficialLookId(value: unknown): value is OfficialLookId {
  return typeof value === 'string' && (OFFICIAL_LOOK_IDS as readonly string[]).includes(value);
}

export const isOfficialStyleId = isOfficialLookId;

export function isTemplateKind(value: unknown): value is TemplateKind {
  return value === 'content' || value === 'look';
}

/** Class names for an article root carrying a skin: `'sn-theme sn-theme--tech'`; `''` when plain. */
export function skinClassName(skin: string | null | undefined): string {
  return isSkinId(skin) ? `sn-theme sn-theme--${skin}` : '';
}
