/**
 * Keep the caret visible above the keyboard toolbar (SPEC-mobile §5.3). iOS scrolls the caret into the
 * visual viewport by panning, but knows nothing about our docked toolbar, so the last line hides behind it;
 * Android does not pan at all once the layout viewport resized. We scroll the editor's own scroller instead.
 */
export interface CaretFit {
  /** Caret rect, viewport coordinates (`Range.getBoundingClientRect()` or the editor's `coordsAtPos`). */
  caretTop: number;
  caretBottom: number;
  /** Visible band for text: below the nav bar, above the toolbar (viewport coordinates). */
  visibleTop: number;
  visibleBottom: number;
  /** Breathing room kept between the caret and the toolbar / nav bar. */
  margin?: number;
}

/** How far to scroll the editor scroller (positive = down) so the caret sits inside the visible band. 0 when it does. */
export function caretScrollDelta({
  caretTop,
  caretBottom,
  visibleTop,
  visibleBottom,
  margin = 12,
}: CaretFit): number {
  const lowest = visibleBottom - margin;
  const highest = visibleTop + margin;
  if (caretBottom > lowest) return Math.ceil(caretBottom - lowest);
  if (caretTop < highest) return Math.floor(caretTop - highest);
  return 0;
}
