import type { Category } from '../../api/types';
import { buildCategoryTree, categoryPath, flattenCategories } from '../categoryTree';

const tree = {
  items: [
    {
      id: 't',
      name: '技术',
      slug: 'tech',
      order: 1,
      children: [
        { id: 'be', name: '后端', slug: 'backend', order: 2 },
        { id: 'fe', name: '前端', slug: 'frontend', order: 1 },
      ],
    },
    { id: 'r', name: '读书', slug: 'reading', order: 2, children: [] },
  ],
};

describe('flattenCategories', () => {
  it('flattens the two-level response depth-first, children ordered and tagged with parent_id', () => {
    const flat = flattenCategories(tree);
    expect(flat.map((c) => c.id)).toEqual(['t', 'fe', 'be', 'r']);
    expect(flat.find((c) => c.id === 'fe')?.parent_id).toBe('t');
    expect(flat.find((c) => c.id === 't')?.children).toBeUndefined();
  });
  it('passes a legacy flat array through, sorted by order', () => {
    const legacy: Category[] = [
      { id: 'b', name: 'B', slug: 'b', order: 2 },
      { id: 'a', name: 'A', slug: 'a', order: 1 },
    ];
    expect(flattenCategories(legacy).map((c) => c.id)).toEqual(['a', 'b']);
    expect(flattenCategories(undefined)).toEqual([]);
  });
  it('groups a `?flat=1` list that already carries parent_id', () => {
    const flat: Category[] = [
      { id: 'fe', name: '前端', slug: 'frontend', order: 1, parent_id: 't' },
      { id: 't', name: '技术', slug: 'tech', order: 1 },
    ];
    expect(flattenCategories(flat).map((c) => c.id)).toEqual(['t', 'fe']);
  });
});

describe('buildCategoryTree', () => {
  it('rebuilds parents with children and keeps orphans selectable', () => {
    const flat = flattenCategories(tree);
    const nodes = buildCategoryTree([
      ...flat,
      { id: 'x', name: '孤儿', slug: 'x', order: 9, parent_id: 'gone' },
    ]);
    expect(nodes.map((n) => n.id)).toEqual(['t', 'r', 'x']);
    expect(nodes[0].children.map((c) => c.id)).toEqual(['fe', 'be']);
  });
});

describe('categoryPath', () => {
  it('prefixes a child with its parent', () => {
    const flat = flattenCategories(tree);
    expect(categoryPath(flat, 'fe')).toBe('技术 / 前端');
    expect(categoryPath(flat, 't')).toBe('技术');
    expect(categoryPath(flat, 'nope')).toBe('');
  });
});
