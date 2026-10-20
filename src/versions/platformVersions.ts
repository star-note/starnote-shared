import { platformMeta } from '@starnote/publish-core';

import type { NoteVersionSummary, VersionKind } from '../api/versions';

/**
 * Which version each platform can publish (CONTRACTS-r9 §3): 原文 always; 小红书图集 for image-set platforms;
 * 英文版 for overseas platforms (GitHub Pages takes it as the `en` translation next to the original, i.e. the
 * template's `index.en.html`); 精简版 for every article platform except 辰记 (the blog keeps the full post).
 */
export type VersionChoice = 'original' | VersionKind;

export const CHOICE_LABEL: Record<VersionChoice, string> = {
  original: '原文',
  xhs: '小红书图集',
  en: '英文版',
  condensed: '精简版',
};

/** What each AI version does, for the guidance shown when AI is not on yet. */
export const VERSION_PITCH: Record<VersionKind, string> = {
  xhs: 'AI 会把文章拆成 6–9 张 3:4 卡片，写好每张卡的文案、1000 字以内的笔记和话题',
  en: 'AI 会逐段翻译成英文版，保留排版和图片，可选直译或本地化',
  condensed: '按目标字数生成精简版；「摘编」挑原句，免费，不需要 AI',
};

const IMAGE_SET_ONLY = new Set(['xiaohongshu']);

export function isImageSetPlatform(key: string): boolean {
  if (IMAGE_SET_ONLY.has(key)) return true;
  const types = platformMeta(key)?.contentTypes ?? [];
  return types.includes('image-set') && !types.includes('article');
}

export function isOverseas(key: string): boolean {
  return platformMeta(key)?.region === 'global';
}

/** The version kinds a platform can take, besides 原文. */
export function versionKindsFor(key: string): VersionKind[] {
  if (key === 'chenji') return [];
  // GitHub Pages: the original stays the main language; the English version rides along as `en` (双语)
  if (key === 'github-pages') return ['condensed'];
  if (isImageSetPlatform(key)) return ['xhs'];
  if (key === 'instagram') return ['xhs'];
  return isOverseas(key) ? ['en', 'condensed'] : ['condensed'];
}

/**
 * The default choice: the image set where one is needed, the English version for overseas platforms when there is
 * one, otherwise the original. GitHub Pages keeps the original as the main language (English goes in as `en`).
 */
export function defaultChoice(key: string, versions: NoteVersionSummary[]): string {
  const kinds = versionKindsFor(key);
  const newest = (kind: VersionKind) =>
    versions.filter((v) => v.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (kinds.includes('xhs')) return newest('xhs')?.id ?? 'original';
  if (key !== 'github-pages' && kinds.includes('en')) return newest('en')?.id ?? 'original';
  return 'original';
}

/** The version id chosen for a platform → its kind (`original` when none / unknown). */
export function choiceKind(choice: string | undefined, versions: NoteVersionSummary[]): VersionChoice {
  if (!choice || choice === 'original') return 'original';
  return versions.find((v) => v.id === choice)?.kind ?? 'original';
}
