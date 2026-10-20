import { INFO_KIND_LABEL, type InfographicSpec, type QuoteSpec } from './cards';
import { wrapText } from '../cover/fitText';
import { COVER_FONT, generateCover, type CoverStyle } from '../cover/generateCover';

/**
 * Our own templates for 信息图卡 (canvas → PNG): 1080 px wide — a phone screen at 3× — and as tall as the
 * content. Colours and type follow 辰记: brand purple, the system sans, antd's text greys. A quiet 「AI 生成」
 * mark sits in the footer, as on generated covers.
 */

export const CARD_THEME = {
  brand: '#6918b4',
  brand2: '#6a5ef0',
  amber: '#f5a524',
  ink: '#1f1f1f',
  ink2: '#595959',
  muted: '#8c8c8c',
  tint: '#f6f0fc',
  line: '#ece6f4',
  paper: '#ffffff',
};

const W = 1080;
const PAD = 72;

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${COVER_FONT}`;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrapped lines at a weight / size (measured with the real font). */
function lines(ctx: Ctx, text: string, width: number, weight: number, size: number): string[] {
  setFont(ctx, weight, size);
  return wrapText(text, width, size, (t) => ctx.measureText(t).width);
}

/** Draws `ls` from `y` (top), returns the y below them. */
function drawLines(ctx: Ctx, ls: string[], x: number, y: number, weight: number, size: number, color: string, lh = 1.5, draw = true) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ls.forEach((l, i) => draw && ctx.fillText(l, x, y + i * size * lh + (size * (lh - 1)) / 2));
  return y + ls.length * size * lh;
}

/** Lays out (and, with `draw`, paints) the card; returns its height. */
function layout(ctx: Ctx, spec: InfographicSpec, draw: boolean): number {
  const T = CARD_THEME;
  const inner = W - PAD * 2;
  let y = 0;
  if (draw) {
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, T.brand);
    band.addColorStop(1, T.brand2);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 12);
  }
  y = 12 + 60;
  // kind tag
  setFont(ctx, 600, 26);
  const tag = INFO_KIND_LABEL[spec.kind];
  const tagW = ctx.measureText(tag).width + 36;
  if (draw) {
    ctx.fillStyle = T.tint;
    rr(ctx, PAD, y, tagW, 46, 23);
    ctx.fill();
    ctx.fillStyle = T.brand;
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, PAD + 18, y + 24);
  }
  y += 46 + 26;
  y = drawLines(ctx, lines(ctx, spec.title, inner, 700, 52), PAD, y, 700, 52, T.ink, 1.3, draw);
  y += 44;

  if (spec.kind === 'compare' && spec.columns && spec.rows?.length) {
    const dimW = 200;
    const colW = (inner - dimW - 24) / 2;
    const xs = [PAD, PAD + dimW + 12, PAD + dimW + 24 + colW];
    const colors = [T.brand, T.amber];
    spec.columns.forEach((c, k) => {
      if (draw) {
        ctx.fillStyle = colors[k]!;
        rr(ctx, xs[k + 1]!, y, colW, 64, 14);
        ctx.fill();
        setFont(ctx, 700, 30);
        ctx.fillStyle = k === 0 ? '#fff' : '#4a3000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(c, xs[k + 1]! + colW / 2, y + 33);
        ctx.textAlign = 'left';
      }
    });
    y += 64 + 16;
    spec.rows.forEach((row, r) => {
      const cells = [lines(ctx, row[0], dimW - 8, 600, 28), lines(ctx, row[1], colW - 40, 400, 28), lines(ctx, row[2], colW - 40, 400, 28)];
      const h = Math.max(...cells.map((c) => c.length)) * 28 * 1.5 + 40;
      if (draw) {
        if (r % 2 === 0) {
          ctx.fillStyle = '#faf8fd';
          rr(ctx, PAD - 12, y, inner + 24, h, 14);
          ctx.fill();
        }
        drawLines(ctx, cells[0]!, xs[0]!, y + 20, 600, 28, T.ink2);
        drawLines(ctx, cells[1]!, xs[1]! + 20, y + 20, 400, 28, T.ink);
        drawLines(ctx, cells[2]!, xs[2]! + 20, y + 20, 400, 28, T.ink);
      }
      y += h + 8;
    });
  } else {
    const n = spec.items.length;
    spec.items.forEach((it, k) => {
      const textX = spec.kind === 'list' ? PAD + 108 : PAD + 104;
      const width = W - PAD - textX - (spec.kind === 'list' ? 32 : 0);
      const tl = it.title ? lines(ctx, it.title, width, 700, 34) : [];
      const bl = it.text ? lines(ctx, it.text, width, 400, 29) : [];
      const contentH = tl.length * 34 * 1.4 + (tl.length && bl.length ? 8 : 0) + bl.length * 29 * 1.55;
      if (spec.kind === 'list') {
        const h = Math.max(contentH + 56, 120);
        if (draw) {
          ctx.fillStyle = T.tint;
          rr(ctx, PAD, y, inner, h, 20);
          ctx.fill();
          ctx.fillStyle = T.brand;
          ctx.beginPath();
          ctx.arc(PAD + 54, y + 58, 26, 0, Math.PI * 2);
          ctx.fill();
          setFont(ctx, 700, 28);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), PAD + 54, y + 59);
          ctx.textAlign = 'left';
          let ty = drawLines(ctx, tl, textX, y + 28, 700, 34, T.ink, 1.4);
          if (tl.length && bl.length) ty += 8;
          drawLines(ctx, bl, textX, ty, 400, 29, T.ink2, 1.55);
        }
        y += h + 20;
      } else {
        const h = Math.max(contentH, 64) + (k < n - 1 ? 44 : 8);
        const cx = PAD + 34;
        if (draw) {
          if (k < n - 1) {
            ctx.strokeStyle = spec.kind === 'flow' ? 'rgba(105, 24, 180, 0.28)' : T.line;
            ctx.lineWidth = spec.kind === 'flow' ? 4 : 6;
            if (spec.kind === 'flow') ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(cx, y + 72);
            ctx.lineTo(cx, y + h + 4);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (spec.kind === 'flow') {
            const g = ctx.createLinearGradient(cx - 34, y, cx + 34, y + 68);
            g.addColorStop(0, T.brand);
            g.addColorStop(1, T.brand2);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, y + 34, 34, 0, Math.PI * 2);
            ctx.fill();
            setFont(ctx, 700, 30);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(k + 1), cx, y + 35);
            ctx.textAlign = 'left';
          } else {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = T.brand;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, y + 26, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          let ty = drawLines(ctx, tl, textX, y + 6, 700, 34, spec.kind === 'timeline' ? T.brand : T.ink, 1.4);
          if (tl.length && bl.length) ty += 8;
          drawLines(ctx, bl, textX, ty, 400, 29, T.ink2, 1.55);
        }
        y += h;
      }
    });
  }

  y += 40;
  if (draw) {
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    setFont(ctx, 400, 24);
    ctx.fillStyle = T.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText('辰记 StarNote', PAD, y + 44);
    ctx.textAlign = 'right';
    ctx.fillText('AI 生成', W - PAD, y + 44);
    ctx.textAlign = 'left';
  }
  return y + 88;
}

export function renderInfographic(spec: InfographicSpec): HTMLCanvasElement {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('当前浏览器不支持 Canvas');
  const h = Math.ceil(layout(probe, spec, false));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = CARD_THEME.paper;
  ctx.fillRect(0, 0, W, h);
  layout(ctx, spec, true);
  return canvas;
}

function toFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('图片导出失败'))), 'image/png'),
  );
}

export function infographicFile(spec: InfographicSpec): Promise<File> {
  return toFile(renderInfographic(spec), `infographic-${spec.kind}.png`);
}

/** 金句卡: the cover generator's looks with the sentence as the title. */
export async function quoteCardFile(spec: QuoteSpec, opts: { author?: string; seed: string; style?: CoverStyle }): Promise<File> {
  const blob = await generateCover({
    title: `“${spec.quote.replace(/^[“"]|[”"]$/g, '')}”`,
    category: '金句',
    author: opts.author,
    style: opts.style ?? 'gradient',
    seed: opts.seed,
    size: 'card',
  });
  return new File([blob], 'quote-card.png', { type: 'image/png' });
}
