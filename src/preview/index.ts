/**
 * The publish preview (发布 → 预览): each chosen platform's article page (辰记博客, 微信公众号, 小红书, 知乎, 掘金, Medium,
 * GitHub Pages, 语雀) in a phone or browser frame, then the share / feed cards built from the cover sizes.
 *
 * A self-contained feature module, loaded on demand: app code reaches it only through a dynamic `import()` (see
 * `components/publish/LazyPreview.tsx`); ESLint rejects static value imports from outside this folder.
 *
 * Isolation:
 * - the UI renders in an open shadow root through its own React root, with its stylesheet (`styles/chrome.css`)
 *   inside it: the app's CSS does not apply and nothing leaks out;
 * - every article page renders in a same-origin `srcdoc` iframe sized to the device (375 × 812 phone, 1280 × 800
 *   browser) and scaled to fit, so its media queries see the device width. The platform looks
 *   (`styles/article.css`) and any `stylesheets` passed for that platform are injected into that iframe only;
 * - both sheets are Vite `?inline` strings: none of it reaches the app's stylesheet.
 */
export { PublishPreview, PreviewUI, type PublishPreviewProps } from './PublishPreview';
export { ArticleView } from './ArticleView';
export { ShareCards } from './ShareCards';
export {
  defaultDevice,
  type Device,
  PREVIEW_ORDER,
  previewPlatform,
  type PreviewPlatform,
  type PreviewPlatformMeta,
  SHARE_CARD_META,
  type ShareCardKind,
  shareCardsFor,
  VIEWPORT,
} from './platforms';
export { formatDate, readingMinutes } from './format';
export type { CoverVariantKey, PreviewArticle } from './types';

import { PublishPreview } from './PublishPreview';
/** `React.lazy(() => import('@/modules/publish-preview'))` takes the default export. */
export default PublishPreview;
