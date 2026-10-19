import {
  framesFor,
  interpolate,
  nearest,
  PALETTE,
  SECTION_STATES,
  thresholds,
  type Blend,
  type Keyframe,
  type SectionId,
} from './keyframes';
import { TONE } from './palette';
import { rng } from './points';
import { pageProgress, screenSpan } from './scrollProgress';
import type { ScrollSource } from './scrollSource';
import { buildShapes } from './shapes';

const EASE = 5; // per-second approach rate towards the scroll-derived target
const DRIFT = 0.0035; // idle drift amplitude in design units: alive, but formations stay crisp
const PERSP = 0.9; // perspective strength: z = +0.5 comes 1.8× closer
const NARROW = 1024; // below this the copy stacks, so the cloud sits centred in a band
const PHONE = 720; // below this the cloud uses fewer points

declare global {
  interface Window {
    /** Dev-only: drive the cloud to a scroll progress and settle it, for inspection. */
    __snLanding?: {
      setProgress(p: number): void;
      /** Settle on screen `i` (scrolls the page there too, instantly). */
      setScreen(i: number): void;
      release(): void;
      measure(): Keyframe[];
    };
  }
}

export interface ConstellationOptions {
  /** Upper bound on points; 60% of it on phones. */
  cap: number;
  /** One static, settled frame per screen; no animation loop. */
  reduced: boolean;
  /** Where the page scrolls (the window on the web, the landing's scroller in the phone app). */
  scroll: ScrollSource;
  /** Install the `window.__snLanding` inspection hook. */
  dev?: boolean;
}

/**
 * The landing's star cloud, framework-free (the web and phone apps wrap it in a component). Each screen has a
 * formation (`keyframes.ts`) built from recognisable things (`shapes.ts`); scroll progress between two screens
 * blends them, every point easing towards its blended target and scattering halfway through the move, so the
 * cloud lands on a crisp formation as the page snaps. 2D canvas, DPR ≤ 2, paused when hidden or offscreen;
 * under reduced motion it draws one static, settled frame per screen. Returns the cleanup.
 */
export function startConstellation(
  canvas: HTMLCanvasElement,
  { cap, reduced, scroll, dev = false }: ConstellationOptions,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const count = Math.min(cap, window.innerWidth < PHONE ? Math.round(cap * 0.6) : cap);
  const shapes = buildShapes(count);

  // Per-point state, flat arrays for the hot loop.
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const dir = new Float32Array(count * 3); // scatter direction × magnitude
  const u = new Float32Array(count); // colour pick for untoned points, matched against the mix thresholds
  const size = new Float32Array(count);
  const vary = new Float32Array(count); // per-point brightness, so a formation is not flat
  const glow = new Float32Array(count); // this frame's opacity before the camera
  const phase = new Float32Array(count);
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const ss = new Float32Array(count);
  const sa = new Float32Array(count);
  const col = new Uint8Array(count);
  const rand = rng(42);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const b = rand() * Math.PI - Math.PI / 2;
    const m = 0.4 + rand() * 0.8;
    dir[i * 3] = Math.cos(a) * Math.cos(b) * m;
    dir[i * 3 + 1] = Math.sin(b) * m;
    dir[i * 3 + 2] = Math.sin(a) * Math.cos(b) * m;
    u[i] = rand();
    size[i] = 0.9 + rand() * 1.1;
    vary[i] = 0.55 + rand() * 0.45;
    glow[i] = vary[i];
    phase[i] = rand() * Math.PI * 2;
    x[i] = (rand() - 0.5) * 1.6;
    y[i] = (rand() - 0.5) * 1.6;
    z[i] = (rand() - 0.5) * 0.4;
  }

  let w = 0;
  let h = 0;
  let dpr = 1;
  let side = 0;
  let narrow = false;
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    side = Math.min(w, h) * 0.9;
    narrow = w < NARROW;
  };
  fit();

  // Keyframes come from where the screens actually are, so a formation lands exactly at its snap point.
  let frames: Keyframe[] = framesFor([{ id: 'hero', at: 0 }]);
  let range = 1; // scroll range in px, to turn a formation's lift into pixels
  const measure = () => {
    const vh = scroll.viewport();
    const sh = scroll.height();
    range = Math.max(1, sh - vh);
    const positions: { id: SectionId; at: number; until: number }[] = [];
    scroll.root.querySelectorAll<HTMLElement>('[data-sky]').forEach((el) => {
      const id = el.dataset.sky as SectionId;
      if (!(id in SECTION_STATES)) return;
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const top = scroll.offsetOf(el) - margin;
      positions.push({ id, ...screenSpan(top, el.offsetHeight + margin, sh, vh) });
    });
    frames = framesFor(positions.length ? positions : [{ id: 'hero', at: 0, until: 0 }]);
    return frames;
  };
  measure();

  let progress = pageProgress(scroll.top(), scroll.height(), scroll.viewport());
  let override: number | null = null;
  // The keyframes come from where each screen sits. Layout keeps settling after mount (fonts, the
  // trending block, the nav), so re-measure whenever the page height or viewport changes — checked
  // on every scroll as well, since body has a fixed 100% height and a ResizeObserver on it never fires.
  let measuredAt = '';
  const remeasureIfNeeded = () => {
    const secs = scroll.root.querySelectorAll<HTMLElement>('[data-sky]');
    const tops = Array.from(secs, (el) => Math.round(el.offsetTop)).join(',');
    const key = `${scroll.height()}x${scroll.viewport()}|${tops}`;
    if (key !== measuredAt) {
      measuredAt = key;
      measure();
    }
  };
  const onScroll = () => {
    remeasureIfNeeded();
    progress = pageProgress(scroll.top(), scroll.height(), scroll.viewport());
  };

  // Pointer parallax: a few pixels, eased.
  let mx = 0;
  let my = 0;
  let px = 0;
  let py = 0;
  const onMove = (e: PointerEvent) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 12;
    my = (e.clientY / window.innerHeight - 0.5) * 8;
  };

  let blend: Blend = interpolate(frames, 0);
  let yawT = 0;

  /** Move every point towards its target for this frame. `snap` jumps there in one go. */
  const step = (dt: number, snap = false) => {
    const p = override ?? progress;
    blend = reduced ? nearest(frames, p) : interpolate(frames, p);
    const A = shapes[blend.from];
    const B = shapes[blend.to];
    const Ax = A.xyz;
    const Bx = B.xyz;
    const t = blend.t;
    const spread = blend.spread;
    const sc = blend.scatter;
    const k = snap ? 1 : 1 - Math.exp(-EASE * dt);
    // Spin accumulates while a scene turns; when the next one does not, unwind to the nearest full
    // turn so flat formations face the camera instead of inheriting a skew.
    yawT += blend.spin * dt;
    if (blend.spin < 0.02) {
      const home = Math.round(yawT / (Math.PI * 2)) * Math.PI * 2;
      yawT += (home - yawT) * (snap ? 1 : k);
    }
    // Colours switch at the midpoint, where the scatter hides the change.
    const tones = t < 0.5 ? A.tone : B.tone;
    const th = thresholds(blend.mix);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const tx = (Ax[i3] + (Bx[i3] - Ax[i3]) * t) * spread + dir[i3] * sc;
      const ty = (Ax[i3 + 1] + (Bx[i3 + 1] - Ax[i3 + 1]) * t) * spread + dir[i3 + 1] * sc;
      const tz = (Ax[i3 + 2] + (Bx[i3 + 2] - Ax[i3 + 2]) * t) * spread + dir[i3 + 2] * sc;
      x[i] += (tx - x[i]) * k;
      y[i] += (ty - y[i]) * k;
      z[i] += (tz - z[i]) * k;
      let c = tones[i];
      if (c === TONE.mix) {
        c = 0;
        while (c < 4 && u[i] >= th[c]) c++;
      }
      col[i] = c;
      glow[i] = (vary[i] * (A.alpha[i] + (B.alpha[i] - A.alpha[i]) * t)) / 255;
    }
    px += (mx - px) * 0.06;
    py += (my - py) * 0.06;
  };

  /** Camera: yaw, pitch, roll, perspective, then into canvas pixels. */
  const project = (now: number) => {
    const yaw = blend.yaw + yawT;
    const cy0 = Math.cos(yaw);
    const sy0 = Math.sin(yaw);
    const cp = Math.cos(blend.pitch);
    const sp = Math.sin(blend.pitch);
    const cr = Math.cos(blend.roll);
    const sr = Math.sin(blend.roll);
    // Stacked copy leaves no free column, so on narrow screens the cloud sits centred, in the band
    // each scene reserves for it. The lift carries a formation with its screen while the page moves.
    const cx = w / 2 + (narrow ? 0 : blend.ox) * w + px;
    const cy =
      h / 2 + (narrow ? blend.oyN : blend.oy) * h + py - (reduced ? 0 : blend.lift * range);
    const S = side * (narrow ? blend.scaleN : blend.scale);
    const sizeK = blend.size * (narrow ? 0.9 : 1);
    const alphaK = blend.alpha * (narrow ? 0.85 : 1);
    const tt = now * 0.0007;
    for (let i = 0; i < count; i++) {
      const dx = Math.sin(tt + phase[i]) * DRIFT;
      const dy = Math.cos(tt * 1.3 + phase[i] * 1.3) * DRIFT;
      const x0 = x[i] + dx;
      const y0 = y[i] + dy;
      const z0 = z[i];
      const x1 = x0 * cy0 + z0 * sy0;
      const z1 = -x0 * sy0 + z0 * cy0;
      const y1 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      const f = 1 / (1 - z2 * PERSP);
      const xr = x1 * cr - y1 * sr;
      const yr = x1 * sr + y1 * cr;
      sx[i] = cx + xr * f * S;
      sy[i] = cy + yr * f * S;
      ss[i] = size[i] * sizeK * (0.7 + 0.3 * f);
      sa[i] =
        glow[i] *
        alphaK *
        (0.6 + 0.4 * Math.min(1.4, f)) *
        (0.86 + 0.14 * Math.sin(now * 0.002 + phase[i]));
    }
  };

  /** One fill colour at a time, so fillStyle changes a handful of times per frame, not thousands. */
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (let c = 0; c < PALETTE.length; c++) {
      ctx.fillStyle = PALETTE[c];
      for (let i = 0; i < count; i++) {
        if (col[i] !== c) continue;
        const px0 = sx[i];
        const py0 = sy[i];
        if (px0 < -8 || py0 < -8 || px0 > w + 8 || py0 > h + 8) continue;
        const s = ss[i];
        ctx.globalAlpha = sa[i];
        ctx.fillRect(px0 - s / 2, py0 - s / 2, s, s);
        if ((i & 15) === 0) {
          // Every 16th point carries a soft halo so the cloud reads as luminous, not dusty.
          ctx.globalAlpha = sa[i] * 0.16;
          ctx.fillRect(px0 - s * 1.5, py0 - s * 1.5, s * 3, s * 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  const settle = () => {
    step(0, true);
    project(0);
    draw();
  };

  const devHook = () => {
    if (!dev) return;
    window.__snLanding = {
      setProgress(p) {
        override = p;
        measure();
        settle();
      },
      setScreen(i) {
        const f = measure()[Math.max(0, Math.min(frames.length - 1, i))];
        scroll.scrollTo(f.at * range);
        progress = f.at;
        override = f.at;
        settle();
      },
      release() {
        override = null;
      },
      measure,
    };
  };

  if (reduced) {
    // A static frame per screen: no timers, it redraws only when the page scrolls or resizes.
    let pending = 0;
    const redraw = () => {
      pending = 0;
      onScroll();
      settle();
    };
    const onScrollStatic = () => {
      if (!pending) pending = requestAnimationFrame(redraw);
    };
    settle();
    const ro = new ResizeObserver(() => {
      fit();
      measure();
      redraw();
    });
    ro.observe(
      scroll.resizeTarget === document.documentElement ? document.body : scroll.resizeTarget,
    );
    scroll.target.addEventListener('scroll', onScrollStatic, { passive: true });
    devHook();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(pending);
      scroll.target.removeEventListener('scroll', onScrollStatic);
      if (dev) delete window.__snLanding;
    };
  }

  let raf = 0;
  let running = false;
  let visible = true;
  let last = 0;
  let frameNo = 0;
  const tick = (t: number) => {
    if (!running) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    // belt and braces: re-check the screens' positions twice a second in case layout moved silently
    if (++frameNo % 30 === 0) onScroll();
    step(dt);
    project(t);
    draw();
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    },
    { threshold: 0.02 },
  );
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => {
    fit();
    measuredAt = '';
    onScroll();
  };
  window.addEventListener('resize', onResize);
  // Screens arrive late (the trending block waits on a request): re-measure when the page grows.
  const ro = new ResizeObserver(() => {
    measuredAt = '';
    onScroll();
  });
  // observe the screens themselves (body is pinned at 100% height and never reports a change)
  scroll.root.querySelectorAll<HTMLElement>('[data-sky]').forEach((el) => ro.observe(el));
  ro.observe(scroll.resizeTarget);
  scroll.target.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  devHook();

  // One frame right away so a throttled tab still shows the field before rAF runs.
  project(0);
  draw();
  start();

  return () => {
    stop();
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    scroll.target.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onMove);
    if (dev) delete window.__snLanding;
  };
}
