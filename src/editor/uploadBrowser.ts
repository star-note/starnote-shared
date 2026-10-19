import imageCompression from 'browser-image-compression';

import { sha256Hex, uploadImage, type UploadDeps } from './upload';
import { assetsApi } from '../api/assets';
import { currentAccessToken } from '../api/client';

async function compress(file: File): Promise<File | Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: 2000,
    initialQuality: 0.82,
    fileType: 'image/webp',
    useWebWorker: true,
  });
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bmp = await createImageBitmap(blob);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return undefined;
  }
}

async function put(url: string, body: Blob, headers: Record<string, string>) {
  const h = new Headers(headers);
  // Same-origin local adapter needs the bearer; presigned S3 URLs must not get it.
  if (url.startsWith('/') || url.includes('/api/v1/assets/upload/')) {
    const token = currentAccessToken();
    if (token) h.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, { method: 'PUT', body, headers: h });
  if (!res.ok) throw new Error(`上传失败（${res.status}）`);
}

export const browserUploadDeps: UploadDeps = {
  compress,
  sha256: sha256Hex,
  presign: assetsApi.presign,
  put,
  complete: assetsApi.complete,
  dimensions,
};

/** For the editor's `image.upload`: returns the asset URL to write into the node. */
export async function uploadForEditor(file: File): Promise<string> {
  const asset = await uploadImage(file, browserUploadDeps);
  return asset.url;
}
