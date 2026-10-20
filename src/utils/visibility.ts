import type { Visibility } from '../api/types';

/** The two visibility options in display order (SPEC-r6 §B). */
export const VISIBILITIES: Visibility[] = ['public', 'password'];

/** Copy per option: short label, one-line hint (the `?` tooltip and option descriptions). */
export const VISIBILITY_COPY: Record<
  Visibility,
  { label: string; hint: string; tagColor?: string }
> = {
  public: {
    label: '公开',
    hint: '所有人可见，出现在博客、发现流与搜索，搜索引擎可以收录',
    tagColor: 'success',
  },
  password: {
    label: '密码访问',
    hint: '不出现在任何列表、不被收录；需要链接和提取码才能阅读，分享链接可自带提取码',
    tagColor: 'gold',
  },
};

export const VISIBILITY_OPTIONS = VISIBILITIES.map((v) => ({
  value: v,
  label: VISIBILITY_COPY[v].label,
  hint: VISIBILITY_COPY[v].hint,
}));

/** Label for any stored value — old `link` / `group` / `private` records read as 密码访问 (their migrated meaning). */
export function visibilityLabel(v: string | null | undefined): string {
  const key = normalizeVisibility(v);
  return key ? VISIBILITY_COPY[key].label : (v ?? '');
}

/**
 * `link` / `group` / `private` → `password` (migration 0012 converted them, never to public);
 * unknown → `null`.
 */
export function normalizeVisibility(v: string | null | undefined): Visibility | null {
  if (v === 'link' || v === 'group' || v === 'private') return 'password';
  return v && (VISIBILITIES as string[]).includes(v) ? (v as Visibility) : null;
}
