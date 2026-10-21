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

async function put(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
) {
  const h = new Headers(headers);
  // Same-origin local adapter needs the bearer; presigned S3 URLs must not get it.
  if (url.startsWith('/') || url.includes('/api/v1/assets/upload/')) {
    const token = currentAccessToken();
    if (token) h.set('Authorization', `Bearer ${token}`);
  }
  if (!onProgress || typeof XMLHttpRequest === 'undefined') {
    const res = await fetch(url, { method: 'PUT', body, headers: h });
    if (!res.ok) throw new Error(`上传失败（${res.status}）`);
    return;
  }
  // fetch can't report upload progress; XHR can
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    h.forEach((v, k) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败（${xhr.status}）`));
    xhr.onerror = () => reject(new Error('网络中断，上传失败'));
    xhr.send(body);
  });
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
