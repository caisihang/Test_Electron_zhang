// 收支分类仓储（两级：一级 parent_id 为空）
import { queryAll, queryOne, update } from '../database'
import type { Category, CategoryNode, Direction } from '@/types/models'

/** 分类原始列表 */
export function listCategories(direction?: Direction | ''): Category[] {
  if (direction) {
    return queryAll<Category>('SELECT * FROM categories WHERE direction = ? ORDER BY sort_order ASC, id ASC', [
      direction,
    ])
  }
  return queryAll<Category>('SELECT * FROM categories ORDER BY direction ASC, sort_order ASC, id ASC')
}

/** 构建分类树 */
export function buildCategoryTree(direction?: Direction | ''): CategoryNode[] {
  const rows = listCategories(direction)
  const nodes = new Map<number, CategoryNode>()
  rows.forEach((row) => nodes.set(row.id, { ...row, children: [] }))

  const roots: CategoryNode[] = []
  nodes.forEach((node) => {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/** 新增分类 */
export function createCategory(input: { parent_id: number | null; name: string; direction: Direction }): number {
  const sortOrder =
    (queryOne<{ v: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) AS v FROM categories
       WHERE direction = ? AND ${input.parent_id ? 'parent_id = ?' : 'parent_id IS NULL'}`,
      input.parent_id ? [input.direction, input.parent_id] : [input.direction],
    )?.v ?? 0) + 1
  return update('INSERT INTO categories (parent_id, name, direction, sort_order) VALUES (?, ?, ?, ?)', [
    input.parent_id,
    input.name.trim(),
    input.direction,
    sortOrder,
  ])
}

/** 更新分类名称 / 排序 */
export function updateCategory(id: number, input: { name: string; sort_order: number }): void {
  update('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?', [input.name.trim(), input.sort_order, id])
}

/** 删除分类：有子分类或被流水使用时禁止 */
export function deleteCategory(id: number): void {
  const children = queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ?', [id])?.c ?? 0
  if (children > 0) throw new Error('请先删除该分类下的二级分类')

  const category = queryOne<Category>('SELECT * FROM categories WHERE id = ?', [id])
  if (!category) return
  const used =
    queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM transactions WHERE (category_l1 = ? OR category_l2 = ?) AND deleted_at IS NULL',
      [category.name, category.name],
    )?.c ?? 0
  if (used > 0) throw new Error('该分类已被流水使用，无法删除')

  update('DELETE FROM categories WHERE id = ?', [id])
}
