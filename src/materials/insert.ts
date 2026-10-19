import type { Editor } from '@tiptap/core';

import {
  type GiphyItem,
  type Material,
  materialsApi,
  OFFICIAL_BASE,
  type OfficialMaterial,
} from '../api/materials';
import type { TiptapDoc, TiptapNode } from '../api/types';
import { uploadImage } from '../editor/upload';
import { browserUploadDeps } from '../editor/uploadBrowser';

/**
 * Official materials ship as static files of the web app. Before one goes into a note it is
 * copied into the asset store (content-addressed, so every GIF is stored once for everybody):
 * the note, the blog and the 公众号 export then reference `/api/v1/assets/<hash>` like any
 * uploaded picture, are counted by asset GC and work on hosts that don't serve the web app.
 */
const cache = new Map<string, Promise<string>>();

/** Static pictures the web app ships (official materials, template photos): copied into the asset store on use. */
const STATIC_PREFIXES = [`${OFFICIAL_BASE}/`, '/cover-materials/', '/materials/'];

export function isOfficialSrc(src: unknown): src is string {
  return typeof src === 'string' && STATIC_PREFIXES.some((prefix) => src.startsWith(prefix));
}

export function materializeOfficial(src: string): Promise<string> {
  let job = cache.get(src);
  if (!job) {
    job = (async () => {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`素材加载失败（${res.status}）`);
      const blob = await res.blob();
      const name = src.split('/').pop() || 'material.gif';
      const type =
        blob.type ||
        (name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.png') ? 'image/png' : 'image/gif');
      const file = new File([blob], name, { type });
      const asset = await uploadImage(file, browserUploadDeps);
      return asset.url;
    })();
    job.catch(() => cache.delete(src));
    cache.set(src, job);
  }
  return job;
}

/** Copies every official material a document references into the asset store (templates). */
export async function materializeDoc<T extends TiptapDoc | TiptapNode>(doc: T): Promise<T> {
  const copy = JSON.parse(JSON.stringify(doc)) as T;
  const jobs: Promise<void>[] = [];
  const walk = (node: TiptapNode) => {
    if (node.attrs && isOfficialSrc(node.attrs.src)) {
      const attrs = node.attrs;
      jobs.push(
        materializeOfficial(attrs.src as string).then(
          (url) => void (attrs.src = url),
          () => undefined, // keep the static path; it still renders inside the app
        ),
      );
    }
    node.content?.forEach(walk);
  };
  walk(copy as TiptapNode);
  await Promise.all(jobs);
  return copy;
}

/** What the pickers hand to `insertPicked`. */
export type PickedMaterial =
  | { kind: 'official'; item: OfficialMaterial }
  | { kind: 'mine'; item: Material }
  | { kind: 'giphy'; item: GiphyItem };

/**
 * Display width: GIF banners are drawn at about 1.7× for sharpness and shown at most 360px wide
 * (a phone column); stickers at three quarters of their size. Same rule as the official templates.
 */
export function displayWidth(w?: number | null): number | undefined {
  if (!w) return undefined;
  return w > 360 ? Math.min(360, Math.round(w * 0.6)) : Math.round(w * 0.75);
}

/** Resolves a picked material to an asset URL and inserts it as a block picture at the cursor. */
export async function insertPicked(editor: Editor, picked: PickedMaterial): Promise<void> {
  let src: string;
  let alt: string;
  let width: number | undefined;
  if (picked.kind === 'official') {
    src = await materializeOfficial(`${OFFICIAL_BASE}/${picked.item.file}`);
    alt = picked.item.title;
    width = displayWidth(picked.item.w);
  } else if (picked.kind === 'mine') {
    src = picked.item.url;
    alt = picked.item.title;
    width = displayWidth(picked.item.width);
  } else {
    const res = await materialsApi.giphyImport(picked.item.id);
    src = res.url || res.asset.url;
    alt = picked.item.title || 'GIF';
    width = displayWidth(picked.item.width);
  }
  if (editor.isDestroyed) return;
  editor
    .chain()
    .focus()
    .setImageBlock({ src, alt, ...(width ? { width } : {}), align: 'center' })
    .run();
}
