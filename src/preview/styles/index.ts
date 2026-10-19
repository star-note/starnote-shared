// The preview's own stylesheets as strings (Vite `?inline`, minified at build time): they are injected into its shadow
// root and its article iframes at runtime, never into the app's document.
import ARTICLE_CSS from './article.css?inline';
import CHROME_CSS from './chrome.css?inline';

/** The preview UI (chips, device frames, share cards), injected into its shadow root. */
export { CHROME_CSS };
/** The platform pages' looks, injected into each article iframe. */
export { ARTICLE_CSS };
