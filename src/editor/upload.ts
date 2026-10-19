import type { Asset, PresignResult } from '../api/types';

export interface UploadDeps {
  compress(file: File): Promise<File | Blob>;
  sha256(blob: Blob): Promise<string>;
  presign(body: {
    hash: string;
    size: number;
    mime: string;
    width?: number;
    height?: number;
  }): Promise<PresignResult>;
  put(url: string, body: Blob, headers: Record<string, string>): Promise<void>;
  complete(hash: string): Promise<Asset>;
  dimensions?(blob: Blob): Promise<{ width: number; height: number } | undefined>;
}

const SKIP_COMPRESS = new Set(['image/gif', 'image/svg+xml']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function shouldCompress(mime: string): boolean {
  return mime.startsWith('image/') && !SKIP_COMPRESS.has(mime);
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Select → compress → hash → presign → (PUT) → complete → url.
 * Pure orchestration; browser APIs come in through `deps` so it is testable.
 */
export async function uploadImage(file: File, deps: UploadDeps): Promise<Asset> {
  if (!file.type.startsWith('image/')) throw new Error('只支持图片文件');
  const blob = shouldCompress(file.type) ? await deps.compress(file) : file;
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('图片超过 10 MB 上限');
  const mime = blob.type || file.type;
  const hash = await deps.sha256(blob);
  const dims = await deps.dimensions?.(blob);
  const presigned = await deps.presign({ hash, size: blob.size, mime, ...dims });
  if (presigned.exists) return presigned.asset;
  if (!presigned.upload) throw new Error('服务端未返回上传地址');
  await deps.put(presigned.upload.url, blob, { 'Content-Type': mime, ...presigned.upload.headers });
  return deps.complete(hash);
}
