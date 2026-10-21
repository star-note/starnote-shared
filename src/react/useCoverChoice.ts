import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { assetHashFromUrl } from '../cover/assetHash';
import {
  type CoverOptions,
  type CoverStyle,
  COVER_STYLES,
  generateCoverFile,
  renderCover,
} from '../cover/generateCover';
import {
  isTemplateKey,
  MAG_TEMPLATES,
  type MagazineInput,
  type TemplateKey,
} from '../cover/magazine/types';
import {
  type CoverSource,
  coverSourceKey,
  type CoverVariantKey,
  renderVariantFile,
  VARIANT_KEYS,
  VARIANT_LABELS,
  VARIANT_SIZES,
} from '../cover/variants';
import { uploadImage, type UploadDeps } from '../editor/upload';

/**
 * The publish flow's 封面 logic without any UI (the web drawer's CoverField does the same with antd; the phone
 * flow renders it with its own controls): one row of tags — 时尚杂志 (default) · 期刊 · 小红书卡片 · 渐变 · 风景 ·
 * 海报 · 科技 · 纸张 · 几何 (· 文章配图) — 换一张, the chosen 3:2 cover uploaded as an asset (debounced), and every
 * platform size rendered for the 各平台尺寸 strip with the same code the publish step uploads.
 */
export type CoverTag = TemplateKey | CoverStyle | 'image' | 'none';

/**
 * 手动填写's generator styles: the four simple ones of the first cover generator, drawn from the title. With 正文图片
 * and 上传 they make the manual row of six; the magazine styles are left to AI 发布.
 */
export const MANUAL_COVER_STYLES: readonly CoverStyle[] = ['tech', 'geometry', 'paper', 'gradient'];
const MANUAL_THUMB = { w: 144, h: 96 };

export interface CoverChoiceInput {
  noteId: string;
  title: string;
  author?: string;
  category?: string;
  summary?: string;
  blogName?: string;
  handle?: string;
  issue?: number;
  headings?: string[];
  /** `doc.images`; only images hosted as our assets are offered. */
  images: string[];
  upload: UploadDeps;
  /** The uploaded 3:2 asset hash (undefined while it is being made). */
  onChange?(hash?: string): void;
  onSourceChange?(source: CoverSource | null): void;
  onPreview?(preview: CoverPreview): void;
  /**
   * `auto` (default, AI 发布): a generated cover (时尚杂志) from the start, every style on offer. `manual` (手动填写):
   * nothing is chosen until the author picks 正文图片 / 上传 / 科技 / 几何 / 纸张 / 渐变 (`MANUAL_COVER_STYLES`, with a
   * small picture of each drawn from the title as it is typed).
   */
  mode?: 'auto' | 'manual';
  /** 手动填写 opened with a cover already chosen (its asset hash): shown as the chosen picture. */
  initial?: string;
}

export interface CoverPreview {
  main?: string;
  variants: Partial<Record<CoverVariantKey, string>>;
}

export interface CoverSizeTile {
  key: string;
  ratio: string;
  name: string;
  w: number;
  h: number;
  url?: string;
}

const MAX_IMAGE_CANDIDATES = 4;
const UPLOAD_DEBOUNCE = 500;
export const DEFAULT_COVER_TAG: CoverTag = 'fashion';

/** 时尚杂志 · 期刊 · 小红书卡片 · 渐变 · 风景 · 地理志 · 海报 · 科技 · 纸张 · 几何 (· 文章配图) */
export function coverTags(withImages: boolean): { key: CoverTag; label: string; hint: string }[] {
  const tpl = (k: TemplateKey) => MAG_TEMPLATES.find((t) => t.key === k)!;
  const gen = (k: CoverStyle) => COVER_STYLES.find((t) => t.key === k)!;
  return [
    ...(['fashion', 'journal', 'xhs'] as const).map((k) => tpl(k)),
    gen('gradient'),
    tpl('scenic'),
    tpl('geo'),
    ...(['poster', 'tech', 'paper', 'geometry'] as const).map((k) => gen(k)),
    ...(withImages
      ? [{ key: 'image' as CoverTag, label: '文章配图', hint: '用文中的图片作封面' }]
      : []),
  ];
}

interface Rendered {
  key: string;
  url: string;
  file: File;
}

export function useCoverChoice(input: CoverChoiceInput) {
  const { noteId, title, author, category, summary, blogName, handle, issue, headings, images } =
    input;
  const cb = useRef(input);
  cb.current = input;

  const manual = input.mode === 'manual';
  // pictures uploaded in 手动填写: offered first, next to the article's images
  const [uploaded, setUploaded] = useState<{ url: string; hash: string }[]>([]);
  const articleCands = useMemo(
    () =>
      images
        .map((url) => ({ url, hash: assetHashFromUrl(url) }))
        .filter((c): c is { url: string; hash: string } => Boolean(c.hash))
        .slice(0, manual ? MAX_IMAGE_CANDIDATES * 2 : MAX_IMAGE_CANDIDATES),
    [images, manual],
  );
  const imageCands = useMemo(
    () => [...uploaded, ...articleCands.filter((c) => !uploaded.some((u) => u.hash === c.hash))],
    [uploaded, articleCands],
  );
  const [tag, setTag] = useState<CoverTag>(() =>
    manual ? (input.initial ? 'image' : 'none') : DEFAULT_COVER_TAG,
  );
  const [image, setImage] = useState<{ url: string; hash: string } | null>(() =>
    manual && input.initial
      ? (articleCands.find((c) => c.hash === input.initial) ?? {
          url: `/api/v1/assets/${input.initial}`,
          hash: input.initial,
        })
      : null,
  );
  const [magRound, setMagRound] = useState(0);
  const [seedN, setSeedN] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [mag, setMag] = useState<Rendered | null>(null);
  const [magFailed, setMagFailed] = useState<string | null>(null);
  const [date] = useState(() => new Date());

  const isMag = isTemplateKey(tag);
  const isImage = tag === 'image';
  const isNone = tag === 'none';
  const isGen = !isMag && !isImage && !isNone;

  const opts: CoverOptions = useMemo(
    () => ({
      title,
      author,
      category,
      blogName,
      handle,
      style: isGen ? (tag as CoverStyle) : 'poster',
      seed: `${noteId}:${seedN}`,
    }),
    [title, author, category, blogName, handle, tag, isGen, noteId, seedN],
  );
  const optsKey = `gen|${JSON.stringify(opts)}`;
  const magInput: MagazineInput = useMemo(
    () => ({
      title,
      author,
      category,
      summary,
      blogName,
      handle,
      issue,
      headings,
      date,
      seed: noteId,
      round: magRound,
    }),
    [title, author, category, summary, blogName, handle, issue, headings, date, noteId, magRound],
  );
  const magKey = `mag|${tag}|${JSON.stringify(magInput)}`;

  // classic generator: paints synchronously, one frame later so the tag switch feels instant
  useEffect(() => {
    if (!isGen) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        setPreview(renderCover({ ...opts, size: 'card' }).toDataURL('image/png'));
      } catch {
        setPreview(null);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [opts, isGen]);

  // magazine templates: lay out and rasterise the 3:2 cover; title edits and 换一张 coalesce
  useEffect(() => {
    if (!isMag) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setMagFailed(null);
      import('../cover/magazine/render')
        .then((m) => m.renderMagazineFile(tag as TemplateKey, magInput, 'card'))
        .then(({ file }) => {
          if (cancelled) return;
          setMag((old) => {
            if (old) URL.revokeObjectURL(old.url);
            return { key: magKey, url: URL.createObjectURL(file), file };
          });
        })
        .catch(() => {
          if (!cancelled) setMagFailed(magKey);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // magKey covers tag + magInput
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMag, magKey]);

  useEffect(
    () => () =>
      setMag((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return null;
      }),
    [],
  );

  const currentKey = isGen ? optsKey : isMag ? magKey : null;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

  // upload the chosen generated cover, debounced (换一张 / tags / title edits coalesce)
  const uploadedFor = useRef<{ key: string; hash: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runUpload = useCallback((key: string, make: () => Promise<File>) => {
    if (timer.current) clearTimeout(timer.current);
    setUploading(key);
    setUploadError(null);
    timer.current = setTimeout(() => {
      void make()
        .then((file) => uploadImage(file, cb.current.upload))
        .then((asset) => {
          uploadedFor.current = { key, hash: asset.hash };
          if (key === currentKeyRef.current) cb.current.onChange?.(asset.hash);
        })
        .catch(() => setUploadError(key))
        .finally(() => setUploading((k) => (k === key ? null : k)));
    }, UPLOAD_DEBOUNCE);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (isGen) {
      if (uploadedFor.current?.key === optsKey) return;
      runUpload(optsKey, () => generateCoverFile({ ...opts, size: 'card' }));
    } else if (isMag) {
      if (uploadedFor.current?.key === magKey || mag?.key !== magKey) return;
      const file = mag.file;
      runUpload(magKey, async () => file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, optsKey, magKey, mag]);

  // 手动填写: a small picture of each generator style for this title (debounced while typing)
  const [thumbs, setThumbs] = useState<Partial<Record<CoverStyle, string>>>({});
  useEffect(() => {
    if (!manual) return;
    const t = setTimeout(() => {
      const next: Partial<Record<CoverStyle, string>> = {};
      for (const k of MANUAL_COVER_STYLES) {
        try {
          const full = renderCover({
            title,
            author,
            category,
            blogName,
            handle,
            style: k,
            seed: `${noteId}:${seedN}`,
            size: 'card',
          });
          const small = document.createElement('canvas');
          small.width = MANUAL_THUMB.w;
          small.height = MANUAL_THUMB.h;
          small.getContext('2d')?.drawImage(full, 0, 0, MANUAL_THUMB.w, MANUAL_THUMB.h);
          next[k] = small.toDataURL('image/jpeg', 0.85);
        } catch {
          /* no canvas (tests): the label alone */
        }
      }
      setThumbs(next);
    }, 250);
    return () => clearTimeout(t);
  }, [manual, title, author, category, blogName, handle, noteId, seedN]);

  const chooseTag = (next: CoverTag) => {
    setTag(next);
    if (next === 'none') {
      cb.current.onChange?.(undefined);
      return;
    }
    if (next === 'image') {
      const first = image ?? imageCands[0];
      if (first) {
        setImage(first);
        cb.current.onChange?.(first.hash);
      }
      return;
    }
    const key = isTemplateKey(next)
      ? `mag|${next}|${JSON.stringify(magInput)}`
      : `gen|${JSON.stringify({ ...opts, style: next })}`;
    cb.current.onChange?.(uploadedFor.current?.key === key ? uploadedFor.current.hash : undefined);
  };
  const chooseImage = (c: { url: string; hash: string }) => {
    setTag('image');
    setImage(c);
    cb.current.onChange?.(c.hash);
  };
  /** 上传 (相册 / 拍照): through the normal asset flow, then chosen as the cover. Throws when the upload fails. */
  const [fileUploading, setFileUploading] = useState(false);
  const uploadFile = async (file: File) => {
    setFileUploading(true);
    try {
      const asset = await uploadImage(file, cb.current.upload);
      const c = { url: asset.url, hash: asset.hash };
      setUploaded((u) => [c, ...u.filter((x) => x.hash !== c.hash)]);
      chooseImage(c);
      return c;
    } finally {
      setFileUploading(false);
    }
  };
  const reroll = () => (isMag ? setMagRound((n) => n + 1) : setSeedN((n) => n + 1));

  const busy =
    currentKey !== null &&
    (uploading === currentKey ||
      (uploadedFor.current?.key !== currentKey && uploadError !== currentKey));
  const magPending = isMag && mag?.key !== magKey && magFailed !== magKey;
  const magBad = isMag && magFailed === magKey;
  const upBad = !isImage && currentKey !== null && uploadError === currentKey;
  const state: string | null =
    isImage || isNone
      ? null
      : magBad
        ? '排版失败，换一张试试'
        : upBad
          ? '上传失败，换一张试试'
          : magPending
            ? '排版中…'
            : busy
              ? '上传中…'
              : '已就绪';
  const ready = isNone ? true : isImage ? Boolean(image) : state === '已就绪';
  const shown = isNone
    ? null
    : isImage
      ? (image?.url ?? null)
      : isMag
        ? mag?.key === magKey
          ? mag.url
          : (mag?.url ?? null)
        : preview;

  const source: CoverSource | null = useMemo(() => {
    if (isNone) return null;
    if (isImage) return image ? { kind: 'image', url: image.url, hash: image.hash } : null;
    if (isGen) return { kind: 'generated', opts };
    return { kind: 'magazine', template: tag as TemplateKey, input: magInput };
  }, [isNone, isImage, isGen, image, opts, tag, magInput]);
  const sourceKey = coverSourceKey(source);
  useEffect(() => {
    cb.current.onSourceChange?.(source);
    // keyed by content, not identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // 各平台尺寸: every published size, rendered by the same path the publish step uploads
  const [sizes, setSizes] = useState<{
    key: string;
    map: Partial<Record<CoverVariantKey, string>>;
  }>({ key: '', map: {} });
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const made: string[] = [];
    const t = setTimeout(() => {
      setSizes({ key: sourceKey, map: {} });
      VARIANT_KEYS.forEach((k) => {
        renderVariantFile(source, k)
          .then((file) => {
            if (cancelled) return;
            const url = URL.createObjectURL(file);
            made.push(url);
            setSizes((u) =>
              u.key === sourceKey ? { key: u.key, map: { ...u.map, [k]: url } } : u,
            );
          })
          .catch(() => undefined);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  const sizeMap = sizes.key === sourceKey ? sizes.map : EMPTY;

  useEffect(() => {
    cb.current.onPreview?.({ main: shown ?? undefined, variants: sizeMap });
  }, [shown, sizeMap]);

  const tiles: CoverSizeTile[] = [
    { key: 'card', ratio: '3:2', name: '主封面', w: 1200, h: 800, url: shown ?? undefined },
    ...VARIANT_KEYS.map((k) => ({
      key: k,
      ratio: VARIANT_LABELS[k].ratio,
      name: VARIANT_LABELS[k].name,
      w: VARIANT_SIZES[k].w,
      h: VARIANT_SIZES[k].h,
      url: sizeMap[k],
    })),
  ];

  const hint = isNone
    ? '还没有选封面：选一个，或者不用封面直接发布。'
    : isImage
      ? '用文中的图片作封面；各尺寸按画面重心裁切。'
      : isMag
        ? '标题、小标题、作者、分类和日期会自动排进版面；换一张换素材和构图。'
        : '标题会排进封面；同一篇文章每次生成的结果一致，换一张得到新的构图。';

  return {
    tags: coverTags(imageCands.length > 0),
    mode: manual ? ('manual' as const) : ('auto' as const),
    isNone,
    /** 手动填写: the article's own images and the pictures uploaded here, apart. */
    articleCands: articleCands.filter((c) => !uploaded.some((u) => u.hash === c.hash)),
    uploaded,
    uploadFile,
    fileUploading,
    /** 手动填写: a small picture per generator style (empty without a canvas). */
    thumbs,
    isGen,
    tag,
    chooseTag,
    reroll,
    imageCands,
    image,
    chooseImage,
    isImage,
    isMag,
    shown,
    state,
    bad: magBad || upBad,
    ready,
    source,
    tiles,
    hint,
  };
}

const EMPTY: Partial<Record<CoverVariantKey, string>> = {};
