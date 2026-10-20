/**
 * Where the landing's scroll comes from: the window on the web, a scrolling element in the phone app (whose
 * body never scrolls).
 */
export interface ScrollSource {
  /** Current scroll offset (px). */
  top(): number;
  /** Total scrollable content height (px). */
  height(): number;
  /** Visible height (px). */
  viewport(): number;
  /** An element's top in content coordinates (px). */
  offsetOf(el: HTMLElement): number;
  scrollTo(top: number): void;
  /** What emits `scroll`. */
  target: EventTarget;
  /** What to ResizeObserve besides the screens themselves. */
  resizeTarget: Element;
  /** Where the `[data-sky]` screens live. */
  root: ParentNode;
}

export function windowScroll(): ScrollSource {
  return {
    top: () => window.scrollY,
    height: () => document.documentElement.scrollHeight,
    viewport: () => window.innerHeight,
    offsetOf: (el) => el.getBoundingClientRect().top + window.scrollY,
    scrollTo: (top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }),
    target: window,
    resizeTarget: document.documentElement,
    root: document,
  };
}

export function elementScroll(el: HTMLElement): ScrollSource {
  return {
    top: () => el.scrollTop,
    height: () => el.scrollHeight,
    viewport: () => el.clientHeight,
    offsetOf: (child) =>
      child.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop,
    scrollTo: (top) => el.scrollTo({ top, behavior: 'instant' as ScrollBehavior }),
    target: el,
    resizeTarget: el,
    root: el,
  };
}
