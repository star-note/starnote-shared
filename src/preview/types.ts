/** Cover sizes the share cards and some platforms use (rendered by the host). */
export type CoverVariantKey = 'og' | 'wide' | 'square' | 'portrait' | (string & {});

/** Everything the preview draws. The host fills it live from its publish form and cover field. */
export interface PreviewArticle {
  title: string;
  summary: string;
  /** Article HTML from the publish converter (the same markup as the post body). */
  html: string;
  /** The same article as inline-styled 公众号 HTML (`convertWechat`); the 公众号 page prefers it. */
  wechatHtml?: string;
  /** The Markdown the Markdown platforms (知乎 import, 掘金, GitHub Pages, 语雀) receive, rendered with GFM. */
  markdownHtml?: string;
  /** Classless semantic HTML, for platforms that take pasted HTML and drop styles (Medium). */
  portableHtml?: string;
  /** Plain text of the article (小红书 shows text, not HTML). */
  text: string;
  author: string;
  avatarUrl?: string | null;
  blogName?: string;
  handle?: string;
  /** A group's name: the 辰记 byline names it next to the author. */
  groupName?: string;
  category?: string;
  tags: string[];
  date: Date;
  words: number;
  /** The 3:2 main cover. */
  cover?: string;
  /** Rendered cover sizes (URLs; object URLs work too). */
  variants: Partial<Record<CoverVariantKey, string>>;
  /** KaTeX stylesheet for the 辰记 frame when the html has formulas (default: the web's `/vendor/katex/katex.min.css`). */
  katexHref?: string;
  /** The article's 辰记 address (the post, or the blog root before the first publish). */
  url: string;
}
