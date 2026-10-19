/** Rows in their new order after moving `id` to `index` (clamped); the same array when the move is a no-op. */
export function moveRow<T extends { id: string }>(rows: T[], id: string, index: number): T[] {
  const from = rows.findIndex((r) => r.id === id);
  const to = Math.max(0, Math.min(rows.length - 1, index));
  if (from < 0 || from === to) return rows;
  const next = rows.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}
