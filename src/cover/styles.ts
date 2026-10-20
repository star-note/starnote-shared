/**
 * Grounds for the classic generated covers. Each style owns eight genuinely different looks
 * (composition, palette family, motif and type treatment), and 换一张 steps through them in a
 * per-note shuffled order, so two consecutive covers never look like the same picture nudged.
 * Within a look the seeded RNG still varies placement, so a reroll that comes back to a look
 * months later is not pixel-identical — but the same seed always paints the same image.
 *
 * Structure borrowed from open-source OG/cover generators — a typographic layer over swappable
 * backgrounds, the title auto-sized into a reserved zone (vercel/og-image, rajasegar/coverview,
 * xsukax GitHub Social Image Generator). The code here is our own.
 */
import type { Rng } from './rng';

export type CoverStyle = 'gradient' | 'poster' | 'tech' | 'paper' | 'geometry';

export const COVER_STYLES: { key: CoverStyle; label: string; hint: string }[] = [
  { key: 'gradient', label: '渐变', hint: '斜向渐变 · 柔光圆 · 大号白字（博客示例文章的封面）' },
  { key: 'poster', label: '海报', hint: '瑞士网格 · 包豪斯 · 大数字 · 剪纸 · 孔版印刷' },
  { key: 'tech', label: '科技', hint: '终端 · 渐变网格 · 线框 · 电路 · 光轨' },
  { key: 'paper', label: '纸张', hint: '牛皮纸 · 和纸胶带 · 方格本 · 凸版 · 水彩' },
  { key: 'geometry', label: '几何', hint: '孟菲斯 · 等距 · 同心圆 · Truchet · 半调' },
];

/** What the text layer needs to know about the painted ground. */
export interface Ground {
  /** Title colour. */
  ink: string;
  /** Author / small text colour. */
  sub: string;
  /** Category chip fill, and its text colour. */
  chip: string;
  chipInk?: string;
  /** `pill` rounded chip · `bar` square label · `text` tracked text with a rule. */
  chipStyle?: 'pill' | 'bar' | 'text';
  /** Horizontal text zone as fractions of the width. */
  box: [number, number];
  /** Where the title block sits vertically, and whether lines are centred. */
  align: 'bottom' | 'top' | 'center';
  center?: boolean;
  font?: 'sans' | 'serif' | 'mono';
  weight?: number;
  /** Short rule under the title, or none. */
  rule?: string | null;
  /** Largest title size (px on the design frame). */
  titleMax?: number;
}

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng) => Ground;

/* ------------------------------------------------------------------ helpers */

export function hex(c: string, alpha: number): string {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Film grain: deterministic per-pixel luminance jitter, drawn once over the finished ground. */
export function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  amount = 10,
  alpha = 0.5,
) {
  const t = ctx.getTransform();
  const pw = Math.ceil(w * t.a);
  const ph = Math.ceil(h * t.d);
  const img = ctx.getImageData(0, 0, pw, ph);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount * 2 * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function fill(ctx: CanvasRenderingContext2D, color: string | CanvasGradient, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

const DARK = '#16121c';
const WHITE = '#ffffff';
const light = (sub = 'rgba(255,255,255,0.78)') => ({ ink: WHITE, sub });
const dark = (sub = 'rgba(22,18,28,0.66)') => ({ ink: DARK, sub });

/* ------------------------------------------------------------------- poster */

const POSTER: Painter[] = [
  // Swiss grid: paper white, black hairline grid, one red square, black type on the grid.
  (ctx, w, h, rng) => {
    fill(ctx, '#f2f0eb', w, h);
    const cols = 12;
    ctx.strokeStyle = 'rgba(22,18,28,0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < cols; i++) {
      const x = (w / cols) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    const red = rng.pick(['#e2231a', '#0047ab', '#ff5a1f']);
    const s = (w / cols) * rng.int(3, 4);
    ctx.fillStyle = red;
    ctx.fillRect(w - s - w / cols, h * 0.08, s, s);
    ctx.fillStyle = DARK;
    ctx.fillRect(w - (w / cols) * 2, h * 0.08 + s + 24, (w / cols) * 1, 10);
    return {
      ...dark(),
      chip: red,
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.62],
      align: 'bottom',
      weight: 800,
      rule: null,
      titleMax: 80,
    };
  },
  // Bauhaus: cream, a red disc, yellow triangle and blue quarter circle on the right.
  (ctx, w, h, rng) => {
    fill(ctx, '#efe6d2', w, h);
    const x0 = w * 0.6;
    const u = Math.min(h * 0.42, (w - x0) * 0.48);
    circle(ctx, x0 + u * 1.1, h * 0.3, u * 0.8, '#d6372a');
    poly(
      ctx,
      [
        [x0 + u * 0.2, h - 40],
        [x0 + u * 1.3, h - 40],
        [x0 + u * 0.75, h - 40 - u * 1.1],
      ],
      '#f2b31c',
    );
    ctx.fillStyle = '#1d4e9e';
    ctx.beginPath();
    ctx.moveTo(w - 40, h - 40);
    ctx.arc(w - 40, h - 40, u * 1.05, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = DARK;
    ctx.fillRect(x0 - 10, h * 0.62 + rng.range(-20, 20), u * 2.2, 8);
    return {
      ...dark(),
      chip: '#1d4e9e',
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.58],
      align: 'top',
      weight: 900,
      rule: '#d6372a',
      titleMax: 74,
    };
  },
  // Big number: saturated field with an enormous outlined numeral behind the title.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      { bg: '#0f5c4c', fg: '#bfe3c0' },
      { bg: '#3b1d8f', fg: '#c7b6ff' },
      { bg: '#b0122f', fg: '#ffc2c9' },
    ]);
    fill(ctx, p.bg, w, h);
    const n = String(rng.int(1, 99)).padStart(2, '0');
    ctx.font = `900 ${h * 0.95}px "Helvetica Neue", Arial, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = hex(p.fg, 0.42);
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(n).width;
    ctx.strokeText(n, w - tw - w * 0.02, h * 0.9);
    return {
      ...light(),
      chip: p.fg,
      chipInk: p.bg,
      chipStyle: 'bar',
      box: [0, 0.6],
      align: 'bottom',
      weight: 800,
      rule: p.fg,
      titleMax: 78,
    };
  },
  // Duotone stripes: bold diagonal bands across the right two-fifths.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      { bg: '#1b2a4a', a: '#ff6f91', b: '#ffd1dc' },
      { bg: '#26201a', a: '#f2a541', b: '#f7e3c3' },
    ]);
    fill(ctx, p.bg, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(w * 0.6, 0, w * 0.4, h);
    ctx.clip();
    const band = rng.range(38, 56);
    for (let i = -h; i < w + h; i += band * 2) {
      poly(
        ctx,
        [
          [i, h],
          [i + band, h],
          [i + band + h, 0],
          [i + h, 0],
        ],
        i % (band * 4) === 0 ? p.a : p.b,
      );
    }
    ctx.restore();
    return {
      ...light(),
      chip: p.a,
      chipInk: p.bg,
      chipStyle: 'pill',
      box: [0, 0.58],
      align: 'center',
      weight: 800,
      rule: p.a,
      titleMax: 72,
    };
  },
  // Cut paper: three wavy paper layers rising from the bottom, each with a soft shadow.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#f7efe2', '#7fc6b6', '#2a8c86', '#164e57'],
      ['#fdf1ec', '#f4a99a', '#e0645c', '#7a2338'],
    ]);
    fill(ctx, p[0], w, h);
    for (let k = 0; k < 3; k++) {
      const base = h * (0.62 + k * 0.12);
      const amp = h * rng.range(0.04, 0.08);
      const f = rng.range(1.2, 2.4);
      const ph = rng.range(0, 6);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = -4;
      ctx.fillStyle = p[k + 1];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12)
        ctx.lineTo(x, base + Math.sin((x / w) * Math.PI * f + ph) * amp);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return {
      ...dark(),
      chip: p[3],
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.82],
      align: 'top',
      weight: 800,
      rule: null,
      titleMax: 76,
    };
  },
  // Risograph: translucent pink and blue shapes overprinting on cream, with grain.
  (ctx, w, h, rng) => {
    fill(ctx, '#f6f0e4', w, h);
    ctx.globalCompositeOperation = 'multiply';
    circle(ctx, w * rng.range(0.68, 0.78), h * 0.42, h * 0.38, '#ff48b0');
    ctx.fillStyle = '#0078bf';
    ctx.fillRect(w * rng.range(0.62, 0.7), h * 0.2, h * 0.42, h * 0.62);
    circle(ctx, w * 0.9, h * 0.75, h * 0.2, '#ffe800');
    ctx.globalCompositeOperation = 'source-over';
    grain(ctx, w, h, rng, 22, 0.6);
    return {
      ...dark(),
      chip: '#ff48b0',
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.58],
      align: 'bottom',
      weight: 900,
      rule: '#0078bf',
      titleMax: 76,
    };
  },
  // Sunburst: rays from a low corner in mustard and rust.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#f2b134', '#e07a1f', '#3b1f0e'],
      ['#7ec8e3', '#3a86c8', '#0c2340'],
    ]);
    fill(ctx, p[0], w, h);
    const cx = w * 0.82;
    const cy = h * 1.05;
    const n = 28;
    for (let i = 0; i < n; i += 2) {
      const a0 = Math.PI + (Math.PI * i) / n;
      const a1 = Math.PI + (Math.PI * (i + 1)) / n;
      poly(
        ctx,
        [
          [cx, cy],
          [cx + Math.cos(a0) * w * 2, cy + Math.sin(a0) * w * 2],
          [cx + Math.cos(a1) * w * 2, cy + Math.sin(a1) * w * 2],
        ],
        p[1],
      );
    }
    const g = ctx.createLinearGradient(0, 0, w * 0.7, 0);
    g.addColorStop(0, hex(p[2], 0.88));
    g.addColorStop(1, hex(p[2], 0));
    fill(ctx, g, w, h);
    circle(ctx, cx, cy, h * 0.28, p[2]);
    return {
      ...light(),
      chip: p[0],
      chipInk: p[2],
      chipStyle: 'pill',
      box: [0, 0.6],
      align: 'center',
      weight: 800,
      rule: p[0],
      titleMax: 74,
    };
  },
  // Split field: black left, a colour field right, a white disc riding the seam.
  (ctx, w, h, rng) => {
    const right = rng.pick(['#2f5bea', '#00a37a', '#ff5e3a', '#8c52ff']);
    fill(ctx, '#121212', w, h);
    ctx.fillStyle = right;
    ctx.fillRect(w * 0.62, 0, w * 0.38, h);
    circle(ctx, w * 0.62, h * rng.range(0.32, 0.6), h * 0.17, '#f5f5f0');
    return {
      ...light(),
      chip: right,
      chipInk: WHITE,
      chipStyle: 'text',
      box: [0, 0.48],
      align: 'bottom',
      weight: 700,
      rule: null,
      titleMax: 70,
    };
  },
];

/* --------------------------------------------------------------------- tech */

const TECH: Painter[] = [
  // Perspective grid on deep violet, glow on the horizon.
  (ctx, w, h, rng) => {
    fill(ctx, '#120b2a', w, h);
    const horizon = h * 0.55;
    const glow = ctx.createRadialGradient(w * 0.72, horizon, 0, w * 0.72, horizon, h * 0.8);
    glow.addColorStop(0, 'rgba(255,92,205,0.55)');
    glow.addColorStop(1, 'rgba(255,92,205,0)');
    fill(ctx, glow, w, h);
    ctx.strokeStyle = 'rgba(160,120,255,0.45)';
    ctx.lineWidth = 1.2;
    const vx = w * 0.72;
    for (let i = -24; i <= 24; i++) {
      ctx.beginPath();
      ctx.moveTo(vx, horizon);
      ctx.lineTo(vx + (i / 24) * w * 1.6, h);
      ctx.stroke();
    }
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const y = horizon + (h - horizon) * t * t;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    circle(ctx, vx, horizon - h * 0.12, h * rng.range(0.1, 0.14), '#ff9be0');
    return {
      ...light(),
      chip: 'rgba(160,120,255,0.3)',
      chipStyle: 'pill',
      box: [0, 0.55],
      align: 'top',
      weight: 800,
      rule: '#ff5ccd',
      titleMax: 70,
    };
  },
  // Terminal on pale mint: faint monospace log lines, a block cursor, mono title.
  (ctx, w, h, rng) => {
    fill(ctx, '#e9f5ee', w, h);
    ctx.font = '400 18px "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(21,94,62,0.22)';
    const words = [
      'const',
      'await',
      'deploy',
      'build',
      'ok',
      '200',
      'fetch',
      'cache',
      'render',
      'diff',
      'commit',
      'push',
    ];
    for (let y = 40; y < h; y += 30) {
      let line = `${String(Math.round(y / 30)).padStart(3, '0')}  `;
      for (let i = 0; i < rng.int(3, 9); i++) line += `${rng.pick(words)} `;
      ctx.fillText(line, w * 0.6, y);
    }
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(w * 0.6, h * 0.82, 16, 28);
    return {
      ink: '#0b3b26',
      sub: 'rgba(11,59,38,0.7)',
      chip: '#16a34a',
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.58],
      align: 'center',
      font: 'mono',
      weight: 700,
      rule: null,
      titleMax: 62,
    };
  },
  // Gradient mesh: pastel blobs blended, dark ink.
  (ctx, w, h, rng) => {
    fill(ctx, '#f6f1ff', w, h);
    const blobs = rng.pick([
      ['#ffb8a1', '#b8a6ff', '#8fe3e0'],
      ['#ffd27a', '#ff9ec7', '#9ac8ff'],
    ]);
    blobs.forEach((c, i) => {
      const x = w * (0.45 + i * 0.22 + rng.range(-0.05, 0.05));
      const y = h * rng.range(0.2, 0.8);
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.85);
      g.addColorStop(0, hex(c, 0.95));
      g.addColorStop(1, hex(c, 0));
      fill(ctx, g, w, h);
    });
    grain(ctx, w, h, rng, 8, 0.6);
    return {
      ...dark(),
      chip: 'rgba(22,18,28,0.08)',
      chipStyle: 'pill',
      box: [0, 0.62],
      align: 'bottom',
      weight: 800,
      rule: '#6918b4',
      titleMax: 72,
    };
  },
  // Wireframe globe on white: meridians and parallels in cobalt.
  (ctx, w, h, rng) => {
    fill(ctx, '#fbfbfd', w, h);
    const r = h * 0.42;
    const cx = w - r - w * 0.04;
    const cy = h * 0.5;
    ctx.strokeStyle = '#2f5bea';
    ctx.lineWidth = 1.4;
    const tilt = rng.range(-0.3, 0.3);
    for (let i = 0; i < 12; i++) {
      const rx = Math.abs(Math.cos((Math.PI * i) / 12)) * r;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, r, tilt, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let j = -4; j <= 4; j++) {
      const y = (j / 5) * r;
      const rr = Math.sqrt(Math.max(0, r * r - y * y));
      ctx.beginPath();
      ctx.ellipse(cx, cy + y, rr, rr * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    circle(ctx, cx + r * 0.6, cy - r * 0.55, 8, '#ff5a1f');
    return {
      ...dark(),
      chip: '#2f5bea',
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.5],
      align: 'center',
      weight: 800,
      rule: '#2f5bea',
      titleMax: 70,
    };
  },
  // Circuit board: deep green with copper traces and pads.
  (ctx, w, h, rng) => {
    fill(ctx, '#0d3b2e', w, h);
    ctx.strokeStyle = '#d9a35b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = w * rng.range(0.6, 1);
      let y = h * rng.range(0, 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        if (rng.chance(0.5)) x = Math.min(w, Math.max(w * 0.6, x + rng.range(-120, 120)));
        else y += rng.range(-120, 120);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      circle(ctx, x, y, 6, '#f2c27b');
      circle(ctx, x, y, 2.5, '#0d3b2e');
    }
    const g = ctx.createLinearGradient(0, 0, w * 0.6, 0);
    g.addColorStop(0, '#0d3b2e');
    g.addColorStop(1, 'rgba(13,59,46,0)');
    fill(ctx, g, w, h);
    return {
      ...light('rgba(242,194,123,0.9)'),
      chip: '#d9a35b',
      chipInk: '#0d3b2e',
      chipStyle: 'bar',
      box: [0, 0.6],
      align: 'bottom',
      font: 'mono',
      weight: 700,
      rule: '#d9a35b',
      titleMax: 64,
    };
  },
  // Light trails: navy with glowing cyan/magenta curves streaming across.
  (ctx, w, h, rng) => {
    fill(ctx, '#070b24', w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const c = i % 2 ? '#00e5ff' : '#ff2bd6';
      ctx.strokeStyle = hex(c, rng.range(0.25, 0.7));
      ctx.lineWidth = rng.range(1, 4);
      ctx.beginPath();
      const y0 = h * rng.range(0.1, 1.1);
      ctx.moveTo(w * 0.3, y0);
      ctx.bezierCurveTo(
        w * 0.6,
        y0 - h * rng.range(0.2, 0.6),
        w * 0.8,
        h * rng.range(0, 0.8),
        w * 1.1,
        h * rng.range(-0.1, 0.6),
      );
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, w * 0.6, 0);
    g.addColorStop(0, '#070b24');
    g.addColorStop(1, 'rgba(7,11,36,0)');
    fill(ctx, g, w, h);
    return {
      ...light(),
      chip: 'rgba(0,229,255,0.2)',
      chipStyle: 'pill',
      box: [0, 0.58],
      align: 'bottom',
      weight: 800,
      rule: '#00e5ff',
      titleMax: 72,
    };
  },
  // Dot matrix: white field, dots swelling along a wave, one orange accent row.
  (ctx, w, h, rng) => {
    fill(ctx, '#ffffff', w, h);
    const step = 22;
    const ph = rng.range(0, 6);
    for (let y = step; y < h; y += step) {
      for (let x = w * 0.5; x < w; x += step) {
        const v = (Math.sin((x / w) * 6 + ph) + Math.cos((y / h) * 5 + ph)) * 0.25 + 0.5;
        circle(
          ctx,
          x,
          y,
          v * step * 0.45,
          Math.abs(y - h * 0.6) < step / 2 ? '#ff5a1f' : '#16121c',
        );
      }
    }
    return {
      ...dark(),
      chip: '#ff5a1f',
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.48],
      align: 'top',
      weight: 900,
      rule: null,
      titleMax: 66,
    };
  },
  // Spectrum bars on cobalt: an equaliser in white and yellow.
  (ctx, w, h, rng) => {
    fill(ctx, '#1f3bd6', w, h);
    const n = 22;
    const bw = (w * 0.42) / n;
    for (let i = 0; i < n; i++) {
      const bh = h * (0.15 + 0.7 * Math.abs(Math.sin(i * 0.55 + rng.range(0, 0.6))));
      ctx.fillStyle = i % 5 === 2 ? '#ffd500' : 'rgba(255,255,255,0.9)';
      ctx.fillRect(w * 0.55 + i * bw, h - bh, bw * 0.6, bh);
    }
    return {
      ...light(),
      chip: '#ffd500',
      chipInk: '#1f3bd6',
      chipStyle: 'pill',
      box: [0, 0.54],
      align: 'top',
      weight: 800,
      rule: '#ffd500',
      titleMax: 70,
    };
  },
];

/* -------------------------------------------------------------------- paper */

function fibres(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  color: string,
  n = 220,
  a = 0.08,
) {
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const len = rng.range(8, 60);
    const ang = rng.range(0, Math.PI);
    ctx.strokeStyle = hex(color, rng.range(a * 0.3, a));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

const PAPER: Painter[] = [
  // Kraft: brown fibre paper, a rubber-stamp circle and a twine line.
  (ctx, w, h, rng) => {
    fill(ctx, '#c49a6c', w, h);
    fibres(ctx, w, h, rng, '#5a3a1a', 420, 0.16);
    grain(ctx, w, h, rng, 14, 0.7);
    ctx.strokeStyle = 'rgba(160,28,28,0.75)';
    ctx.lineWidth = 6;
    const cx = w * 0.82;
    const cy = h * 0.32;
    ctx.beginPath();
    ctx.arc(cx, cy, h * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, h * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#efe2c8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h);
    ctx.bezierCurveTo(w * 0.7, h * 0.6, w * 0.9, h * 0.9, w, h * 0.55);
    ctx.stroke();
    return {
      ink: '#2e1a0b',
      sub: 'rgba(46,26,11,0.72)',
      chip: 'rgba(46,26,11,0.12)',
      chipStyle: 'text',
      box: [0, 0.66],
      align: 'bottom',
      font: 'serif',
      weight: 900,
      rule: '#a01c1c',
      titleMax: 74,
    };
  },
  // Washi: warm white with two strips of patterned tape across the corners.
  (ctx, w, h, rng) => {
    fill(ctx, '#faf6ee', w, h);
    fibres(ctx, w, h, rng, '#8a7b63', 160, 0.06);
    const tapes = rng.pick([
      ['#e98ca0', '#f6c6cf'],
      ['#7bb3a8', '#cfe6df'],
      ['#e7b04a', '#f6e1ad'],
    ]);
    const strip = (x: number, y: number, a: number, c: string[]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = c[1];
      ctx.fillRect(-170, -26, 340, 52);
      ctx.fillStyle = c[0];
      for (let i = -170; i < 170; i += 22) ctx.fillRect(i, -26, 10, 52);
      ctx.restore();
    };
    strip(w - 120, 70, 0.6, tapes);
    strip(w * 0.78, h - 60, -0.35, tapes);
    return {
      ...dark(),
      chip: tapes[0],
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.7],
      align: 'center',
      font: 'serif',
      weight: 900,
      rule: null,
      titleMax: 74,
    };
  },
  // Grid notebook: blue grid, red margin, mono title.
  (ctx, w, h) => {
    fill(ctx, '#fdfdfb', w, h);
    ctx.strokeStyle = 'rgba(64,120,200,0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,40,60,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 0);
    ctx.lineTo(56, h);
    ctx.stroke();
    return {
      ink: '#1b2a4a',
      sub: 'rgba(27,42,74,0.7)',
      chip: '#ffe36e',
      chipInk: '#1b2a4a',
      chipStyle: 'bar',
      box: [0.02, 0.86],
      align: 'center',
      font: 'mono',
      weight: 700,
      rule: null,
      titleMax: 64,
    };
  },
  // Letterpress: cream card, double border, ornament rules, centred red-and-black serif.
  (ctx, w, h, rng) => {
    fill(ctx, '#f4ecdc', w, h);
    grain(ctx, w, h, rng, 9, 0.7);
    const ink = rng.pick(['#b3261e', '#1f3a5f', '#2d5a3a']);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, w - 56, h - 56);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.fillStyle = ink;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(w / 2 + i * 18, 64, i === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return {
      ink: '#1d1612',
      sub: hex(ink, 0.9),
      chip: 'rgba(0,0,0,0)',
      chipInk: ink,
      chipStyle: 'text',
      box: [0.08, 0.92],
      align: 'center',
      center: true,
      font: 'serif',
      weight: 900,
      rule: ink,
      titleMax: 70,
    };
  },
  // Torn paper: a coloured sheet torn across, a white sheet on top carrying the title.
  (ctx, w, h, rng) => {
    const c = rng.pick(['#2a6f97', '#d1495b', '#2f7d4f', '#6d4bc2']);
    fill(ctx, c, w, h);
    fibres(ctx, w, h, rng, '#000000', 120, 0.08);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fbf8f1';
    // A sheet torn top to bottom, covering the left two-thirds.
    const edge = w * rng.range(0.64, 0.7);
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(edge, -10);
    for (let y = 0; y <= h + 10; y += 8)
      ctx.lineTo(edge + rng.range(-8, 8) + Math.sin(y / 60) * 10, y);
    ctx.lineTo(-10, h + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return {
      ...dark(),
      chip: c,
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.62],
      align: 'center',
      font: 'serif',
      weight: 900,
      rule: c,
      titleMax: 72,
    };
  },
  // Watercolour: soft irregular washes in two colours on white.
  (ctx, w, h, rng) => {
    fill(ctx, '#fefcf8', w, h);
    const pal = rng.pick([
      ['#7fb2e5', '#f2a7b8'],
      ['#9ad1b0', '#f6cf7a'],
      ['#b7a3e6', '#8fd3e8'],
    ]);
    for (let k = 0; k < 2; k++) {
      const cx = w * (0.62 + k * 0.2);
      const cy = h * (0.35 + k * 0.3);
      for (let i = 0; i < 26; i++) {
        const r = h * rng.range(0.12, 0.3);
        const g = ctx.createRadialGradient(
          cx + rng.range(-90, 90),
          cy + rng.range(-70, 70),
          0,
          cx,
          cy,
          r,
        );
        g.addColorStop(0, hex(pal[k], 0.12));
        g.addColorStop(1, hex(pal[k], 0));
        fill(ctx, g, w, h);
      }
    }
    grain(ctx, w, h, rng, 7, 0.6);
    return {
      ...dark(),
      chip: hex(pal[0], 0.25),
      chipStyle: 'pill',
      box: [0, 0.6],
      align: 'center',
      font: 'serif',
      weight: 900,
      rule: pal[1],
      titleMax: 74,
    };
  },
  // Legal pad: yellow ruled paper with a red double margin.
  (ctx, w, h) => {
    fill(ctx, '#fbf0a6', w, h);
    ctx.strokeStyle = 'rgba(70,110,190,0.45)';
    ctx.lineWidth = 1.2;
    for (let y = 70; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,50,50,0.7)';
    ctx.beginPath();
    ctx.moveTo(52, 0);
    ctx.lineTo(52, h);
    ctx.moveTo(58, 0);
    ctx.lineTo(58, h);
    ctx.stroke();
    return {
      ink: '#1a2340',
      sub: 'rgba(26,35,64,0.7)',
      chip: 'rgba(210,50,50,0.85)',
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0.02, 0.86],
      align: 'center',
      weight: 800,
      rule: null,
      titleMax: 70,
    };
  },
  // Airmail: white sheet framed by red and blue diagonal stripes.
  (ctx, w, h) => {
    fill(ctx, '#ffffff', w, h);
    const band = 26;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(band, band, w - band * 2, h - band * 2);
    ctx.clip('evenodd');
    for (let i = -h; i < w + h; i += 36) {
      poly(
        ctx,
        [
          [i, 0],
          [i + 18, 0],
          [i + 18 + h, h],
          [i + h, h],
        ],
        (i / 36) % 2 === 0 ? '#d72631' : '#1f4e9e',
      );
    }
    ctx.restore();
    return {
      ink: '#1f2a44',
      sub: 'rgba(31,42,68,0.7)',
      chip: '#1f4e9e',
      chipInk: WHITE,
      chipStyle: 'text',
      box: [0.03, 0.9],
      align: 'center',
      font: 'serif',
      weight: 900,
      rule: '#d72631',
      titleMax: 70,
    };
  },
];

/* ----------------------------------------------------------------- geometry */

const GEOMETRY: Painter[] = [
  // Memphis: pastel ground, squiggles, dots, triangles, zigzags.
  (ctx, w, h, rng) => {
    fill(ctx, '#fff4e6', w, h);
    const cs = ['#ff6b9a', '#2ec4b6', '#ffbf00', '#5b5fef', '#16121c'];
    for (let i = 0; i < 18; i++) {
      const x = w * rng.range(0.55, 1);
      const y = h * rng.range(0, 1);
      const c = rng.pick(cs);
      const kind = rng.int(0, 3);
      if (kind === 0) circle(ctx, x, y, rng.range(8, 26), c);
      else if (kind === 1)
        poly(
          ctx,
          [
            [x, y],
            [x + 40, y + 10],
            [x + 10, y + 46],
          ],
          c,
        );
      else {
        ctx.strokeStyle = c;
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++)
          ctx[k ? 'lineTo' : 'moveTo'](
            x + k * 16,
            y + (kind === 2 ? (k % 2) * 16 : Math.sin(k) * 12),
          );
        ctx.stroke();
      }
    }
    return {
      ...dark(),
      chip: '#5b5fef',
      chipInk: WHITE,
      chipStyle: 'pill',
      box: [0, 0.56],
      align: 'center',
      weight: 900,
      rule: '#ff6b9a',
      titleMax: 72,
    };
  },
  // Isometric cubes: three-tone rhombi tiling the right side.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#f4f1ea', '#e2d9c5', '#c9b892', '#8c7a55'],
      ['#e8eef7', '#b9c8e6', '#7f97cf', '#3c5aa6'],
    ]);
    fill(ctx, p[0], w, h);
    const s = 46;
    const dx = s * Math.sqrt(3);
    for (let row = -1; row * s * 1.5 < h + s; row++) {
      for (let col = 0; col * dx < w * 0.55 + dx; col++) {
        const x = w * 0.5 + col * dx + (row % 2 ? dx / 2 : 0);
        const y = row * s * 1.5;
        poly(
          ctx,
          [
            [x, y],
            [x + dx / 2, y + s / 2],
            [x, y + s],
            [x - dx / 2, y + s / 2],
          ],
          p[1],
        );
        poly(
          ctx,
          [
            [x - dx / 2, y + s / 2],
            [x, y + s],
            [x, y + s * 2],
            [x - dx / 2, y + s * 1.5],
          ],
          p[2],
        );
        poly(
          ctx,
          [
            [x + dx / 2, y + s / 2],
            [x, y + s],
            [x, y + s * 2],
            [x + dx / 2, y + s * 1.5],
          ],
          p[3],
        );
      }
    }
    const g = ctx.createLinearGradient(w * 0.42, 0, w * 0.62, 0);
    g.addColorStop(0, p[0]);
    g.addColorStop(1, hex(p[0], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w * 0.62, h);
    return {
      ...dark(),
      chip: p[3],
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.52],
      align: 'bottom',
      weight: 800,
      rule: p[3],
      titleMax: 70,
    };
  },
  // Concentric rings from an off-frame centre.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#0f3d3e', '#e8b04a'],
      ['#2b124c', '#ff8fab'],
    ]);
    fill(ctx, p[0], w, h);
    const cx = w * 1.02;
    const cy = h * rng.range(0.4, 0.7);
    for (let r = h * 1.4; r > 0; r -= 34) {
      ctx.strokeStyle = hex(p[1], 0.85);
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, 0, w * 0.65, 0);
    g.addColorStop(0, p[0]);
    g.addColorStop(0.7, hex(p[0], 0.9));
    g.addColorStop(1, hex(p[0], 0));
    fill(ctx, g, w, h);
    return {
      ...light(),
      chip: p[1],
      chipInk: p[0],
      chipStyle: 'pill',
      box: [0, 0.56],
      align: 'center',
      weight: 800,
      rule: p[1],
      titleMax: 72,
    };
  },
  // Truchet tiles: quarter-circle arcs on a grid.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#fefae0', '#bc6c25'],
      ['#edf6f9', '#006d77'],
    ]);
    fill(ctx, p[0], w, h);
    const s = 48;
    ctx.strokeStyle = p[1];
    ctx.lineWidth = 7;
    for (let y = 0; y < h; y += s) {
      for (let x = w * 0.55; x < w; x += s) {
        ctx.beginPath();
        if (rng.chance(0.5)) {
          ctx.arc(x, y, s / 2, 0, Math.PI / 2);
          ctx.moveTo(x + s, y + s / 2);
          ctx.arc(x + s, y + s, s / 2, -Math.PI / 2, Math.PI, true);
        } else {
          ctx.arc(x + s, y, s / 2, Math.PI / 2, Math.PI);
          ctx.moveTo(x + s / 2, y + s);
          ctx.arc(x, y + s, s / 2, 0, -Math.PI / 2, true);
        }
        ctx.stroke();
      }
    }
    return {
      ...dark(),
      chip: p[1],
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.5],
      align: 'top',
      weight: 900,
      rule: null,
      titleMax: 66,
    };
  },
  // Halftone: a dot gradient sweeping in from the right.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#ffe14d', '#16121c'],
      ['#ff5a5f', '#2b0f12'],
      ['#e6f0ff', '#1d4ed8'],
    ]);
    fill(ctx, p[0], w, h);
    const step = 18;
    const fx = w * rng.range(0.85, 1.05);
    const fy = h * rng.range(0.2, 0.8);
    for (let y = 0; y < h + step; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
        const d = Math.hypot(x - fx, y - fy) / (w * 0.55);
        const r = (1 - d) * step * 0.55;
        if (r > 0.6) circle(ctx, x, y, r, p[1]);
      }
    }
    return {
      ink: p[1],
      sub: hex(p[1], 0.7),
      chip: p[1],
      chipInk: p[0],
      chipStyle: 'bar',
      box: [0, 0.5],
      align: 'bottom',
      weight: 900,
      rule: null,
      titleMax: 72,
    };
  },
  // Colour field: soft-edged stacked rectangles, Rothko-like.
  (ctx, w, h, rng) => {
    const p = rng.pick([
      ['#3b1d1d', '#c2462f', '#e8a24a'],
      ['#13233f', '#3e6fb0', '#9cc3e6'],
      ['#1e2b1e', '#4f7a3a', '#d8c76a'],
    ]);
    fill(ctx, p[0], w, h);
    ctx.save();
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = p[1];
    ctx.fillRect(w * 0.56, h * 0.08, w * 0.38, h * 0.46);
    ctx.fillStyle = p[2];
    ctx.fillRect(w * 0.56, h * 0.6, w * 0.38, h * 0.3);
    ctx.restore();
    grain(ctx, w, h, rng, 10, 0.6);
    return {
      ...light(),
      chip: hex(p[2], 0.3),
      chipStyle: 'pill',
      box: [0, 0.54],
      align: 'center',
      font: 'serif',
      weight: 900,
      rule: p[2],
      titleMax: 70,
    };
  },
  // Op-art stripes: parallel lines bent by a bulge.
  (ctx, w, h, rng) => {
    fill(ctx, '#f5f5f0', w, h);
    ctx.strokeStyle = '#16121c';
    ctx.lineWidth = 5;
    const bx = w * 0.8;
    const by = h * rng.range(0.35, 0.65);
    for (let y = -20; y < h + 20; y += 16) {
      ctx.beginPath();
      for (let x = w * 0.55; x <= w; x += 8) {
        const d = Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * (h * 0.22) ** 2));
        const yy = y + (y - by) * d * 0.6;
        if (x === w * 0.55) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    circle(ctx, bx, by, 18, '#ff2d55');
    return {
      ...dark(),
      chip: '#ff2d55',
      chipInk: WHITE,
      chipStyle: 'bar',
      box: [0, 0.52],
      align: 'bottom',
      weight: 900,
      rule: null,
      titleMax: 70,
    };
  },
  // Low-poly triangles: a mosaic in one colour family.
  (ctx, w, h, rng) => {
    const base = rng.pick([
      [230, 80, 60],
      [150, 120, 230],
      [40, 170, 150],
    ]);
    fill(ctx, `rgb(${base[0] * 0.35},${base[1] * 0.35},${base[2] * 0.35})`, w, h);
    const s = 70;
    for (let y = 0; y < h + s; y += s) {
      for (let x = w * 0.5; x < w + s; x += s) {
        for (const tri of [
          [
            [x, y],
            [x + s, y],
            [x, y + s],
          ],
          [
            [x + s, y],
            [x + s, y + s],
            [x, y + s],
          ],
        ]) {
          const k = rng.range(0.5, 1.15);
          poly(
            ctx,
            tri,
            `rgb(${Math.min(255, base[0] * k)},${Math.min(255, base[1] * k)},${Math.min(255, base[2] * k)})`,
          );
        }
      }
    }
    const g = ctx.createLinearGradient(w * 0.45, 0, w * 0.62, 0);
    const c0 = `rgb(${base[0] * 0.35},${base[1] * 0.35},${base[2] * 0.35})`;
    g.addColorStop(0, c0);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.45, 0, w * 0.17, h);
    return {
      ...light(),
      chip: 'rgba(255,255,255,0.18)',
      chipStyle: 'pill',
      box: [0, 0.5],
      align: 'center',
      weight: 800,
      rule: `rgb(${base.join(',')})`,
      titleMax: 70,
    };
  },
];

/* ----------------------------------------------------------------- gradient */

/**
 * The demo-post look (starnote-api `demo_assets.cover_svg`): a diagonal two-colour gradient, five big soft
 * white circles, a letter-spaced kicker, a large bold white title and a 「博客名 · @handle」 footer. The golden
 * orange → amber pair is the demo's own and always comes first; the blue → purple pair is the demo's other one.
 */
export const GRADIENT_PALETTES: [string, string][] = [
  ['#fa541c', '#faad14'], // golden orange → amber (demo)
  ['#1677ff', '#722ed1'], // blue → purple (demo)
  ['#6918b4', '#c285ff'], // brand purple
  ['#08979c', '#36cfc9'], // teal
  ['#c41d7f', '#ff85c0'], // rose
  ['#002c8c', '#2f7bff'], // deep blue
  ['#237804', '#7cc53f'], // green
  ['#eb2f96', '#ff9c6e'], // sunset pink
  ['#1f1f1f', '#5c5c66'], // graphite
];

function gradientPainter([a, b]: [string, string]): Painter {
  return (ctx, w, h, rng) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    fill(ctx, g, w, h);
    // Same recipe as the SVG: five white circles, radius 80–260 (scaled to the frame), 4–10 % opacity.
    const k = Math.min(w, h) / 630;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng.range(0.04, 0.1).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(rng.range(0, w), rng.range(0, h), rng.range(80, 260) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    return {
      ink: WHITE,
      sub: 'rgba(255,255,255,0.8)',
      chip: 'rgba(0,0,0,0)',
      chipStyle: 'text',
      box: [0, 1],
      align: 'center',
      weight: 700,
      rule: null,
      titleMax: 72,
    };
  };
}

export const VARIANTS: Record<CoverStyle, Painter[]> = {
  gradient: GRADIENT_PALETTES.map(gradientPainter),
  poster: POSTER,
  tech: TECH,
  paper: PAPER,
  geometry: GEOMETRY,
};
