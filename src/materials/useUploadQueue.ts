/**
 * 上传素材 queue, shared by the web dialog and the phone sheet: several pictures, each with its own progress, a few
 * at a time; each lands as a material in `scope` and, when `openSource` (personal uploads only), is offered to 开源素材
 * under the current terms. The UI only renders `rows` and calls `add` / `remove` / `start`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { type MaterialScope, materialsApi } from '../api/materials';
import { MAX_IMAGE_BYTES, shouldCompress, uploadImage, type UploadDeps } from '../editor/upload';

export const MATERIAL_ACCEPT = 'image/gif,image/png,image/jpeg,image/webp,image/svg+xml';
/** The line every upload surface shows above the picker. */
export const MATERIAL_LIMITS = 'GIF、PNG、JPG、WebP、SVG，可一次选多张；单张不超过 10 MB，PNG / JPG 会自动压缩。';
const PARALLEL = 3;

export type UploadRowStatus = 'waiting' | 'uploading' | 'done' | 'error';
export interface UploadRow {
  uid: string;
  file: File;
  /** Object URL for the thumbnail ('' where the platform has none). */
  thumb: string;
  status: UploadRowStatus;
  /** 0–100 */
  progress: number;
  note?: string;
}

const objectUrl = (f: File) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '');
const freeUrl = (u: string) => {
  if (u && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
};

export function useUploadQueue({
  deps,
  scope,
  openSource,
  termsVersion,
  onUploaded,
}: {
  deps: UploadDeps;
  scope: MaterialScope;
  /** Offer personal uploads to 开源素材 (ignored for group scopes). */
  openSource: boolean;
  /** The 开源 terms the user agreed to by leaving the box ticked; without it nothing is offered. */
  termsVersion?: string;
  onUploaded(): void;
}) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [running, setRunning] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const opts = useRef({ deps, scope, openSource, termsVersion, onUploaded });
  opts.current = { deps, scope, openSource, termsVersion, onUploaded };

  useEffect(() => () => rowsRef.current.forEach((r) => freeUrl(r.thumb)), []);

  const patch = (uid: string, next: Partial<UploadRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...next } : r)));

  const add = useCallback((files: File[]) => {
    setRows((rs) => [
      ...rs,
      ...files.map((file): UploadRow => {
        const tooBig = !shouldCompress(file.type) && file.size > MAX_IMAGE_BYTES;
        return {
          uid: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          thumb: objectUrl(file),
          status: tooBig ? 'error' : 'waiting',
          progress: 0,
          note: tooBig ? '超过 10 MB' : undefined,
        };
      }),
    ]);
  }, []);

  const remove = useCallback((uid: string) => {
    setRows((rs) => {
      const r = rs.find((x) => x.uid === uid);
      if (r) freeUrl(r.thumb);
      return rs.filter((x) => x.uid !== uid);
    });
  }, []);

  const clear = useCallback(() => {
    rowsRef.current.forEach((r) => freeUrl(r.thumb));
    setRows([]);
  }, []);

  const one = async (r: UploadRow) => {
    const { deps: d, scope: s, openSource: open, termsVersion: version, onUploaded: done } = opts.current;
    patch(r.uid, { status: 'uploading', progress: 0 });
    try {
      const asset = await uploadImage(r.file, d, {
        onProgress: (f) => patch(r.uid, { progress: Math.round(f * 92) }),
      });
      const title = r.file.name.replace(/\.[^.]+$/, '').slice(0, 80) || undefined;
      const m = await materialsApi.create({ asset_hash: asset.hash, title, scope: s });
      let note: string | undefined;
      if (s === 'mine' && open && version) {
        try {
          await materialsApi.applyLicense(m.id, version);
          note = '已提交开源审核';
        } catch {
          note = '已上传，开源申请没提交成功，可在素材菜单里重试';
        }
      }
      patch(r.uid, { status: 'done', progress: 100, note });
      done();
    } catch (e) {
      patch(r.uid, { status: 'error', note: (e as Error)?.message || '上传失败' });
    }
  };

  /** Uploads every waiting row; resolves with how many failed. */
  const start = async (): Promise<number> => {
    const queue = rowsRef.current.filter((r) => r.status === 'waiting');
    if (!queue.length) return 0;
    setRunning(true);
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
        for (let r = queue.shift(); r; r = queue.shift()) await one(r);
      }),
    );
    setRunning(false);
    return rowsRef.current.filter((r) => r.status === 'error').length;
  };

  const waiting = rows.filter((r) => r.status === 'waiting');
  return {
    rows,
    running,
    waitingCount: waiting.length,
    /** Bytes of the pictures still to upload (before compression). */
    queuedBytes: waiting.reduce((n, r) => n + r.file.size, 0),
    finished: rows.length > 0 && !waiting.length && !running,
    add,
    remove,
    clear,
    start,
  };
}
