import type { BlogCategory } from '../api/types';

/** Form value: an existing category by id, or a new one by name (created on publish). */
export type BlogCategoryValue = { id: string } | { name: string };

const NEW = '__new__:';
export const BLOG_CATEGORY_NAME_MAX = 40;

export interface BlogCategoryOption {
  value: string;
  label: string;
  /** The row this option stands for; absent on the "新建" option. */
  category?: BlogCategory;
  create?: boolean;
}

export function encodeBlogCategoryValue(
  v: BlogCategoryValue | null | undefined,
): string | undefined {
  if (!v) return undefined;
  return 'id' in v ? v.id : `${NEW}${v.name}`;
}

export function decodeBlogCategoryValue(
  s: string | null | undefined,
): BlogCategoryValue | undefined {
  if (!s) return undefined;
  return s.startsWith(NEW) ? { name: s.slice(NEW.length) } : { id: s };
}

/** `name` of a value, looked up for ids; `undefined` when the id is unknown. */
export function blogCategoryLabel(
  v: BlogCategoryValue | null | undefined,
  categories: BlogCategory[],
): string | undefined {
  if (!v) return undefined;
  return 'name' in v ? v.name : categories.find((c) => c.id === v.id)?.name;
}

/**
 * Options for the picker: the categories matching `search` (name / slug, case-insensitive), then —
 * when the typed text is not an existing name — a "新建「…」" option. Enter in the Select picks the
 * first option, so a partial match wins over creating; with no match, Enter creates.
 */
export function buildBlogCategoryOptions(
  categories: BlogCategory[],
  search: string,
  current?: BlogCategoryValue,
): BlogCategoryOption[] {
  const q = search.trim();
  const ql = q.toLowerCase();
  const rows = categories.filter(
    (c) => !ql || c.name.toLowerCase().includes(ql) || c.slug.toLowerCase().includes(ql),
  );
  const out: BlogCategoryOption[] = rows.map((c) => ({ value: c.id, label: c.name, category: c }));
  const exact = categories.some((c) => c.name.toLowerCase() === ql);
  if (q && !exact && q.length <= BLOG_CATEGORY_NAME_MAX)
    out.push({ value: `${NEW}${q}`, label: `新建「${q}」`, create: true });
  // A pending new name stays selectable (and renders its label) while the search box is empty.
  if (!q && current && 'name' in current && !categories.some((c) => c.name === current.name)) {
    out.push({ value: `${NEW}${current.name}`, label: `新建「${current.name}」`, create: true });
  }
  return out;
}
