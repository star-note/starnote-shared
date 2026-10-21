import { drawWatermark, QR_INK, QR_PLATE_ON_DARK, watermarkCanvas } from '../draw';
import {
  FONT_RATIO,
  formatWatermarkDate,
  MIN_CAMERA_FONT,
  MAX_QR_RATIO,
  MIN_MODULE_PX,
  MIN_SHORT_SIDE,
  QR_QUIET,
  textPlan,
  WATERMARK_DEFAULTS,
  watermarkHandle,
  watermarkLayout,
  watermarkMeta,
  watermarkPrefsOf,
} from '../layout';
import { qrPolicy, watermarkPlan } from '../plan';

const URL_ = 'https://starnote.app/@ludejun/Ab3dE7xQ';
const PHOTO = { w: 1620, h: 1080 };

describe('watermark preferences', () => {
  it('defaults: on, inset, with a QR code', () => {
    expect(WATERMARK_DEFAULTS).toEqual({ enabled: true, style: 'inset', qr: true });
    expect(watermarkPrefsOf(undefined)).toEqual(WATERMARK_DEFAULTS);
    expect(watermarkPrefsOf({ style: 'frame', qr: false })).toEqual({
      enabled: true,
      style: 'frame',
      qr: false,
    });
    expect(watermarkPrefsOf({ style: 'bogus', enabled: 'yes' })).toEqual(WATERMARK_DEFAULTS);
  });
});

describe('platform rules decide the look', () => {
  it('小红书 / 抖音 forbid QR codes and 导流: the text line, no link', () => {
    for (const p of ['xiaohongshu', 'douyin', 'zhihu', 'bilibili']) {
      const plan = watermarkPlan(p, PHOTO, WATERMARK_DEFAULTS, { url: URL_ });
      expect(plan, p).toMatchObject({
        enabled: true,
        variant: 'text',
        qr: false,
        links: false,
        reason: 'platform',
        url: null,
      });
      expect(plan.note).toBe('该平台不允许二维码');
    }
  });

  it('禁止导流 alone (简书) is enough to drop the code', () => {
    expect(watermarkPlan('jianshu', PHOTO, undefined, { url: URL_ }).variant).toBe('text');
  });

  it('other platforms get the camera strip with the code', () => {
    for (const p of ['chenji', 'wechat', 'devto', 'medium', 'x']) {
      const plan = watermarkPlan(p, PHOTO, undefined, { url: URL_ });
      expect(plan, p).toMatchObject({
        variant: 'camera',
        qr: true,
        links: true,
        reason: null,
        url: URL_,
      });
    }
  });

  it('several platforms: the strictest wins and is named', () => {
    const plan = watermarkPlan(['chenji', 'devto', 'xiaohongshu'], PHOTO, undefined, { url: URL_ });
    expect(plan.variant).toBe('text');
    expect(plan.blockedBy).toEqual(['小红书']);
    expect(plan.note).toContain('小红书');
    expect(qrPolicy(['chenji', 'medium']).allowed).toBe(true);
  });

  it('a picture whose platforms are unknown (配图) keeps to the text line', () => {
    expect(watermarkPlan(null, PHOTO, undefined, { url: URL_ })).toMatchObject({
      variant: 'text',
      reason: 'multi',
      links: false,
    });
  });

  it('inline rules work for platforms outside the registry', () => {
    expect(qrPolicy({ label: '某平台', rules: { noQrcode: true } })).toMatchObject({
      allowed: false,
      blockedBy: ['某平台'],
    });
    expect(qrPolicy({ label: '外链禁止', rules: { externalLinks: 'forbidden' } }).allowed).toBe(
      false,
    );
    expect(qrPolicy({ label: '自建', rules: { externalLinks: 'stripped' } }).allowed).toBe(true);
  });
});

describe('preferences and size', () => {
  it('off = nothing; qr off = the text line in the chosen layout', () => {
    expect(watermarkPlan('chenji', PHOTO, { enabled: false }, { url: URL_ }).enabled).toBe(false);
    expect(
      watermarkPlan('chenji', PHOTO, { qr: false, style: 'frame' }, { url: URL_ }),
    ).toMatchObject({ variant: 'text', layout: 'frame', reason: 'pref' });
  });

  it('no link to point at: the text line', () => {
    expect(watermarkPlan('chenji', PHOTO, undefined, {}).reason).toBe('no-url');
  });

  it('type below the readable size falls back to the text line; tiny pictures get nothing', () => {
    const edge = Math.ceil(MIN_CAMERA_FONT / FONT_RATIO);
    // a 3:2 cover (1200×800) still carries the short link
    expect(watermarkPlan('chenji', { w: 1200, h: 800 }, undefined, { url: URL_ }).variant).toBe(
      'camera',
    );
    expect(
      watermarkPlan('chenji', { w: edge * 1.5, h: edge - 2 }, undefined, { url: URL_ }),
    ).toMatchObject({ variant: 'text', reason: 'small' });
    expect(watermarkPlan('chenji', { w: 900, h: 600 }, undefined, { url: URL_ })).toMatchObject({
      variant: 'text',
      reason: 'small',
    });
    expect(
      watermarkPlan('chenji', { w: 400, h: MIN_SHORT_SIDE - 1 }, undefined, { url: URL_ }),
    ).toMatchObject({ enabled: false, reason: 'tiny' });
  });

  it('a long link that would not scan at this size falls back too', () => {
    const long = `${URL_}?${'x'.repeat(120)}`;
    expect(watermarkPlan('chenji', { w: 1200, h: 800 }, undefined, { url: long })).toMatchObject({
      variant: 'text',
      reason: 'small',
    });
  });
});

describe('layout from the short side', () => {
  for (const short of [600, 800, 1080, 1440, 3000]) {
    it(`short side ${short}: type 1.6–2.2 %, code 6–8 %, whole-pixel modules`, () => {
      const img = { w: Math.round(short * 1.5), h: short };
      const plan = watermarkPlan('chenji', img, undefined, { url: URL_ });
      const m = watermarkLayout(img, plan);
      expect(m.font / short).toBeGreaterThanOrEqual(0.016);
      expect(m.font / short).toBeLessThanOrEqual(0.022);
      if (plan.variant === 'camera') {
        expect(m.qr / short).toBeGreaterThanOrEqual(0.055);
        expect(m.qr / short).toBeLessThanOrEqual(MAX_QR_RATIO);
        expect(Number.isInteger(m.module)).toBe(true);
        expect(m.module).toBeGreaterThanOrEqual(MIN_MODULE_PX);
        expect(m.qr).toBe(m.module * (m.code!.size + QR_QUIET * 2));
      }
      expect(m.out).toEqual(img);
    });
  }

  it('frame grows the canvas by a band that holds the code; inset keeps the size', () => {
    const inset = watermarkLayout(PHOTO, watermarkPlan('chenji', PHOTO, undefined, { url: URL_ }));
    const frame = watermarkLayout(
      PHOTO,
      watermarkPlan('chenji', PHOTO, { style: 'frame' }, { url: URL_ }),
    );
    expect(inset.band).toBe(0);
    expect(frame.band).toBeGreaterThan(frame.qr);
    expect(frame.out).toEqual({ w: PHOTO.w, h: PHOTO.h + frame.band });
    expect(frame.midY).toBeCloseTo(PHOTO.h + frame.band / 2);
    // the inset strip stays inside the picture
    expect(inset.midY + inset.qr / 2).toBeLessThanOrEqual(PHOTO.h - inset.margin + 0.5);
  });

  it('text line clamps tiny type to the minimum', () => {
    expect(watermarkLayout({ w: 400, h: 300 }, textPlan()).font).toBe(9);
  });
});

describe('words', () => {
  it('date, item and handle', () => {
    expect(formatWatermarkDate(new Date(2026, 9, 21))).toBe('2026.10.21');
    expect(formatWatermarkDate(new Date(2026, 0, 5))).toBe('2026.01.05');
    expect(watermarkMeta('我是怎么坚持早起三年的：五个方法')).toBe('我是怎么坚持早起三年的：…');
    expect(watermarkMeta('短标题')).toBe('短标题');
    expect(watermarkHandle('@@ludejun')).toBe('@ludejun');
    expect(watermarkHandle('')).toBe('');
  });
});

/** A 2D context that records what is drawn (glyphs 1em CJK / 0.56em other). */
function recorder(w: number, h: number) {
  const texts: { text: string; x: number; y: number }[] = [];
  const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  let size = 10;
  const ctx: Record<string, unknown> = {
    canvas: { width: w, height: h },
    set font(f: string) {
      size = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);
    },
    get font() {
      return `${size}px`;
    },
    measureText: (t: string) => ({
      width: Array.from(t).reduce(
        (s, c) => s + (/[\u3000-\u9fff]/.test(c) ? size : size * 0.56),
        0,
      ),
    }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    fillRect(x: number, y: number, rw: number, rh: number) {
      rects.push({ x, y, w: rw, h: rh, fill: String(ctx.fillStyle) });
    },
    getImageData: () => {
      throw new Error('tainted');
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    drawImage: () => {},
    fillStyle: '',
    strokeStyle: '',
  };
  for (const k of [
    'save',
    'restore',
    'translate',
    'scale',
    'beginPath',
    'closePath',
    'moveTo',
    'arcTo',
    'arc',
    'fill',
    'stroke',
  ])
    ctx[k] = () => {};
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    texts,
    rects,
    joined: () => texts.map((t) => t.text).join(''),
  };
}

describe('drawWatermark', () => {
  it('camera strip: brand, handle, item, date and the code, all inside the picture', () => {
    const plan = watermarkPlan('chenji', PHOTO, undefined, { url: URL_ });
    const r = recorder(PHOTO.w, PHOTO.h);
    const m = drawWatermark(r.ctx, PHOTO, {
      plan,
      handle: 'ludejun',
      meta: '写在十月的一封信',
      date: new Date(2026, 9, 21),
    });
    const all = r.joined();
    for (const s of ['STARNOTE', '@ludejun', '写在十月的一封信', '2026.10.21'])
      expect(all).toContain(s);
    for (const t of r.texts) {
      expect(t.x).toBeGreaterThanOrEqual(m.margin - 0.5);
      expect(t.x).toBeLessThan(PHOTO.w - m.margin - m.qr);
      expect(t.y).toBeLessThan(PHOTO.h);
    }
    // the code's dark modules: whole pixels, inside the plate
    const mods = r.rects.filter((x) => x.w === m.module && x.h === m.module);
    expect(mods.length).toBeGreaterThan(m.code!.size * 2);
    for (const q of mods) expect(q.x + q.w).toBeLessThanOrEqual(PHOTO.w - m.margin + 1);
  });

  it('the code is dark on a light plate on every ground (no inverted codes)', () => {
    for (const tone of ['light', 'dark'] as const) {
      const plan = watermarkPlan('chenji', PHOTO, undefined, { url: URL_ });
      const r = recorder(PHOTO.w, PHOTO.h);
      const fills: string[] = [];
      const fill = r.ctx.fill.bind(r.ctx);
      (r.ctx as unknown as { fill: () => void }).fill = () => {
        fills.push(String(r.ctx.fillStyle));
        fill();
      };
      const m = drawWatermark(r.ctx, PHOTO, { plan, handle: 'ludejun', tone });
      const mods = r.rects.filter((x) => x.w === m.module && x.h === m.module);
      expect(mods.length, tone).toBeGreaterThan(0);
      for (const q of mods) expect(q.fill, tone).toBe(QR_INK);
      // the plate is the last rounded fill before the modules
      expect(fills.at(-1), tone).toBe(tone === 'dark' ? QR_PLATE_ON_DARK : '#ffffff');
    }
  });

  it('the text line for 小红书: 辰记 │ @handle │ date, no code, no link', () => {
    const plan = watermarkPlan('xiaohongshu', PHOTO, undefined, { url: URL_ });
    const r = recorder(PHOTO.w, PHOTO.h);
    drawWatermark(r.ctx, PHOTO, { plan, handle: 'ludejun', date: new Date(2026, 9, 21) });
    const all = r.joined();
    expect(all).toContain('辰记');
    expect(all).toContain('@ludejun');
    expect(all).toContain('2026.10.21');
    expect(all).not.toMatch(/http|starnote\.app/);
    expect(r.rects.filter((x) => x.w === x.h && x.w <= 4).length).toBe(0);
  });

  it('English wording: Shot on STARNOTE', () => {
    const r = recorder(PHOTO.w, PHOTO.h);
    drawWatermark(r.ctx, PHOTO, { plan: textPlan(), handle: 'ludejun', lang: 'en' });
    expect(r.joined()).toContain('Shot on STARNOTE');
  });

  it('frame paints a band under the picture and centres the line in it', () => {
    const plan = watermarkPlan('chenji', PHOTO, { style: 'frame', qr: false });
    const m = watermarkLayout(PHOTO, plan);
    const r = recorder(m.out.w, m.out.h);
    drawWatermark(r.ctx, PHOTO, { plan, handle: 'ludejun' });
    expect(r.rects[0]).toMatchObject({ x: 0, y: PHOTO.h, w: PHOTO.w, h: m.band, fill: '#ffffff' });
    for (const t of r.texts) expect(t.y).toBeCloseTo(PHOTO.h + m.band / 2);
  });

  it('a long handle is dropped before the brand ever is', () => {
    const narrow = { w: 640, h: 640 };
    const r = recorder(narrow.w, narrow.h);
    drawWatermark(r.ctx, narrow, {
      plan: textPlan(),
      handle: 'x'.repeat(80),
      date: new Date(2026, 9, 21),
    });
    expect(r.joined()).toContain('辰记');
    expect(r.joined()).not.toContain('xxxxxxxx');
  });

  it('off draws nothing', () => {
    const r = recorder(PHOTO.w, PHOTO.h);
    drawWatermark(r.ctx, PHOTO, { plan: watermarkPlan('chenji', PHOTO, { enabled: false }) });
    expect(r.texts.length + r.rects.length).toBe(0);
  });

  it('watermarkCanvas: frame grows the canvas, keepSize keeps it', () => {
    const plan = watermarkPlan('chenji', PHOTO, { style: 'frame' }, { url: URL_ });
    const make = (w: number, h: number) => ({
      width: w,
      height: h,
      getContext: () => recorder(w, h).ctx,
    });
    const grown = watermarkCanvas(
      { source: {} as CanvasImageSource, width: PHOTO.w, height: PHOTO.h },
      { plan },
      make,
    );
    expect(grown.height).toBe(PHOTO.h + watermarkLayout(PHOTO, plan).band);
    const kept = watermarkCanvas(
      { source: {} as CanvasImageSource, width: PHOTO.w, height: PHOTO.h },
      { plan, keepSize: true },
      make,
    );
    expect(kept.height).toBe(PHOTO.h);
  });
});
