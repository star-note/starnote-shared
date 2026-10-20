import type { TemplateLayout } from '../api/templates';

/**
 * 风格 = 版式 + 皮肤 (CONTRACTS-r9 §7). One style is a complete look for a note: the layout (block looks the
 * old 模板 carried: callout cards, dividers, an ending block) plus the skin (the old 主题 tokens: colours,
 * type, the looks of plain headings / quotes / rules). Picking a style applies both at once.
 */

/** Skin ids = the article theme ids of `@starnote/publish-core` (`ARTICLE_THEME_IDS`); `null` = plain. */
export type SkinId = 'business' | 'tech' | 'warm' | 'magazine' | 'fresh';

export const SKIN_IDS: readonly SkinId[] = ['business', 'tech', 'warm', 'magazine', 'fresh'];

export type OfficialStyleId = 'plain' | SkinId;

export const OFFICIAL_STYLE_IDS: readonly OfficialStyleId[] = [
  'plain',
  'business',
  'tech',
  'warm',
  'magazine',
  'fresh',
];

export interface Style {
  /** An official id (`plain` | skin id) or the id of a 我的风格 / 群组风格 row (`templates`). */
  id: string;
  name: string;
  description: string;
  skin: SkinId | null;
  layout: TemplateLayout;
  source: 'official' | 'mine' | 'group';
  /** Group styles: the group's name. */
  ownerName?: string | null;
  /** The user may rename / delete it (never for official styles). */
  canEdit?: boolean;
}

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}

export function isOfficialStyleId(value: unknown): value is OfficialStyleId {
  return typeof value === 'string' && (OFFICIAL_STYLE_IDS as readonly string[]).includes(value);
}

/** Class names for an article root carrying a skin: `'sn-theme sn-theme--tech'`; `''` when plain. */
export function skinClassName(skin: string | null | undefined): string {
  return isSkinId(skin) ? `sn-theme sn-theme--${skin}` : '';
}
