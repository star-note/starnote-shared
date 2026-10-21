import { act, renderHook } from '@testing-library/react';

import type { Asset } from '../../api/types';
import type { UploadDeps } from '../../editor/upload';
import { MANUAL_COVER_STYLES, useCoverChoice } from '../useCoverChoice';

const HASH = 'a'.repeat(64);
const deps: UploadDeps = {
  compress: async (f) => f,
  sha256: async () => HASH,
  presign: async () => ({
    exists: true,
    asset: { hash: HASH, url: `/api/v1/assets/${HASH}` } as Asset,
  }),
  put: async () => undefined,
  complete: async () => ({ hash: HASH, url: `/api/v1/assets/${HASH}` }) as Asset,
};
const base = {
  noteId: 'n1',
  title: '标题',
  images: [`/api/v1/assets/${'b'.repeat(64)}`],
  upload: deps,
};

describe('useCoverChoice · 手动填写', () => {
  it('offers the four simple generator styles', () => {
    expect(MANUAL_COVER_STYLES).toEqual(['tech', 'geometry', 'paper', 'gradient']);
  });

  it('starts with nothing chosen and publishes without a cover', () => {
    const { result } = renderHook(() => useCoverChoice({ ...base, mode: 'manual' }));
    expect(result.current.tag).toBe('none');
    expect(result.current.ready).toBe(true);
    expect(result.current.shown).toBeNull();
    expect(result.current.source).toBeNull();
    expect(result.current.articleCands).toHaveLength(1);
  });

  it('picks an article image and an uploaded picture', async () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useCoverChoice({ ...base, mode: 'manual', onChange }));
    act(() => result.current.chooseImage(result.current.articleCands[0]!));
    expect(result.current.tag).toBe('image');
    expect(onChange).toHaveBeenLastCalledWith('b'.repeat(64));
    await act(async () => {
      await result.current.uploadFile(new File(['x'], 'p.png', { type: 'image/png' }));
    });
    expect(result.current.uploaded).toEqual([{ url: `/api/v1/assets/${HASH}`, hash: HASH }]);
    expect(onChange).toHaveBeenLastCalledWith(HASH);
    act(() => result.current.chooseTag('none'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps a cover chosen before (AI 发布) when opened manually', () => {
    const { result } = renderHook(() =>
      useCoverChoice({ ...base, mode: 'manual', initial: 'b'.repeat(64) }),
    );
    expect(result.current.tag).toBe('image');
    expect(result.current.image?.hash).toBe('b'.repeat(64));
  });

  it('auto mode still starts on 时尚杂志', () => {
    const { result } = renderHook(() => useCoverChoice(base));
    expect(result.current.tag).toBe('fashion');
    expect(result.current.mode).toBe('auto');
  });
});
