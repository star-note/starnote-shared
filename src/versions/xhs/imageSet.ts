import type { ImageSetContent, MediaAsset } from '@starnote/publish-core';

import type { XhsCard, XhsContent } from '../../api/versions';

/** The export size (kept here so the publish panel doesn't pull in the canvas templates). */
const XHS_CARD_SIZE = { w: 1080, h: 1440 };

/**
 * A saved 小红书图集 as the publish SDK's `image-set` content (CONTRACTS-r9 §3): the exported PNGs in card order
 * (the first is the cover), the 正文 and the 话题. Cards that were never exported are left out — `xhsUnrendered`
 * tells the publish panel to ask for 保存 (which exports) first.
 */
export function xhsToImageSet(
  version: { title: string; content: XhsContent },
  /** Accepted for symmetry with article content; 小红书 / Instagram captions carry no links (platform rules). */
  _canonicalUrl?: string,
): ImageSetContent {
  const cards = version.content?.cards ?? [];
  const images: MediaAsset[] = cards
    .filter((c): c is XhsCard & { render: NonNullable<XhsCard['render']> } => Boolean(c.render?.url))
    .map((c) => ({
      url: c.render.url,
      hash: c.render.asset_hash || undefined,
      mime: 'image/png',
      width: XHS_CARD_SIZE.w,
      height: XHS_CARD_SIZE.h,
      alt: c.title || undefined,
    }));
  const cover = cards.find((c) => c.kind === 'cover');
  return {
    kind: 'image-set',
    title: (version.title || cover?.title || '').trim(),
    caption: version.content?.caption ?? '',
    images,
    topics: [...(version.content?.topics ?? [])],
  };
}

/** Cards without an exported PNG (0 = ready to publish). */
export function xhsUnrendered(content: XhsContent | null | undefined): number {
  return (content?.cards ?? []).filter((c) => !c.render?.url).length;
}

/** The text a phone share / 复制正文 carries: the 正文 then the 话题 as `#话题`. */
export function xhsShareText(content: Pick<XhsContent, 'caption' | 'topics'>): string {
  const tags = (content.topics ?? []).map((t) => `#${t}`).join(' ');
  return [content.caption?.trim(), tags].filter(Boolean).join('\n\n');
}
