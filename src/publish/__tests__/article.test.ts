import type { TiptapJSON } from '@starnote/publish-core';
import { describe, expect, it, vi } from 'vitest';

import {
  ARTICLE_MARKER,
  articleFormat,
  convertArticle,
  convertWechatArticle,
  hasMath,
  markdownPreviewHtml,
} from '../article';
import { enhanceArticle } from '../enhance';


const text = (t: string): TiptapJSON => ({ type: 'text', text: t });
const doc: TiptapJSON = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, id: 'editor-uuid' }, content: [text('Intro')] },
    { type: 'codeBlock', attrs: { language: 'javascript' }, content: [text('const a = 1;\nreturn a;')] },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { colwidth: [120] }, content: [{ type: 'paragraph', content: [text('A')] }] },
            { type: 'tableHeader', attrs: { colwidth: [80] }, content: [{ type: 'paragraph', content: [text('B')] }] },
          ],
        },
      ],
    },
    { type: 'imageBlock', attrs: { src: '/api/v1/assets/x', width: 200, align: 'right', caption: 'Cap' } },
    { type: 'notAType', content: [{ type: 'paragraph', content: [text('kept')] }] },
  ],
};

describe('convertArticle', () => {
  const out = convertArticle(doc);

  it('stores the editor rendering with the format marker', () => {
    expect(out.html.startsWith(`${ARTICLE_MARKER}\n`)).toBe(true);
    expect(articleFormat(out.html)).toBe(1);
    expect(articleFormat('<p>old</p>')).toBe(0);
  });

  it('highlights code with the editor token classes, line numbers and the language label', () => {
    expect(out.html).toContain('<pre class="shj"><code class="language-javascript"><span class="shj-kwd">const</span>');
    expect(out.html).toContain('<div aria-hidden="true" class="richtext-code-block__gutter"><span>1</span><span>2</span></div>');
    expect(out.html).toContain('<span class="richtext-code-block__lang">Javascript</span>');
    expect(out.html).toContain('aria-label="复制代码"');
  });

  it('keeps column widths, image size / alignment / caption and unknown content', () => {
    expect(out.html).toContain('<div class="tableWrapper"><table style="width: 200px;"><colgroup><col style="width: 120px;"><col style="width: 80px;"></colgroup>');
    expect(out.html).toContain('style="display: block; text-align: right;"');
    expect(out.html).toMatch(/style="width: 200px; transform: none;?"/);
    expect(out.html).toContain('<figcaption class="image-view__caption" style="text-align: right;">Cap</figcaption>');
    expect(out.html).toContain('<p>kept</p>');
  });

  it('names headings like the TOC', () => {
    expect(out.toc).toEqual([{ id: 'h-0-intro', level: 2, text: 'Intro' }]);
    expect(out.html).toContain('<h2 id="h-0-intro">Intro</h2>');
  });

  it('detects formulas', () => {
    expect(hasMath(doc)).toBe(false);
    expect(hasMath({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'katex', attrs: { text: 'x' } }] }] })).toBe(true);
  });
});

describe('convertWechatArticle', () => {
  it('colours code tokens inline with the editor palette', () => {
    const { html } = convertWechatArticle(doc);
    expect(html).toContain('<span style="color: #cf222e">const</span>');
    expect(html).not.toContain('class=');
  });
});

describe('markdownPreviewHtml', () => {
  it('renders the Markdown a platform receives', () => {
    const html = markdownPreviewHtml(convertArticle(doc));
    expect(html).toContain('<code class="language-javascript">');
    expect(html).toContain('<img src="/api/v1/assets/x" alt="Cap" width="200">');
  });
});

describe('enhanceArticle', () => {
  it('shows and wires the copy buttons', async () => {
    const root = document.createElement('div');
    root.innerHTML = convertArticle(doc).html;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const cleanup = enhanceArticle(root);
    const button = root.querySelector<HTMLButtonElement>('button[data-sn-copy]')!;
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(button.hasAttribute('data-copied')).toBe(true));
    expect(writeText).toHaveBeenCalledWith('const a = 1;\nreturn a;');
    cleanup();
  });
});
