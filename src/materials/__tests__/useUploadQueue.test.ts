import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Material, materialsApi } from '../../api/materials';
import type { UploadDeps } from '../../editor/upload';
import { useMaterialLikes } from '../useMaterialLikes';
import { useUploadQueue } from '../useUploadQueue';

const deps: UploadDeps = {
  compress: async (f) => f,
  sha256: async (b) => `h${b.size}`,
  presign: async ({ hash }) => ({ exists: false, upload: { url: `/api/v1/assets/upload/${hash}`, method: 'PUT', headers: {} } }) as never,
  put: async (_u, _b, _h, onProgress) => onProgress?.(1),
  complete: async (hash) => ({ hash, url: `/api/v1/assets/${hash}`, size: 1, mime: 'image/gif' }) as never,
};

const gif = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: 'image/gif' });

afterEach(() => vi.restoreAllMocks());

describe('useUploadQueue', () => {
  it('uploads every waiting picture into the scope and offers personal ones to 开源素材', async () => {
    const create = vi
      .spyOn(materialsApi, 'create')
      .mockImplementation(async (b) => ({ id: `m-${b.asset_hash}` }) as Material);
    const apply = vi.spyOn(materialsApi, 'applyLicense').mockResolvedValue({} as Material);
    const onUploaded = vi.fn();
    const { result } = renderHook(() =>
      useUploadQueue({ deps, scope: 'mine', openSource: true, termsVersion: 'v1', onUploaded }),
    );
    act(() => result.current.add([gif('a.gif', 3), gif('b.gif', 4), gif('huge.gif', 11 * 1024 * 1024)]));
    expect(result.current.waitingCount).toBe(2);
    expect(result.current.rows[2]).toMatchObject({ status: 'error', note: '超过 10 MB' });
    let failed = -1;
    await act(async () => {
      failed = await result.current.start();
    });
    expect(failed).toBe(1); // the one that was too big from the start
    expect(create).toHaveBeenCalledWith({ asset_hash: 'h3', title: 'a', scope: 'mine' });
    expect(apply).toHaveBeenCalledWith('m-h4', 'v1');
    expect(onUploaded).toHaveBeenCalledTimes(2);
    expect(result.current.rows.slice(0, 2).map((r) => [r.status, r.progress, r.note])).toEqual([
      ['done', 100, '已提交开源审核'],
      ['done', 100, '已提交开源审核'],
    ]);
    expect(result.current.finished).toBe(true);
  });

  it('never offers group uploads, nor personal ones with the box unticked', async () => {
    vi.spyOn(materialsApi, 'create').mockResolvedValue({ id: 'm' } as Material);
    const apply = vi.spyOn(materialsApi, 'applyLicense').mockResolvedValue({} as Material);
    for (const [scope, openSource] of [
      ['group:g1', true],
      ['mine', false],
    ] as const) {
      const { result } = renderHook(() =>
        useUploadQueue({ deps, scope, openSource, termsVersion: 'v1', onUploaded: () => {} }),
      );
      act(() => result.current.add([gif('a.gif')]));
      await act(async () => {
        await result.current.start();
      });
    }
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('useMaterialLikes', () => {
  it('reads counts once and toggles optimistically, rolling back on failure', async () => {
    vi.spyOn(materialsApi, 'likes').mockResolvedValue({ t: { count: 1, liked: false } });
    const like = vi.spyOn(materialsApi, 'like').mockRejectedValueOnce(new Error('no'));
    const onError = vi.fn();
    const { result } = renderHook(() => useMaterialLikes(['t'], onError));
    await act(async () => {});
    expect(result.current.get('t')).toEqual({ count: 1, liked: false });
    await act(async () => {
      await result.current.toggle('t');
    });
    expect(like).toHaveBeenCalledWith('t', true);
    expect(onError).toHaveBeenCalled();
    expect(result.current.get('t')).toEqual({ count: 1, liked: false });
  });
});
