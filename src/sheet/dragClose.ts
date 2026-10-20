/** Pointer travel of a sheet being dragged down by its handle. */
export interface SheetDrag {
  /** Downward distance from where the drag started (px; negative = pulled up). */
  dy: number;
  /** Downward speed at release (px per ms). */
  velocity: number;
  /** The sheet's height (px). */
  height: number;
}

/** Released far enough (a third of the sheet, at most 160px) or flicked down: the sheet closes. */
export function shouldDragClose({ dy, velocity, height }: SheetDrag): boolean {
  if (dy <= 0) return false;
  const far = Math.min(160, Math.max(64, height * 0.3));
  return dy >= far || (velocity > 0.5 && dy > 24);
}

/** How far the sheet follows the finger: 1:1 downwards, a little resistance upwards. */
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : -Math.min(24, Math.sqrt(-dy) * 2);
}
