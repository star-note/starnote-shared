import { describe, expect, it, vi } from 'vitest';

import { imageFilesFrom, insertImageFiles, shouldHandleAsImages } from '../imagePaste';

function dt(files: File[], html = ''): DataTransfer {
  return {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    getData: (t: string) => (t === 'text/html' ? html : ''),
  } as unknown as DataTransfer;
}

const png = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
const txt = new File(['x'], 'a.txt', { type: 'text/plain' });

describe('imagePaste', () => {
  it('keeps only image files', () => {
    expect(imageFilesFrom(dt([png, txt])).map((f) => f.name)).toEqual(['shot.png']);
    expect(imageFilesFrom(null)).toEqual([]);
  });

  it('lets rich HTML clipboards through to the HTML paste handler', () => {
    expect(shouldHandleAsImages(dt([png]))).toBe(true);
    expect(shouldHandleAsImages(dt([png], '<p>doc</p>'))).toBe(false);
    expect(shouldHandleAsImages(dt([txt]))).toBe(false);
  });

  it('uploads each file, inserts a block image and reports failures', async () => {
    const run = vi.fn();
    const setImageBlock = vi.fn(() => ({ run }));
    const chain = { focus: () => ({ setImageBlock, setTextSelection: vi.fn() }) };
    const editor = { chain: () => chain, state: { selection: { to: 7 } } } as never;
    const upload = vi.fn(async (f: File) => {
      if (f.name === 'bad.png') throw new Error('太大');
      return `/assets/${f.name}`;
    });
    const onError = vi.fn();
    const remember = vi.fn();
    const bad = new File([''], 'bad.png', { type: 'image/png' });
    await insertImageFiles(editor, [png, bad], { upload, onError, remember });
    expect(setImageBlock).toHaveBeenCalledWith({ src: '/assets/shot.png', alt: 'shot' });
    expect(remember).toHaveBeenCalledWith(editor, '/assets/shot.png');
    expect(run).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('太大');
  });
});
