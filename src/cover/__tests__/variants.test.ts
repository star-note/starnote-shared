import { vi } from 'vitest';

import type { UploadDeps } from '../../editor/upload';
import { buildCoverVariants, cropRect, VARIANT_KEYS, VARIANT_SIZES } from '../variants';

const renderVariantFile = vi.hoisted(() => vi.fn());
vi.mock('../generateCover', () => ({
  generateCoverFile: (o: { size: string }) => renderVariantFile(o.size),
}));
vi.mock('../../editor/upload', () => ({
  uploadImage: vi.fn(async (file: File) => {
    if (file.name.includes('fail-upload')) throw new Error('上传失败');
    return { hash: `h-${file.name}` };
  }),
}));

describe('cropRect', () => {
  it('cover-crops to the target aspect, centred horizontally and biased to the upper third', () => {
    // 3:2 photo → 1:1: full height, centred width
    expect(cropRect(1200, 800, 1080, 1080)).toEqual({ sx: 200, sy: 0, sw: 800, sh: 800 });
    // 3:2 photo → 2.35:1: full width, a band a little above the middle (focus y 0.4)
    const wide = cropRect(1200, 800, 900, 383);
    expect(wide.sw).toBe(1200);
    expect(wide.sh).toBeCloseTo(510.7, 0);
    expect(wide.sy).toBeCloseTo(0.4 * 800 - wide.sh / 2, 3);
    // portrait photo → og: full width; the focus decides the band, clamped inside the image
    expect(cropRect(800, 1200, 1200, 630, { x: 0.5, y: 0 }).sy).toBe(0);
    expect(cropRect(800, 1200, 1200, 630, { x: 0.5, y: 1 }).sy).toBeCloseTo(
      1200 - 800 * (630 / 1200),
      3,
    );
  });
});

describe('buildCoverVariants', () => {
  it('renders every size in parallel, uploads them and leaves failed sizes out', async () => {
    renderVariantFile.mockImplementation(async (size: string) => {
      if (size === 'wide') throw new Error('render failed');
      return new File(['x'], size === 'square' ? 'fail-upload.png' : `${size}.png`, {
        type: 'image/png',
      });
    });
    const progress: number[] = [];
    const out = await buildCoverVariants(
      { kind: 'generated', opts: { title: 'T' } },
      {} as UploadDeps,
      (p) => progress.push(p.done),
    );
    expect(out).toEqual({ og: 'h-og.png', portrait: 'h-portrait.png' });
    expect(renderVariantFile.mock.calls.map((c) => c[0]).sort()).toEqual([...VARIANT_KEYS].sort());
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(4);
  });

  it('declares the sizes the platforms ask for', () => {
    expect(VARIANT_SIZES).toEqual({
      og: { w: 1200, h: 630 },
      wide: { w: 900, h: 383 },
      square: { w: 1080, h: 1080 },
      portrait: { w: 1080, h: 1440 },
    });
  });
});
