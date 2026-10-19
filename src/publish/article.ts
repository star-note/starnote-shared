/**
 * The published form of a note, rendered the way the editor renders it (SPEC: WYSIWYG publishing).
 *
 * `publication.html` is produced here, in JS, at publish time and stored on the publication, so the React blog,
 * the SSR / static blog and the mobile reader all serve the same HTML:
 *
 *   - the editor SDK's static renderer (`ai-sparkwrite-editor/static`): the editor's schema, the DOM of its
 *     node views (code blocks with the highlighter's token classes, line numbers and language label; image
 *     views with size / alignment / caption; tables with their column widths; task items, callouts, formulas…)
 *   - styled by the SDK's `content.css`, which `starnote-web` `pnpm blocks:sync` copies into every blog
 *     stylesheet under `.post-body`.
 *
 * `@starnote/publish-core`'s `convert` still provides the TOC, images, text, Markdown and the portable HTML;
 * its `headingId` names the headings on both sides so TOC links land.
 */
import {
  convert,
  convertWechat,
  headingId,
  type ConvertOptions,
  type Doc,
  type TiptapJSON,
  type WechatOptions,
  type WechatResult,
} from '@starnote/publish-core';
import {
  CODE_THEME,
  highlightCode,
  loadKatex,
  markdownToHTML,
  renderStaticHTML,
  type StaticKatex,
} from 'ai-sparkwrite-editor/static';

/**
 * First line of every stored article HTML: which renderer and format produced it. Bump the number when the
 * markup changes so `scripts/publish/backfill-html.mjs` re-renders older rows.
 */
export const ARTICLE_FORMAT = 1;
export const ARTICLE_MARKER = `<!--sn:article ${ARTICLE_FORMAT}-->`;

/** The format number a stored HTML was rendered with (`0`: the old converters / the server fallback). */
export function articleFormat(html: string | null | undefined): number {
  const m = /^\s*<!--sn:article (\d+)-->/.exec(html ?? '');
  return m ? Number(m[1]) : 0;
}

const LABELS = { copy: '复制代码', copied: '已复制', toc: '目录' };

export interface ArticleOptions {
  /** KaTeX, for formulas (see `loadArticleKatex`). Without it a formula shows its TeX source. */
  katex?: StaticKatex | null;
}

/** `true` when the document has a formula (and rendering it needs KaTeX). */
export function hasMath(json: TiptapJSON | null | undefined): boolean {
  if (!json || typeof json !== 'object') return false;
  if (json.type === 'katex') return true;
  return (json.content ?? []).some(hasMath);
}

/** KaTeX through the SDK's loader (the same copy the editor uses, plus its stylesheet in a browser). */
export function loadArticleKatex(): Promise<StaticKatex> {
  return loadKatex();
}

/** The stored article HTML: the editor's read-only rendering, heading ids matching `Doc.toc`. */
export function renderArticleHtml(json: TiptapJSON, opts: ArticleOptions = {}): string {
  const body = renderStaticHTML(json as Parameters<typeof renderStaticHTML>[0], {
    headingId: (text, index) => headingId(text, index),
    katex: opts.katex ?? null,
    labels: LABELS,
  });
  return `${ARTICLE_MARKER}\n${body}`;
}

/** `convert` with `html` from the editor's renderer: what the publish flow sends as `html` / `toc`. */
export function convertArticle(json: TiptapJSON, opts: ArticleOptions & ConvertOptions = {}): Doc {
  const { katex, ...rest } = opts;
  return convert(json, { ...rest, renderHtml: (root) => renderArticleHtml(root, { katex }) });
}

/**
 * `convertArticle` after loading what the document needs (KaTeX for formulas). Use it for the HTML that gets
 * published; the synchronous `convertArticle` is fine for a first preview.
 */
export async function prepareArticle(json: TiptapJSON, opts: ConvertOptions = {}): Promise<Doc> {
  const katex = hasMath(json) ? await loadArticleKatex().catch(() => null) : null;
  return convertArticle(json, { ...opts, katex });
}

/** The 公众号 HTML with the editor's highlighter and light code palette, every token coloured inline. */
export function convertWechatArticle(json: TiptapJSON, opts: WechatOptions = {}): WechatResult {
  return convertWechat(json, {
    highlight: (code, language) => highlightCode(code, language),
    codeTheme: CODE_THEME.light,
    ...opts,
  });
}

/**
 * What a Markdown platform (掘金, 知乎 import, GitHub Pages, 语雀 import) shows for the note: the converter's
 * Markdown rendered back to HTML with GFM. The preview uses it so each platform shows its real output.
 */
export function markdownPreviewHtml(doc: Pick<Doc, 'markdown'>): string {
  return markdownToHTML(doc.markdown);
}
