import { caretScrollDelta } from '../caret';
import {
  KEYBOARD_MIN,
  keyboardBarTop,
  keyboardInset,
  keyboardOpen,
  orientationOf,
  readViewport,
  ViewportBaseline,
} from '../viewport';

describe('keyboard bar position (visualViewport math)', () => {
  it('rests at the bottom of the screen when no keyboard is up', () => {
    const m = { innerHeight: 844, vvHeight: 844, vvOffsetTop: 0 };
    expect(keyboardInset(m)).toBe(0);
    expect(keyboardOpen(m)).toBe(false);
    expect(keyboardBarTop(m, 44)).toBe(800);
  });

  it('iOS: the visual viewport shrinks, the layout viewport does not', () => {
    const m = { innerHeight: 844, vvHeight: 508, vvOffsetTop: 0 };
    expect(keyboardInset(m)).toBe(336);
    expect(keyboardOpen(m)).toBe(true);
    expect(keyboardBarTop(m, 44)).toBe(464);
  });

  it('iOS: follows a visual viewport that Safari panned down to show the caret', () => {
    const m = { innerHeight: 844, vvHeight: 508, vvOffsetTop: 120 };
    expect(keyboardInset(m)).toBe(216);
    expect(keyboardBarTop(m, 44)).toBe(584);
  });

  it('ignores a small shrink (URL bar collapsing) as no keyboard', () => {
    expect(
      keyboardOpen({ innerHeight: 844, vvHeight: 844 - KEYBOARD_MIN + 1, vvOffsetTop: 0 }),
    ).toBe(false);
  });

  it('Android (resizes-content / adjustResize): the layout viewport itself shrinks; the baseline tells it is a keyboard', () => {
    const android = { innerHeight: 500, vvHeight: 500, vvOffsetTop: 0 };
    expect(keyboardInset(android)).toBe(0);
    expect(keyboardBarTop(android, 44)).toBe(456);
    expect(keyboardOpen(android)).toBe(false);
    expect(keyboardOpen(android, 915)).toBe(true);
  });

  it('Android Chrome 108+ default (resizes-visual) behaves like iOS', () => {
    const m = { innerHeight: 915, vvHeight: 600, vvOffsetTop: 0 };
    expect(keyboardOpen(m)).toBe(true);
    expect(keyboardBarTop(m, 44)).toBe(556);
  });

  it('recomputes after a rotation and never goes above the visible top', () => {
    const landscape = { innerHeight: 390, vvHeight: 160, vvOffsetTop: 0 };
    expect(keyboardBarTop(landscape, 44)).toBe(116);
    expect(keyboardBarTop({ innerHeight: 390, vvHeight: 30, vvOffsetTop: 10 }, 44)).toBe(10);
  });

  it('keeps one baseline per orientation', () => {
    const b = new ViewportBaseline();
    expect(b.update(412, { innerHeight: 915, vvHeight: 915, vvOffsetTop: 0 })).toBe(915);
    expect(b.update(412, { innerHeight: 560, vvHeight: 560, vvOffsetTop: 0 })).toBe(915);
    // rotate: the portrait baseline must not leak into landscape
    expect(b.update(915, { innerHeight: 412, vvHeight: 412, vvOffsetTop: 0 })).toBe(412);
    expect(keyboardOpen({ innerHeight: 200, vvHeight: 200, vvOffsetTop: 0 }, 412)).toBe(true);
    expect(orientationOf(915, 412)).toBe('landscape');
  });

  it('reads window.visualViewport, falling back to the layout viewport', () => {
    const win = {
      innerHeight: 700,
      visualViewport: { height: 400, offsetTop: 12 },
    } as unknown as Window;
    expect(readViewport(win)).toEqual({ innerHeight: 700, vvHeight: 400, vvOffsetTop: 12 });
    expect(readViewport({ innerHeight: 700, visualViewport: null } as unknown as Window)).toEqual({
      innerHeight: 700,
      vvHeight: 700,
      vvOffsetTop: 0,
    });
  });
});

describe('caret kept above the toolbar', () => {
  const band = { visibleTop: 56, visibleBottom: 464 };

  it('does nothing when the caret is inside the band', () => {
    expect(caretScrollDelta({ caretTop: 200, caretBottom: 222, ...band })).toBe(0);
  });

  it('scrolls down when the caret hides behind the toolbar', () => {
    expect(caretScrollDelta({ caretTop: 450, caretBottom: 472, ...band })).toBe(20);
  });

  it('scrolls up when the caret went under the nav bar', () => {
    expect(caretScrollDelta({ caretTop: 40, caretBottom: 62, ...band })).toBe(-28);
  });
});
