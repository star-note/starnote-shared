import { platformMeta } from '@starnote/publish-core';

import type { WatermarkContent, WatermarkSpec } from './draw';
import {
  FONT_RATIO,
  MIN_CAMERA_FONT,
  MIN_SHORT_SIDE,
  qrLevelFor,
  type WatermarkImage,
  type WatermarkPlan,
  type WatermarkPrefs,
  watermarkPrefsOf,
  WATERMARK_DEFAULTS,
} from './layout';

/**
 * Which watermark a picture gets on which platform (r10): reads the platforms' `rules` from
 * `@starnote/publish-core` (禁止二维码 / 导流 / 外链). Kept apart from `layout.ts` / `draw.ts` so pages that only paint
 * a planned watermark (blog thumbnails) do not load the platform registry.
 */

/* ------------------------------------------------------------------ platform rules */

/** The parts of a platform's `rules` (`@starnote/publish-core`) the watermark reads. */
export interface WatermarkRules {
  noQrcode?: boolean;
  noContact?: boolean;
  externalLinks?: 'allowed' | 'stripped' | 'forbidden';
}

/** A registry key, or a platform described inline (tests, platforms outside the registry). */
export type WatermarkTarget = string | { key?: string; label?: string; rules?: WatermarkRules };

export interface QrPolicy {
  /** A QR code (and the link it carries) may go on the picture. */
  allowed: boolean;
  /** Labels of the platforms that forbid it. */
  blockedBy: string[];
  /** Why not, in one short sentence for the UI. */
  note: string | null;
}

function describe(t: WatermarkTarget): { label: string; rules: WatermarkRules | undefined } {
  if (typeof t === 'string') {
    const meta = platformMeta(t);
    return { label: meta?.label ?? t, rules: meta?.rules };
  }
  const meta = t.key ? platformMeta(t.key) : undefined;
  return { label: t.label ?? meta?.label ?? t.key ?? '', rules: t.rules ?? meta?.rules };
}

/** 禁止二维码 or 禁止导流 (contact details, off-site links): the picture carries no code and no link. */
export const forbidsLinks = (r: WatermarkRules | undefined): boolean =>
  Boolean(r && (r.noQrcode || r.noContact || r.externalLinks === 'forbidden'));

/**
 * May the picture carry a QR code on `targets`? One platform, several (the strictest wins) or `null` — a picture
 * that rides along with the article to platforms not known yet (配图), which is kept to the plain text.
 */
export function qrPolicy(
  targets: WatermarkTarget | readonly WatermarkTarget[] | null | undefined,
): QrPolicy {
  if (targets === null || targets === undefined)
    return { allowed: false, blockedBy: [], note: '图片会随正文发到多个平台，统一用纯文字版' };
  const list = (Array.isArray(targets) ? targets : [targets]) as WatermarkTarget[];
  const blockedBy = list
    .map(describe)
    .filter((d) => forbidsLinks(d.rules))
    .map((d) => d.label);
  if (!blockedBy.length) return { allowed: true, blockedBy, note: null };
  const names =
    blockedBy.slice(0, 3).join('、') +
    (blockedBy.length > 3 ? ` 等 ${blockedBy.length} 个平台` : '');
  return {
    allowed: false,
    blockedBy,
    note: list.length === 1 ? '该平台不允许二维码' : `${names}不允许二维码，统一用纯文字版`,
  };
}

/**
 * What to draw on a `image.w × image.h` picture bound for `platform` (a registry key, several, or `null` for an
 * article picture whose platforms are not known). `opts.url` = where the code points (the post's short link, else
 * the author's blog); without it the camera strip has no code to show and the text line is used.
 */
export function watermarkPlan(
  platform: WatermarkTarget | readonly WatermarkTarget[] | null | undefined,
  image: WatermarkImage,
  prefs: Partial<WatermarkPrefs> | null | undefined = WATERMARK_DEFAULTS,
  opts: { url?: string | null } = {},
): WatermarkPlan {
  const p = watermarkPrefsOf(prefs);
  const policy = qrPolicy(platform);
  const short = Math.min(image.w, image.h);
  const base = { layout: p.style, blockedBy: policy.blockedBy, links: policy.allowed };
  const text = (reason: WatermarkPlan['reason'], note: string | null): WatermarkPlan => ({
    ...base,
    enabled: true,
    variant: 'text',
    qr: false,
    reason,
    note,
    url: null,
    ecc: null,
  });
  if (!p.enabled) return { ...text('off', '水印已关闭'), enabled: false };
  if (!(short >= MIN_SHORT_SIDE)) return { ...text('tiny', '图片太小，不加水印'), enabled: false };
  if (!policy.allowed)
    return text(platform === null || platform === undefined ? 'multi' : 'platform', policy.note);
  if (!p.qr) return text('pref', null);
  if (short * FONT_RATIO < MIN_CAMERA_FONT) return text('small', '图片较小，用纯文字版');
  const url = opts.url?.trim() || null;
  if (!url) return text('no-url', '还没有可指向的链接，用纯文字版');
  const ecc = qrLevelFor(url, short);
  if (!ecc) return text('small', '图片较小，二维码扫不出，用纯文字版');
  return {
    ...base,
    enabled: true,
    variant: 'camera',
    qr: true,
    reason: null,
    note: null,
    url,
    ecc,
  };
}

/** Everything a renderer needs besides the platform and the size: the author's choice and the words. */
export interface WatermarkInput extends WatermarkContent {
  prefs?: Partial<WatermarkPrefs> | null;
  /** Where the code points: the post's short link, else the author's blog. */
  url?: string | null;
}

/** `watermarkPlan` + the words, ready for `drawWatermark` / `CoverOptions.watermark` / card `watermark`. */
export function watermarkSpec(
  platform: WatermarkTarget | readonly WatermarkTarget[] | null | undefined,
  image: WatermarkImage,
  input: WatermarkInput,
): WatermarkSpec {
  const { prefs, url, ...content } = input;
  return { ...content, plan: watermarkPlan(platform, image, prefs, { url }) };
}
