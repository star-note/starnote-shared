import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ArticleView } from '../ArticleView';
import { PREVIEW_ORDER } from '../platforms';
import { ShareCards } from '../ShareCards';
import { ARTICLE_CSS, CHROME_CSS } from '../styles';
import { article } from './fixture';

describe('article pages', () => {
  it('renders every platform on both devices with the live title', () => {
    for (const platform of PREVIEW_ORDER)
      for (const device of ['mobile', 'pc'] as const) {
        const html = renderToStaticMarkup(
          createElement(ArticleView, { platform, device, data: article }),
        );
        expect(html).toContain(platform === 'xiaohongshu' ? '写了一年技术博客之后' : '<h1');
      }
  });

  it('uses the 公众号 HTML on 公众号 and the real blog markup on 辰记', () => {
    expect(
      renderToStaticMarkup(
        createElement(ArticleView, { platform: 'wechat', device: 'mobile', data: article }),
      ),
    ).toContain('公众号正文');
    const cj = renderToStaticMarkup(
      createElement(ArticleView, { platform: 'chenji', device: 'pc', data: article }),
    );
    expect(cj).toContain('class="post-body"');
    expect(cj).toContain('blob:main');
  });

  it('draws share cards from the cover sizes', () => {
    const html = renderToStaticMarkup(
      createElement(ShareCards, { kinds: ['chenji-link', 'xhs-note'], data: article }),
    );
    expect(html).toContain('data-card="xhs-note"');
    expect(html).toContain('blob:pt');
    expect(html).toContain('blob:og');
  });

  it('keeps its styles to itself: no global selectors leak by name', () => {
    // the UI sheet is scoped to the shadow root (:host), the page sheet to the iframe document
    expect(CHROME_CSS).toContain(':host');
    expect(ARTICLE_CSS).toContain('.pv-wx');
    expect(CHROME_CSS).not.toContain('.pv-wx-body');
  });
});
