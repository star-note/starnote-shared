import type { XhsCard, XhsCardKind } from '../../../api/versions';
import { xhsShareText, xhsToImageSet, xhsUnrendered } from '../imageSet';
import { INLINE_CARD_SIZES, paintXhsCard, XHS_TEMPLATES } from '../templates';

/** A canvas stand-in that records text draws; glyphs are 1em wide (CJK) / 0.56em (other). */
function fakeCtx(w: number, h: number) {
  const draws: { text: string; x: number; y: number; size: number; width: number }[] = [];
  const images: number[][] = [];
  let size = 10;
  const measure = (t: string) =>
    Array.from(t).reduce((s, c) => s + (/[\u3000-\u9fff\uff00-\uffef\u201c\u201d\u2014]/.test(c) ? size : size * 0.56), 0);
  const noop = () => {};
  const ctx = {
    canvas: { width: w, height: h },
    set font(f: string) {
      size = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);
    },
    get font() {
      return `${size}px`;
    },
    measureText: (t: string) => ({ width: measure(t) }),
    fillText(text: string, x: number, y: number) {
      draws.push({ text, x, y, size, width: measure(text) });
    },
    drawImage(...args: number[]) {
      images.push(args.slice(1));
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    textBaseline: '',
    textAlign: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws, images };
}

const LONG = '这是一段很长很长的文字，用来检查自动换行、缩小字号和省略号是否都能让文字留在卡片里面而不会溢出边界。';

const CARDS: Record<XhsCardKind, Omit<XhsCard, 'template' | 'id'>> = {
  cover: { kind: 'cover', title: '我是怎么坚持早起三年的：五个方法和一张时间表', body: LONG },
  points: { kind: 'points', title: '早起的五个方法', items: ['前一晚十一点前睡觉', LONG, '起床先喝一杯温水', '给早晨安排一件期待的事', LONG] },
  section: { kind: 'section', title: '为什么要早起', body: LONG.repeat(3) },
  quote: { kind: 'quote', title: '总结', body: '自律的本质，是让好习惯变得不费力。' },
  ending: { kind: 'ending', title: '写在最后', body: LONG, items: ['收藏这篇，用的时候翻出来', '关注我，下次更新不错过'] },
};

describe('xhs card templates', () => {
  it('has the five named templates', () => {
    expect(XHS_TEMPLATES.map((t) => t.label)).toEqual(['奶油便签', '杂志大字', '清单卡', '渐变金句', '极简黑白']);
  });

  const frames = [
    { w: 1080, h: 1440 },
    INLINE_CARD_SIZES['16:9'],
    INLINE_CARD_SIZES['4:3'],
  ];
  for (const tpl of XHS_TEMPLATES) {
    it(`${tpl.label}: every kind paints inside the frame`, () => {
      for (const f of frames) {
        for (const [kind, c] of Object.entries(CARDS)) {
          for (const withImage of [false, true]) {
            const { ctx, draws, images } = fakeCtx(f.w, f.h);
            const card = { ...c, id: 'x', template: tpl.key } as XhsCard;
            paintXhsCard(ctx, card, {
              ...f,
              index: 2,
              total: 8,
              watermark: true,
              image: withImage ? { source: {} as CanvasImageSource, width: 800, height: 600 } : null,
            });
            const where = `${tpl.key}/${kind}/${f.w}x${f.h}/${withImage}`;
            expect(draws.length, where).toBeGreaterThan(0);
            for (const d of draws) {
              expect(d.x, `${where} ${d.text}`).toBeGreaterThanOrEqual(-1);
              expect(d.x + d.width, `${where} ${d.text}`).toBeLessThanOrEqual(f.w + 1);
              expect(d.y, `${where} ${d.text}`).toBeLessThanOrEqual(f.h);
              expect(d.y - d.size * 0.9, `${where} ${d.text}`).toBeGreaterThanOrEqual(-1);
            }
            // the watermark's text line (drawn letter by letter for its tracking)
            expect(draws.map((d) => d.text).join(''), where).toContain('辰记');
            if (withImage && f.h > f.w) expect(images.length, where).toBe(1);
          }
        }
      }
    });
  }

  it('the page mark shows the position, never on the cover', () => {
    const { ctx, draws } = fakeCtx(1080, 1440);
    paintXhsCard(ctx, { ...CARDS.points, id: 'x', template: 'cream' } as XhsCard, { w: 1080, h: 1440, index: 2, total: 8 });
    expect(draws.some((d) => d.text === '3 / 8')).toBe(true);
    const cover = fakeCtx(1080, 1440);
    paintXhsCard(cover.ctx, { ...CARDS.cover, id: 'x', template: 'cream' } as XhsCard, { w: 1080, h: 1440, index: 0, total: 8 });
    expect(cover.draws.some((d) => d.text.includes('/ 8'))).toBe(false);
    expect(cover.draws.some((d) => d.text === '辰记')).toBe(false);
  });

  it('an unknown template paints as 奶油便签', () => {
    const { ctx, draws } = fakeCtx(1080, 1440);
    paintXhsCard(ctx, { ...CARDS.quote, id: 'x', template: 'nope' } as XhsCard, { w: 1080, h: 1440 });
    expect(draws.some((d) => d.text.includes('自律'))).toBe(true);
  });
});

describe('xhsToImageSet', () => {
  const content = {
    cards: [
      { id: '1', kind: 'cover', template: 'cream', title: '封面', render: { asset_hash: 'h1', url: '/api/v1/assets/h1' } },
      { id: '2', kind: 'points', template: 'cream', title: '要点' },
      { id: '3', kind: 'ending', template: 'cream', title: '结尾', render: { asset_hash: 'h3', url: '/api/v1/assets/h3' } },
    ] as XhsCard[],
    caption: '正文',
    topics: ['早起', '自律'],
  };
  it('maps rendered cards to images in order, cover first', () => {
    const set = xhsToImageSet({ title: '图集', content });
    expect(set).toEqual({
      kind: 'image-set',
      title: '图集',
      caption: '正文',
      topics: ['早起', '自律'],
      images: [
        { url: '/api/v1/assets/h1', hash: 'h1', mime: 'image/png', width: 1080, height: 1440, alt: '封面' },
        { url: '/api/v1/assets/h3', hash: 'h3', mime: 'image/png', width: 1080, height: 1440, alt: '结尾' },
      ],
    });
    expect(xhsUnrendered(content)).toBe(1);
    expect(xhsToImageSet({ title: '', content }).title).toBe('封面');
  });
  it('share text = caption + #topics', () => {
    expect(xhsShareText(content)).toBe('正文\n\n#早起 #自律');
  });
});
