/**
 * Keyboard geometry from `window.visualViewport`, shared by the web app's phone layout and starnote-mobile.
 *
 * Two platform models, one formula (SPEC-mobile §5.2):
 * - iOS Safari / WKWebView: the layout viewport keeps its height; the visual viewport shrinks to what is
 *   above the keyboard and may be panned down (`offsetTop > 0`) to keep the caret in view.
 * - Android Chrome with `interactive-widget=resizes-content`, Android WebView (`adjustResize`) and X5: the
 *   layout viewport itself shrinks (`innerHeight` drops); `offsetTop` stays 0 unless the page is pinch-zoomed.
 */
export interface ViewportMetrics {
  /** `window.innerHeight`: the layout viewport. */
  innerHeight: number;
  /** `visualViewport.height`: what is visible above the on-screen keyboard. */
  vvHeight: number;
  /** `visualViewport.offsetTop`: how far the visual viewport is panned inside the layout one. */
  vvOffsetTop: number;
}

/** Below this the shrink is browser chrome (URL bar, find bar) moving, not a keyboard. */
export const KEYBOARD_MIN = 120;

/** Height the keyboard covers at the bottom of the layout viewport (0 when closed, or when the layout viewport resized). */
export function keyboardInset({ innerHeight, vvHeight, vvOffsetTop }: ViewportMetrics): number {
  const inset = innerHeight - (vvHeight + vvOffsetTop);
  return inset > 0 ? Math.round(inset) : 0;
}

/**
 * Whether a keyboard is up. On a resizing platform the inset is 0, so compare with the tallest layout
 * height seen in this orientation (`baseline`) as well.
 */
export function keyboardOpen(m: ViewportMetrics, baseline = m.innerHeight): boolean {
  if (keyboardInset(m) >= KEYBOARD_MIN) return true;
  return baseline - m.vvHeight >= KEYBOARD_MIN;
}

/**
 * `top` (layout-viewport px, for a `position: fixed; top: 0` bar moved with `translateY`) that pins a bar of
 * `barHeight` to the bottom edge of the visible area: right above the keyboard when it is open, at the
 * bottom of the screen when it is not. Never above the visible top.
 */
export function keyboardBarTop(m: ViewportMetrics, barHeight: number): number {
  const bottom = m.vvOffsetTop + m.vvHeight;
  return Math.max(m.vvOffsetTop, Math.round(bottom - barHeight));
}

/** Read the live metrics; without `visualViewport` (Android < 7 WebView, old X5) the layout viewport stands in. */
export function readViewport(win: Window = window): ViewportMetrics {
  const vv = win.visualViewport;
  return {
    innerHeight: win.innerHeight,
    vvHeight: vv ? vv.height : win.innerHeight,
    vvOffsetTop: vv ? vv.offsetTop : 0,
  };
}

/** Orientation bucket for the per-orientation baseline (rotation changes the full height). */
export function orientationOf(width: number, height: number): 'portrait' | 'landscape' {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Remembers the tallest layout height per orientation, so a resizing platform (Android) can still tell
 * "keyboard up" from "nothing happened" after the layout viewport shrank.
 */
export class ViewportBaseline {
  private tallest: Record<'portrait' | 'landscape', number> = { portrait: 0, landscape: 0 };

  update(width: number, m: ViewportMetrics): number {
    const o = orientationOf(width, Math.max(m.innerHeight, m.vvHeight));
    const h = Math.max(m.innerHeight, m.vvHeight);
    if (h > this.tallest[o]) this.tallest[o] = h;
    return this.tallest[o];
  }
}
