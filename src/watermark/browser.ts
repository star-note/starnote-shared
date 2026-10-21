import { watermarkCanvas, type WatermarkSpec } from './draw';

/**
 * Browser helper: an exported picture (a `Blob` / `File`) with its watermark painted on, same name, PNG or JPEG
 * like the input. `keepSize` (default) keeps the pixel size (a frame band crops the picture to make room).
 */
export async function watermarkFile(
  file: File,
  spec: WatermarkSpec | null | undefined,
  opts: { keepSize?: boolean } = {},
): Promise<File> {
  if (!spec?.plan.enabled || !canPaint()) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片加载失败'));
      el.src = url;
    });
    const canvas = watermarkCanvas<HTMLCanvasElement>(
      { source: img, width: img.naturalWidth, height: img.naturalHeight },
      { ...spec, keepSize: opts.keepSize ?? true },
    );
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片导出失败'))), type, 0.92),
    );
    return new File([blob], file.name, { type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

let paintable: boolean | null = null;
/** A 2D canvas is there (not in jsdom / very old browsers): otherwise the picture goes out as it is. */
function canPaint(): boolean {
  if (paintable === null) {
    try {
      paintable =
        typeof document !== 'undefined' &&
        Boolean(document.createElement('canvas').getContext('2d'));
    } catch {
      paintable = false;
    }
  }
  return paintable;
}
