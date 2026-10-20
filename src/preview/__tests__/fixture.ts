import type { PreviewArticle } from '../types';

export const article: PreviewArticle = {
  title: '写了一年技术博客之后',
  summary: '第一段就是摘要',
  html: '<p>正文第一段</p>',
  wechatHtml: '<section style="color:#333">公众号正文</section>',
  text: '正文第一段',
  author: '星辰示例',
  tags: ['随笔'],
  date: new Date('2026-10-15T10:00:00Z'),
  words: 600,
  variants: { og: 'blob:og', square: 'blob:sq', wide: 'blob:wide', portrait: 'blob:pt' },
  cover: 'blob:main',
  url: 'http://localhost:5174/@demo/abc',
};
