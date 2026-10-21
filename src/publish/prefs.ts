/**
 * r10 AI 发布「少打扰、可偏好、可改」: what the AI does by itself when publishing, stored on the server
 * (`PATCH /me/preferences`) so the web panel and the phone flow behave the same. All on by default except 自动翻译
 * (it costs points on every publish) and the first-use card flag. The clients wrap these in their own hooks
 * (antd `message` on the web, `Toast` on the phone).
 */
import type { UserPreferences } from '../api/types';

export const PUBLISH_PREF_DEFAULTS = {
  remember_platforms: true,
  ai_category: true,
  ai_tags_summary: true,
  ai_cover: true,
  auto_versions: true,
  auto_translate_en: false,
  plan_collapsed: true,
  publish_intro_seen: false,
} as const;

export type PublishPrefKey = keyof typeof PUBLISH_PREF_DEFAULTS;
export type PublishPrefs = Record<PublishPrefKey, boolean> & { last_platforms: string[] };

/** The switches in the order every client lists them. */
export const PUBLISH_PREF_ITEMS: {
  key: Exclude<PublishPrefKey, 'publish_intro_seen'>;
  label: string;
  hint?: string;
}[] = [
  { key: 'remember_platforms', label: '记住上次选的平台' },
  { key: 'ai_category', label: 'AI 自动选分类' },
  { key: 'ai_tags_summary', label: 'AI 自动生成标签与摘要' },
  { key: 'ai_cover', label: 'AI 自动生成封面', hint: '用模板封面生成器按标题生成' },
  { key: 'auto_versions', label: '自动准备多版本', hint: '图集 / 英文版 / 精简版' },
  { key: 'auto_translate_en', label: '自动翻译英文', hint: '开启前会再确认一次' },
  { key: 'plan_collapsed', label: '方案默认折叠为一行摘要' },
];

/** The preferences with the server's defaults filled in (an older API leaves the r10 keys out). */
export function publishPrefsOf(p: UserPreferences | null | undefined): PublishPrefs {
  const out = { ...PUBLISH_PREF_DEFAULTS, last_platforms: [] as string[] } as PublishPrefs;
  for (const k of Object.keys(PUBLISH_PREF_DEFAULTS) as PublishPrefKey[]) {
    const v = p?.[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  out.last_platforms = Array.isArray(p?.last_platforms) ? p.last_platforms : [];
  return out;
}

/** 自动翻译英文 is confirmed before it is turned on: the dialog's title, points and buttons (same on every client). */
export const AUTO_TRANSLATE_CONFIRM = {
  title: '以后发布时自动翻译成英文？',
  points: [
    '每篇按实际字数消耗 AI 点，不再逐篇确认。',
    '译文会直接发布到需要英文版的平台，并作为辰记博客的英文页面。',
    '随时可以在发布的「偏好设置」或「设置 → 偏好」里关闭。',
  ],
  ok: '开启自动翻译',
  cancel: '先不用',
} as const;

/** What each publish mode does, one sentence each, where the user picks between them. */
export const MODE_HINT = {
  ai: 'AI 帮你选分类、写摘要、做封面，你确认即可',
  manual: '自己逐项填写',
} as const;
