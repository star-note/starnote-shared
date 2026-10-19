import { fitLine, fitTitleBox } from '../fitText';
import {
  composePhoto,
  coverLinesFrom,
  CUT_HEADROOM_PX,
  dateline,
  GEO_PALETTES,
  geoPalette,
  hasCutoutHeadroom,
  intersects,
  type Item,
  layoutMagazine,
  mastheadText,
  type MeasureFor,
} from '../magazine/layout';
import { colorGroup, kindOf, materialSequence, pickMaterial, pickVariant } from '../magazine/pick';
import { formatCoords, placeFrom, placeIn, placeLabel } from '../magazine/place';
import { MAG_DIMENSIONS, type MagSize, type TemplateKey } from '../magazine/types';
import { ART_MATERIALS } from '../materials/art';
import { FAVOURITE_PHOTO, PHOTO_MATERIALS } from '../materials/photos';

/** Stand-in metrics: CJK glyphs are 1em, everything else 0.56em. */
const CJK = /[\u3000-\u303F\u3400-\u9FFF\uFF00-\uFFEF]/;
const fake = (t: string, s: number) =>
  Array.from(t).reduce((w, c) => w + (CJK.test(c) ? s : s * 0.56), 0);
const measure: MeasureFor = () => fake;

const TITLES = {
  short: '雨夜',
  brand: '3. 博客与个人品牌',
  cjk: '写了一年技术博客之后，我学会的十件事',
  long: '从零开始搭建一个支持多平台一键发布、离线优先、端到端加密的写作工具：架构设计、踩坑记录与性能优化全过程复盘（上篇）',
  latin: 'The Quiet Craft of Writing Every Single Day, Even When Nobody Reads It',
  word: 'Supercalifragilisticexpialidocious-and-then-some',
};
const TEMPLATES: TemplateKey[] = ['fashion', 'journal', 'xhs', 'scenic', 'geo'];
const SIZES: MagSize[] = ['card', 'og', 'wide', 'square', 'portrait'];
const MATERIALS = [...PHOTO_MATERIALS, ...ART_MATERIALS];
const GEO_M: Record<MagSize, number> = { card: 48, og: 44, wide: 34, square: 64, portrait: 72 };
const base = {
  author: '陆德俊',
  category: '随笔',
  summary: '一年里写了四十多篇文章，有些被转发了上千次，有些无人问津。',
  handle: 'ludejun',
  headings: ['为什么要公开写作', '选题：从工作里长出来', '坚持的秘密是降低门槛'],
  issue: 12,
  date: new Date(2026, 9, 15),
  seed: 'note-1',
};

/** Things that carry words or marks and must never collide. */
const solid = (it: Item) =>
  it.kind === 'text' ||
  it.kind === 'sticker' ||
  it.kind === 'byline' ||
  it.kind === 'barcode' ||
  it.kind === 'scalebar' ||
  it.kind === 'masthead';
const rectOf = (it: Item) => ('rect' in it ? it.rect : null);

describe('fitTitleBox / fitLine', () => {
  it('shrinks before it wraps past the line or height budget, then ellipsizes', () => {
    const r = fitTitleBox({
      text: TITLES.long,
      maxWidth: 400,
      maxHeight: 200,
      lineHeight: 1.2,
      measure: fake,
      minSize: 30,
      maxSize: 80,
    });
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.lines.length * r.size * 1.2).toBeLessThanOrEqual(200);
    expect(r.truncated).toBe(true);
    expect(r.lines[r.lines.length - 1].endsWith('…')).toBe(true);
    r.lines.forEach((l) => expect(fake(l, r.size)).toBeLessThanOrEqual(400));
  });
  it('keeps short titles at the largest size', () => {
    expect(
      fitTitleBox({
        text: '雨夜',
        maxWidth: 400,
        maxHeight: 300,
        lineHeight: 1.2,
        measure: fake,
        minSize: 30,
        maxSize: 80,
      }),
    ).toEqual({ size: 80, lines: ['雨夜'], truncated: false });
  });
  it('honours a height that only allows one line', () => {
    expect(
      fitTitleBox({
        text: TITLES.cjk,
        maxWidth: 300,
        maxHeight: 50,
        lineHeight: 1.2,
        measure: fake,
        minSize: 30,
        maxSize: 60,
      }).lines,
    ).toHaveLength(1);
  });
  it('fitLine scales a single line down to the width', () => {
    const size = fitLine('STARNOTE', 500, fake, 20, 300);
    expect(fake('STARNOTE', size)).toBeLessThanOrEqual(500);
    expect(fake('STARNOTE', size + 2)).toBeGreaterThan(500);
  });
});

describe('cover copy', () => {
  it('the masthead is always STARNOTE; the handle goes small into the dateline', () => {
    expect(mastheadText()).toBe('STARNOTE');
    expect(dateline(new Date(2026, 9, 15), 12, 'ludejun')).toBe(
      'OCTOBER 2026  ·  NO. 12  ·  @LUDEJUN',
    );
    expect(dateline(new Date(2026, 9, 15), undefined, '陆德俊')).toBe('OCTOBER 2026');
  });
  it('smaller cover lines come from the headings first, then the summary and category', () => {
    expect(coverLinesFrom({ ...base, title: 'T', seed: 's' })).toEqual(base.headings);
    expect(coverLinesFrom({ ...base, headings: [], title: 'T', seed: 's' })).toEqual([
      '一年里写了四十多篇文章，有些被转发了上千次，有些无人问津',
      '随笔',
    ]);
    expect(coverLinesFrom({ title: 'T', seed: 's', headings: ['1. 开始', 'T'] })).toEqual(['开始']);
  });
});

describe('material and variant choice (seeded)', () => {
  it('is deterministic per note, template and round', () => {
    expect(pickMaterial('fashion', 'n1', 3).id).toBe(pickMaterial('fashion', 'n1', 3).id);
    expect(pickVariant('xhs', 'n1', 5)).toEqual(pickVariant('xhs', 'n1', 5));
    expect(
      new Set(['n2', 'n3', 'n4', 'n5', 'n6'].map((s) => pickMaterial('fashion', s, 0).id)).size,
    ).toBeGreaterThan(1);
  });
  it('换一张 never repeats a picture within a long run, and never shows the same one twice in a row', () => {
    for (const t of TEMPLATES) {
      const seq = materialSequence(t, 'note-x', 120);
      for (let r = 1; r < seq.length; r++) expect(seq[r].id).not.toBe(seq[r - 1].id);
      // (地理志 draws from a smaller pool: 17 pictures before any may come back.)
      const first = materialSequence(t, 'note-x', t === 'geo' ? 17 : 20).map((m) => m.id);
      expect(new Set(first).size).toBe(first.length);
    }
  });
  it('mixes people and nature per template, alternating so two landscapes never come back to back', () => {
    const share = (t: TemplateKey) =>
      materialSequence(t, 'mix', 100).filter((m) => kindOf(m) === 'people').length / 100;
    expect(share('fashion')).toBeCloseTo(0.6, 1);
    expect(share('xhs')).toBeCloseTo(0.7, 1);
    expect(share('journal')).toBeCloseTo(0.4, 1);
    for (const t of TEMPLATES) {
      const seq = materialSequence(t, 'alt', 30).map(kindOf);
      for (let r = 1; r < seq.length; r++)
        if (t === 'fashion' || t === 'xhs')
          expect(seq[r] === 'nature' && seq[r - 1] === 'nature').toBe(false);
    }
  });
  it('地理志 draws only the landscape-orientation photos flagged geo, spread by colour like 风景', () => {
    for (const seed of ['a', 'b', 'note-x']) {
      const seq = materialSequence('geo', seed, 40);
      expect(
        seq.every(
          (m) => m.kind === 'photo' && m.subject === 'nature' && m.geo && m.width >= m.height,
        ),
      ).toBe(true);
      for (let r = 1; r < seq.length; r++)
        expect(colorGroup(seq[r]), `${seed}#${r}`).not.toBe(colorGroup(seq[r - 1]));
      const pool = PHOTO_MATERIALS.filter((m) => m.geo && m.width >= m.height).length;
      expect(pool).toBeGreaterThanOrEqual(12);
      expect(new Set(seq.slice(0, pool).map((m) => m.id)).size).toBe(pool);
      // No flower fields, nothing upright.
      for (const id of [
        '3308735',
        '5097499',
        '6007980',
        '6599950',
        '7493439',
        '10412513',
        '4965457',
      ])
        expect(
          seq.some((m) => m.id === id),
          id,
        ).toBe(false);
    }
  });
  it('风景 shows only landscape photos and never two of the same colour group in a row', () => {
    for (const seed of ['a', 'b', 'c', 'note-x']) {
      const seq = materialSequence('scenic', seed, 60);
      expect(seq.every((m) => m.kind === 'photo' && m.subject === 'nature')).toBe(true);
      for (let r = 1; r < seq.length; r++)
        expect(colorGroup(seq[r]), `${seed}#${r}`).not.toBe(colorGroup(seq[r - 1]));
      expect(new Set(seq.slice(0, 24).map((m) => m.id)).size).toBe(24);
      expect(
        seq.some((m) => m.id === '4965457'),
        'the dead tree is left out of 风景',
      ).toBe(false);
    }
    // …but 时尚杂志 still uses it
    expect(materialSequence('fashion', 'a', 200).some((m) => m.id === '4965457')).toBe(true);
  });

  it('the favourite photo shows up within the first three covers of 时尚杂志 and 小红书', () => {
    for (const t of ['fashion', 'xhs'] as const) {
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f'])
        expect(materialSequence(t, seed, 3).map((m) => m.id)).toContain(FAVOURITE_PHOTO);
    }
  });
});

describe('地理志 (geo)', () => {
  const geoInput = {
    ...base,
    title: '大理：洱海边的三天',
    summary: '从苍山脚下出发，沿着环海路骑行。',
  };
  const geoPhotos = PHOTO_MATERIALS.filter((m) => m.geo);

  it('lays out masthead · dateline · place tag · band (rule, title, deck, byline, scale bar) at every size', () => {
    for (const size of SIZES) {
      const { w, h } = MAG_DIMENSIONS[size];
      const lay = layoutMagazine('geo', geoInput, size, measure, geoPhotos[0]);
      const keys = lay.items.map((i) => i.key);
      for (const k of [
        'photo',
        'scrimTop',
        'band',
        'rule',
        'masthead',
        'dateline',
        'place',
        'title',
        'deck',
        'byline',
        'scalebar',
      ])
        expect(keys, `${size} ${k}`).toContain(k);
      const mast = lay.items.find((i) => i.kind === 'masthead')!;
      expect(mast.kind === 'masthead' && mast.font).toBe('geoMast');
      // Masthead centred at the top; the dateline right under it, also centred.
      expect(Math.abs(rectOf(mast)!.x + rectOf(mast)!.w / 2 - w / 2), size).toBeLessThan(2);
      const date = lay.items.find((i) => i.key === 'dateline')!;
      expect(date.kind === 'text' && date.lines[0]).toBe('第 12 期  ·  2026 年 10 月');
      expect(rectOf(date)!.y).toBeGreaterThan(rectOf(mast)!.y + rectOf(mast)!.h);
      expect(Math.abs(rectOf(date)!.x + rectOf(date)!.w / 2 - w / 2), size).toBeLessThan(2);
      // Place tag in the top-left corner, clear of the masthead.
      const place = lay.items.find((i) => i.key === 'place')!;
      expect(place.kind === 'text' && place.lines[0]).toBe('◎ 大理  25.6°N 100.3°E');
      expect(rectOf(place)!.x).toBe(rectOf(lay.items.find((i) => i.key === 'rule')!)!.x);
      expect(rectOf(place)!.y).toBeLessThan(rectOf(mast)!.y + rectOf(mast)!.h);
      // The band is a gradient that fades in at its top and holds the title; it never takes more than half the frame.
      const band = lay.items.find((i) => i.key === 'band')!;
      expect(band.kind === 'fill' && band.background).toMatch(/^linear-gradient\(to bottom/);
      const title = lay.items.find((i) => i.key === 'title')!;
      expect(title.kind === 'text' && title.font).toBe('geoSerif');
      expect(rectOf(title)!.y).toBeGreaterThan(h * 0.5);
      expect(rectOf(title)!.y + rectOf(title)!.h).toBeLessThan(h);
      const deck = lay.items.find((i) => i.key === 'deck')!;
      expect(deck.kind === 'text' && deck.lines).toEqual(['从苍山脚下出发，沿着环海路骑行']);
      expect(rectOf(deck)!.y).toBeGreaterThan(rectOf(title)!.y + rectOf(title)!.h - 1);
      // Scale bar bottom-right, on the byline's row, inside the margin.
      const bar = lay.items.find((i) => i.kind === 'scalebar')!;
      const by = lay.items.find((i) => i.key === 'byline')!;
      expect(rectOf(bar)!.x + rectOf(bar)!.w).toBe(w - GEO_M[size]);
      expect(rectOf(bar)!.y).toBe(rectOf(by)!.y - Math.round((rectOf(bar)!.h - rectOf(by)!.h) / 2));
      expect(bar.kind === 'scalebar' && bar.label).toMatch(/^(20|50|100) km$/);
      expect(by.kind === 'text' && by.lines[0]).toBe('文 / 陆德俊  ·  随笔');
      expect(rectOf(bar)!.y + rectOf(bar)!.h).toBeLessThan(h);
      // Only system faces.
      for (const it of lay.items)
        if (it.kind === 'text' || it.kind === 'masthead')
          expect(['geoMast', 'geoSerif', 'geoLabel', 'sans'], `${size} ${it.key}`).toContain(
            it.font,
          );
    }
  });

  it('leaves the corner empty when no place is named, and drops the byline row text without an author', () => {
    const lay = layoutMagazine(
      'geo',
      {
        ...base,
        title: '关于写作的十件小事',
        summary: '一些心得。',
        author: undefined,
        category: undefined,
      },
      'card',
      measure,
      geoPhotos[1],
    );
    expect(lay.items.some((i) => i.key === 'place')).toBe(false);
    expect(lay.items.some((i) => i.key === 'byline')).toBe(false);
    expect(lay.items.some((i) => i.kind === 'scalebar')).toBe(true);
    // Without an issue the dateline is the month alone.
    const date = lay.items.find((i) => i.key === 'dateline')!;
    expect(date.kind === 'text' && date.lines[0]).toBe('第 12 期  ·  2026 年 10 月');
    const noIssue = layoutMagazine(
      'geo',
      { ...base, issue: undefined, title: 'T' },
      'card',
      measure,
      geoPhotos[1],
    );
    const d2 = noIssue.items.find((i) => i.key === 'dateline')!;
    expect(d2.kind === 'text' && d2.lines[0]).toBe('2026 年 10 月');
  });

  it('picks the colourway from the picture: greens → 深墨绿, warm light → 暖沙色, cold or grey → 岩石灰', () => {
    const by = (id: string) => geoPalette(PHOTO_MATERIALS.find((m) => m.id === id)!).key;
    expect(by('6147402')).toBe('moss'); // 孤树 · 绿野
    expect(by('7860877')).toBe('moss'); // 梯田
    expect(by('10058281')).toBe('sand'); // 沙丘 · 天光
    expect(by('7934208')).toBe('stone'); // 灯塔 · 黑白
    expect(by('10511584')).toBe('stone'); // 银河 · 海崖
    const used = new Set(geoPhotos.map((m) => geoPalette(m).key));
    expect([...used].sort()).toEqual(['moss', 'sand', 'stone']);
    for (const p of Object.values(GEO_PALETTES)) expect(p.band).toMatch(/^#[0-9a-f]{6}$/);
    // The band carries the palette's colour and the title its ink.
    for (const m of geoPhotos) {
      const lay = layoutMagazine('geo', geoInput, 'og', measure, m);
      const pal = geoPalette(m);
      const band = lay.items.find((i) => i.key === 'band')!;
      expect(band.kind === 'fill' && band.background).toContain(`rgba(${pal.rgb},0.96)`);
      const title = lay.items.find((i) => i.key === 'title')!;
      expect(title.kind === 'text' && title.color).toBe(pal.ink);
    }
  });

  it('keeps the landscape subject out of the band where the photo allows', () => {
    let clear = 0;
    for (const m of geoPhotos) {
      const lay = layoutMagazine('geo', geoInput, 'card', measure, m);
      const band = rectOf(lay.items.find((i) => i.key === 'band')!)!;
      const title = rectOf(lay.items.find((i) => i.key === 'title')!)!;
      if (
        !lay.keep.some((k) =>
          intersects(k, { x: band.x, y: title.y, w: band.w, h: band.h - (title.y - band.y) }),
        )
      )
        clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(Math.floor(geoPhotos.length * 0.7));
  });
});

describe('地名提取', () => {
  it('finds a known place in the title first, then the summary, with its coordinates', () => {
    expect(placeFrom('大理：洱海边的三天', '从昆明出发')).toEqual({
      name: '大理',
      lat: 25.6,
      lng: 100.3,
    });
    expect(placeFrom('关于写作', '在冰岛开了十天车')).toEqual({
      name: '冰岛',
      lat: 64.1,
      lng: -21.9,
    });
    expect(placeFrom('A week in Lofoten, Norway')).toEqual({
      name: 'Lofoten',
      lat: 68.2,
      lng: 13.9,
    });
    // Longest name at the same position: 青海湖, not 青海; 稻城亚丁, not 稻城.
    expect(placeIn('青海湖的清晨')!.name).toBe('青海湖');
    expect(placeIn('稻城亚丁徒步')!.name).toBe('稻城亚丁');
    // Latin names match whole words only.
    expect(placeIn('Balinese food in Ubud')).toBeNull();
    expect(placeIn('Bali, again')!.name).toBe('Bali');
  });
  it('reads coordinates written in the text, and formats them', () => {
    expect(placeIn('营地在 27.1°N, 100.2°E 的山谷里')).toEqual({ name: '', lat: 27.1, lng: 100.2 });
    expect(placeLabel(placeIn('28.0°S 153.4°E'))).toBe('28.0°S 153.4°E');
    expect(formatCoords(-49.3, -72.9)).toBe('49.3°S 72.9°W');
    expect(placeLabel({ name: '大理', lat: 25.6, lng: 100.3 })).toBe('大理  25.6°N 100.3°E');
    expect(placeLabel({ name: '富士山' })).toBe('富士山');
    expect(placeLabel(null)).toBe('');
  });
  it('accepts natural features by suffix but refuses phrases with function words', () => {
    expect(placeIn('念青唐古拉山下的牧场')!.name).toBe('念青唐古拉山');
    expect(placeIn('阿尔卑斯山的早晨')).toEqual({ name: '阿尔卑斯', lat: 46.5, lng: 9.0 });
    expect(placeIn('在喀拉峻草原露营')!.name).toBe('喀拉峻草原');
    expect(placeIn('纳木错湖畔')!.name).toBe('纳木错');
    expect(placeIn('走进群山')).toBeNull();
    expect(placeIn('一座山，一个人')).toBeNull();
    expect(placeIn('我们的湖')).toBeNull();
    expect(placeIn('写了一年技术博客之后，我学会的十件事')).toBeNull();
    expect(placeIn('')).toBeNull();
  });
});

describe('composePhoto', () => {
  it('anchors the foreground at the masthead line and keeps faces in frame', () => {
    const p = PHOTO_MATERIALS.find((m) => m.id === FAVOURITE_PHOTO)!;
    const c = composePhoto(1200, 1600, p, {
      top: 160,
      cx: 600,
      faceTopMin: 150,
      maxFace: 0.42,
      faceBottomMax: 960,
      sideMargin: 56,
    });
    expect(c.ok).toBe(true);
    expect(c.img.y + (p.cutTop ?? 0) * c.img.h).toBeCloseTo(160, 0);
    expect(c.faces[0].x).toBeGreaterThanOrEqual(56);
    expect(c.faces[0].x + c.faces[0].w).toBeLessThanOrEqual(1200 - 56);
  });
  it('feathers only the edges where the sharp photo falls short of the frame', () => {
    const p = PHOTO_MATERIALS.find((m) => m.id === '8592569')!; // portrait close-up in a 3:2 frame
    const c = composePhoto(1200, 800, p, { cx: 600 });
    expect(c.backdrop).toBe(false);
    const lifted = composePhoto(1200, 800, p, { top: 100, cx: 360, maxFace: 0.4 });
    expect(lifted.backdrop).toBe(true);
    expect(lifted.feather.r + lifted.feather.l).toBeGreaterThan(0);
  });
});

describe('layoutMagazine', () => {
  it('fits every title in every template, size and material without collisions or text on faces', () => {
    for (const template of TEMPLATES) {
      for (const size of SIZES) {
        const { w, h } = MAG_DIMENSIONS[size];
        for (const material of MATERIALS) {
          for (const [name, title] of Object.entries(TITLES)) {
            const where = `${template}/${size}/${material.id}/${name}`;
            const lay = layoutMagazine(template, { ...base, title }, size, measure, material);
            const items = lay.items.filter(solid);
            // No 「AI 生成」 mark on the image any more.
            expect(JSON.stringify(lay.items), where).not.toContain('AI 生成');
            const mast = items.filter((i) => i.kind === 'masthead');
            expect(mast, where).toHaveLength(template === 'xhs' || template === 'scenic' ? 0 : 1);
            mast.forEach((m) => expect(m.kind === 'masthead' && m.text, where).toBe('STARNOTE'));
            // No opaque blocks: every fill is a gradient (scrims) or a hairline rule.
            for (const it of lay.items)
              if (it.kind === 'fill')
                expect(/gradient/.test(it.background) || it.rect.h <= 4, `${where} ${it.key}`).toBe(
                  true,
                );
            for (const it of lay.items) {
              if (it.kind !== 'text') continue;
              expect(it.lines.length, `${where} ${it.key}`).toBeLessThanOrEqual(3);
              const track = it.tracking ?? 0;
              for (const l of it.lines) {
                const lw =
                  fake(l, it.size) + Math.max(0, Array.from(l).length - 1) * track * it.size;
                expect(lw, `${where} ${it.key} "${l}"`).toBeLessThanOrEqual(it.rect.w + 1);
              }
              expect(
                it.lines.length * it.size * it.lh,
                `${where} ${it.key} height`,
              ).toBeLessThanOrEqual(it.rect.h + 1);
            }
            const hasCutout = lay.items.some((i) => i.kind === 'photo' && i.layer === 'cut');
            for (const it of items) {
              const r = rectOf(it)!;
              expect(
                r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5,
                `${where} ${it.key} inside`,
              ).toBe(true);
              // The masthead may sit behind a face only when the cutout puts the head in front of it.
              if (it.kind === 'masthead' && hasCutout) continue;
              for (const f of lay.faces)
                expect(intersects(r, f), `${where} ${it.key} on a face`).toBe(false);
            }
            for (let i = 0; i < items.length; i++) {
              for (let j = i + 1; j < items.length; j++) {
                expect(
                  intersects(rectOf(items[i])!, rectOf(items[j])!),
                  `${where} ${items[i].key} × ${items[j].key}`,
                ).toBe(false);
              }
            }
          }
        }
      }
    }
  }, 60_000);

  it('never shows a cutout whose top is a straight crop line inside the masthead band', () => {
    let overlaps = 0;
    for (const template of TEMPLATES) {
      for (const size of SIZES) {
        for (const material of PHOTO_MATERIALS) {
          const lay = layoutMagazine(
            template,
            { ...base, title: TITLES.cjk },
            size,
            measure,
            material,
          );
          const cut = lay.items.find((i) => i.kind === 'photo' && i.layer === 'cut');
          const mast = lay.items.find((i) => i.kind === 'masthead');
          if (!cut || cut.kind !== 'photo' || !mast || mast.kind !== 'masthead') continue;
          overlaps++;
          // The photo's top edge is visible in the frame and crosses the masthead band…
          const edgeY = cut.img.y;
          const edgeInBand = edgeY > 0 && edgeY < mast.rect.y + mast.rect.h;
          // …then the mask must start below it (a real silhouette with headroom).
          const clearRows = (material.cutTop ?? 0) * material.height;
          if (edgeInBand)
            expect(clearRows, `${template}/${size}/${material.id}`).toBeGreaterThanOrEqual(
              CUT_HEADROOM_PX,
            );
          expect(hasCutoutHeadroom(material), `${template}/${size}/${material.id}`).toBe(true);
        }
      }
    }
    expect(overlaps).toBeGreaterThan(10);
    // Photos whose subject touches the top edge never get the cutout layer.
    const flat = PHOTO_MATERIALS.filter((m) => m.cutout && !hasCutoutHeadroom(m));
    expect(flat.map((m) => m.id)).toContain(FAVOURITE_PHOTO);
  });

  it('only the main title may end in an ellipsis', () => {
    const headings = [
      '为什么要公开写作这件事值得每个工程师认真考虑一下',
      '选题：从工作里长出来的东西最有生命力，也最容易坚持',
      '坚持的秘密是降低门槛',
    ];
    for (const template of TEMPLATES) {
      for (const size of SIZES) {
        for (const material of MATERIALS) {
          const lay = layoutMagazine(
            template,
            { ...base, headings, title: TITLES.long },
            size,
            measure,
            material,
          );
          for (const it of lay.items) {
            if (it.kind === 'text' && it.key !== 'title')
              expect(it.lines.join(''), `${template}/${size}/${material.id} ${it.key}`).not.toMatch(
                /…$/,
              );
          }
        }
      }
    }
  }, 30_000);

  it('puts the cutout above the masthead (head over masthead) on photos that have one', () => {
    const p = PHOTO_MATERIALS.find((m) => m.id === '8663960')!;
    const keys = layoutMagazine(
      'fashion',
      { ...base, title: TITLES.cjk },
      'portrait',
      measure,
      p,
    ).items.map((i) => i.key);
    expect(keys.indexOf('photo')).toBeLessThan(keys.indexOf('masthead'));
    expect(keys.indexOf('masthead')).toBeLessThan(keys.indexOf('cutout'));
  });

  it('is deterministic for the same seed and round', () => {
    const a = layoutMagazine('fashion', { ...base, title: TITLES.cjk, round: 2 }, 'card', measure);
    expect(
      layoutMagazine('fashion', { ...base, title: TITLES.cjk, round: 2 }, 'card', measure),
    ).toEqual(a);
    expect(
      layoutMagazine('fashion', { ...base, title: TITLES.cjk, round: 3 }, 'card', measure).material
        .id,
    ).not.toBe(a.material.id);
  });
});

describe('one line before wrapping', () => {
  const titleOf = (items: Item[]) =>
    items.find((i) => i.kind === 'text' && i.key === 'title') as Extract<Item, { kind: 'text' }>;
  const barOf = (items: Item[]) =>
    items.find((i) => i.kind === 'barcode') as Extract<Item, { kind: 'barcode' }> | undefined;

  it('the reported cover: 「3. 博客与个人品牌」 on 8172974 (3:2 时尚杂志) is one line that stops short of the barcode', () => {
    const p = PHOTO_MATERIALS.find((m) => m.id === '8172974')!;
    const lay = layoutMagazine(
      'fashion',
      { ...base, title: '3. 博客与个人品牌' },
      'card',
      measure,
      p,
    );
    const t = titleOf(lay.items);
    expect(t.lines).toEqual(['3. 博客与个人品牌']);
    const bar = barOf(lay.items)!;
    // clear of the barcode by the 24 px gap
    expect(intersects(t.rect, bar.rect, 23.5)).toBe(false);
    for (const f of lay.faces) expect(intersects(t.rect, f)).toBe(false);
  });

  it('short titles render as one line wherever their rows have the room', () => {
    for (const template of TEMPLATES) {
      for (const size of SIZES) {
        const mats = MATERIALS.filter(
          (m) => template !== 'scenic' || (m.kind === 'photo' && m.subject === 'nature'),
        );
        let one = 0;
        for (const material of mats) {
          const lay = layoutMagazine(
            template,
            { ...base, title: TITLES.brand },
            size,
            measure,
            material,
          );
          if (titleOf(lay.items).lines.length === 1) one++;
        }
        // Tall frames and 风景 have the width for it everywhere; side-column layouts lose some to faces /
        // close-ups (then two balanced lines are right), and 小红书's 96 px display title rarely fits beside a subject.
        const min =
          size === 'square' || size === 'portrait'
            ? 1
            : template === 'scenic'
              ? 0.95
              : template === 'xhs'
                ? 0
                : 0.7;
        expect(one / mats.length, `${template}/${size}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('期刊 shows a long title in full (other placement / no deck) before it would ever ellipsize', () => {
    const title = '给写作工具接入大模型：Prompt、流式与配额三件事';
    for (const size of SIZES) {
      for (const material of MATERIALS) {
        const t = titleOf(
          layoutMagazine('journal', { ...base, title }, size, measure, material).items,
        );
        expect(t.lines.join(''), `${size}/${material.id}`).toBe(title);
      }
    }
  });
});
