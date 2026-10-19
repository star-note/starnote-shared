import { type CoverSize, lookIndex, paintCover } from '../generateCover';
import { COVER_STYLES, GRADIENT_PALETTES, VARIANTS } from '../styles';

describe('classic cover looks', () => {
  it('every style has at least eight distinct looks', () => {
    for (const s of COVER_STYLES) expect(VARIANTS[s.key].length, s.key).toBeGreaterThanOrEqual(8);
    expect(COVER_STYLES.map((s) => s.key)).toEqual([
      'gradient',
      'poster',
      'tech',
      'paper',
      'geometry',
    ]);
  });

  it('换一张 walks a per-note order: eight rounds show eight different looks, never the same twice in a row', () => {
    for (const s of COVER_STYLES) {
      for (const note of ['n1', 'n2', 'abc']) {
        const looks = Array.from({ length: 8 }, (_, r) => lookIndex(s.key, `${note}:${r}`, r));
        expect(new Set(looks).size, `${s.key}/${note}`).toBe(8);
        for (let r = 1; r < 24; r++)
          expect(lookIndex(s.key, note, r)).not.toBe(lookIndex(s.key, note, r - 1));
      }
    }
    // the order differs between notes
    expect(Array.from({ length: 8 }, (_, r) => lookIndex('poster', 'n1', r))).not.toEqual(
      Array.from({ length: 8 }, (_, r) => lookIndex('poster', 'n2', r)),
    );
  });

  it('渐变 opens with the demo golden palette for every note, then cycles the rest without repeats', () => {
    expect(GRADIENT_PALETTES[0]).toEqual(['#fa541c', '#faad14']);
    expect(GRADIENT_PALETTES.length).toBeGreaterThanOrEqual(8);
    for (const note of ['n1', 'n2', 'x9', 'abc']) {
      expect(lookIndex('gradient', note, 0)).toBe(0);
      const seq = Array.from({ length: 27 }, (_, r) => lookIndex('gradient', note, r));
      expect(new Set(seq.slice(0, 9)).size).toBe(9);
      for (let r = 1; r < seq.length; r++) expect(seq[r]).not.toBe(seq[r - 1]);
    }
  });
});

/** A canvas stand-in that records text draws; glyphs are 1em wide (CJK) / 0.56em (other). */
function fakeCtx(w: number, h: number) {
  const draws: { text: string; x: number; y: number; size: number; width: number }[] = [];
  let size = 10;
  let scale = 1;
  const ctx = {
    canvas: { width: w, height: h },
    set font(f: string) {
      size = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);
    },
    get font() {
      return `${size}px`;
    },
    measureText: (t: string) => ({
      width: Array.from(t).reduce(
        (s, c) => s + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? size : size * 0.56),
        0,
      ),
    }),
    fillText(text: string, x: number, y: number) {
      draws.push({
        text,
        x: x * scale,
        y: y * scale,
        size: size * scale,
        width: ctx.measureText(text).width * scale,
      });
    },
    save() {},
    restore() {},
    scale(k: number) {
      scale *= k;
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {},
    arc() {},
    fill() {},
    fillRect() {},
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    textBaseline: '',
    textAlign: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws };
}

describe('渐变 layout', () => {
  const SIZES: Record<CoverSize, [number, number]> = {
    card: [1200, 800],
    og: [1200, 630],
    wide: [900, 383],
    square: [1080, 1080],
    portrait: [1080, 1440],
  };
  const TITLES = [
    '雨夜',
    '给写作工具接入大模型：Prompt、流式与配额三件事',
    '从零开始搭建一个支持多平台一键发布、离线优先、端到端加密的写作工具：架构设计与踩坑复盘（上篇）',
  ];
  it('keeps kicker, title and footer inside the frame, in order, never overlapping, in every size', () => {
    for (const [size, [w, h]] of Object.entries(SIZES) as [CoverSize, [number, number]][]) {
      for (const title of TITLES) {
        const { ctx, draws } = fakeCtx(w, h);
        paintCover(ctx, {
          title,
          category: 'AI 与大模型',
          blogName: '星辰的博客',
          handle: 'demo',
          style: 'gradient',
          seed: 'n:0',
          size,
        });
        const where = `${size}/${title.slice(0, 6)}`;
        for (const d of draws) {
          expect(d.x, where).toBeGreaterThanOrEqual(0);
          expect(d.x + d.width, `${where} ${d.text}`).toBeLessThanOrEqual(w + 0.5);
          expect(d.y - d.size, where).toBeGreaterThanOrEqual(0);
          expect(d.y, where).toBeLessThanOrEqual(h);
        }
        const footer = draws.find((d) => d.text.includes('@demo'))!;
        expect(footer.text).toBe('星辰的博客 · @demo');
        const kicker = draws.filter(
          (d) => d.text.length === 1 && d.y < footer.y && d.size < footer.size * 1.3,
        );
        const titleLines = draws.filter((d) => d !== footer && !kicker.includes(d));
        expect(titleLines.length, where).toBeGreaterThan(0);
        expect(titleLines.length, where).toBeLessThanOrEqual(3);
        const kickerBottom = Math.max(...kicker.map((d) => d.y));
        for (const l of titleLines) {
          expect(l.y - l.size * 0.9, `${where} title below kicker`).toBeGreaterThan(kickerBottom);
          expect(l.y, `${where} title above footer`).toBeLessThan(footer.y - footer.size);
        }
      }
    }
  });
});
