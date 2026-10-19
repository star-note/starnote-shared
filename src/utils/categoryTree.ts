import type { Category, CategoryNode } from '../api/types';

/** `GET /categories` answers either the two-level `{items:[...children]}` shape or the legacy flat array. */
export type CategoriesResponse = { items: CategoryNode[] } | Category[];

const byOrder = (a: Category, b: Category) =>
  (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'zh-Hans-CN');

/** Depth-first flat list: each parent followed by its children (with `parent_id` set). */
export function flattenCategories(res: CategoriesResponse | undefined | null): Category[] {
  if (!res) return [];
  if (Array.isArray(res)) {
    // Legacy flat list; it may already carry parent_id (`?flat=1`) — keep it, children stay attached to parents.
    const roots = res.filter((c) => !c.parent_id).sort(byOrder);
    const kids = res.filter((c) => c.parent_id);
    if (!kids.length) return roots.map(({ children: _c, ...c }) => c);
    return roots.flatMap((r) => [
      { ...r, children: undefined },
      ...kids.filter((k) => k.parent_id === r.id).sort(byOrder),
    ]);
  }
  return (res.items ?? [])
    .slice()
    .sort(byOrder)
    .flatMap((p) => [
      { ...p, children: undefined },
      ...(p.children ?? [])
        .slice()
        .sort(byOrder)
        .map((c) => ({ ...c, parent_id: p.id })),
    ]);
}

/** Build the two-level tree back from a flat list (parents first, children under their `parent_id`). */
export function buildCategoryTree(flat: Category[]): CategoryNode[] {
  const roots = flat.filter((c) => !c.parent_id).sort(byOrder);
  const orphans = flat.filter((c) => c.parent_id && !flat.some((p) => p.id === c.parent_id));
  const nodes: CategoryNode[] = roots.map((r) => ({
    ...r,
    children: flat.filter((c) => c.parent_id === r.id).sort(byOrder),
  }));
  // A child whose parent is not in the list is still selectable: show it at the top level.
  for (const o of orphans) nodes.push({ ...o, children: [] });
  return nodes;
}

/** Breadcrumb-ish label: `技术 / 前端` for a child, `技术` for a parent. */
export function categoryPath(flat: Category[], id: string | null | undefined): string {
  if (!id) return '';
  const c = flat.find((x) => x.id === id);
  if (!c) return '';
  const p = c.parent_id ? flat.find((x) => x.id === c.parent_id) : undefined;
  return p ? `${p.name} / ${c.name}` : c.name;
}

/** Sum of `count` over a parent and its children (public blog aggregates by first level). */
export function categoryCountDeep(node: CategoryNode): number {
  return (node.count ?? 0) + node.children.reduce((a, c) => a + (c.count ?? 0), 0);
}
