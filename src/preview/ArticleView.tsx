import { mobileHtml, mobileOptionsFor } from '@starnote/publish-core';
import type { ReactElement } from 'react';

import { formatDate, readingMinutes } from './format';
import {
  EllipsisIcon as EllipsisOutlined,
  HeartIcon as HeartOutlined,
  LeftIcon as LeftOutlined,
  MessageIcon as MessageOutlined,
  ShareIcon as ShareAltOutlined,
  StarIcon as StarOutlined,
} from './icons';
import { registryKey, type Device, type PreviewPlatform } from './platforms';
import type { PreviewArticle as PreviewData } from './types';

const XHS_TEXT_MAX = 280;

function Pic({ src, ratio, className }: { src?: string; ratio: string; className?: string }) {
  return src ? (
    <img
      className={`pv-pic${className ? ` ${className}` : ''}`}
      src={src}
      alt=""
      style={{ aspectRatio: ratio }}
    />
  ) : (
    <div
      className={`pv-pic pv-ph${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: ratio }}
      aria-hidden="true"
    />
  );
}

function Face({ name, src, size }: { name: string; src?: string | null; size: number }) {
  return src ? (
    <img className="pv-face" src={src} alt="" style={{ width: size, height: size }} />
  ) : (
    <span
      className="pv-face"
      style={{ width: size, height: size, fontSize: Math.max(10, size / 2.4) }}
      aria-hidden="true"
    >
      {(name || '?').slice(0, 1)}
    </span>
  );
}

/** The article HTML comes from our own converter over the author's document (as on the published page). */
/** The body as the platform receives it: phone-first images and tables on `mobileFirst` platforms. */
function forPlatform(platform: PreviewPlatform, html: string): string {
  const opts = mobileOptionsFor(registryKey(platform));
  return opts ? mobileHtml(html, opts).html : html;
}

function Body({ html, className }: { html: string; className: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 辰记: the real public post markup and blog styles; the phone frame applies the blog's own ≤640px rules. */
function Chenji({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`blog pv-cj${mobile ? ' pv-cj-m' : ''}`}>
      <nav className="pv-cj-nav">
        <b>{d.blogName || `${d.author} 的博客`}</b>
        {!mobile ? (
          <span className="pv-cj-links">
            <span>首页</span>
            {d.category ? <span>{d.category}</span> : null}
            <span>关于</span>
          </span>
        ) : null}
      </nav>
      <div className="blog-wrap">
        <div className="post-grid no-toc">
          <article className="post">
            <header className="post-head">
              <nav className="post-crumbs" aria-label="位置">
                <a>首页</a>
                {d.category ? (
                  <>
                    <span aria-hidden>›</span>
                    <a>{d.category}</a>
                  </>
                ) : null}
              </nav>
              <h1>{d.title || '无标题'}</h1>
              <div className="post-byline">
                <span className="post-author">
                  <Face name={d.author} src={d.avatarUrl} size={28} />
                  <span>{d.author}</span>
                </span>
                {d.groupName ? <span className="post-group">{d.groupName}</span> : null}
                <span className="post-meta-line">
                  <span>{formatDate(d.date, 'YYYY 年 M 月 D 日')}</span>
                  <span>{readingMinutes(d.words)} 分钟</span>
                </span>
              </div>
            </header>
            {d.cover ? <img className="post-cover" src={d.cover} alt="" /> : null}
            {d.html.includes('class="katex') ? (
              <link rel="stylesheet" href={d.katexHref ?? '/vendor/katex/katex.min.css'} />
            ) : null}
            <Body className="post-body" html={d.html} />
            {d.tags.length ? (
              <div className="post-tags">
                {d.tags.map((t) => (
                  <a key={t}>#{t}</a>
                ))}
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}

/** 微信公众号: no cover on the article page; account name in link blue; 17px body on a 677px column (PC). */
function Wechat({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-wx${mobile ? ' is-m' : ''}`}>
      {mobile ? (
        <div className="pv-appbar pv-wx-bar">
          <span>✕</span>
          <EllipsisOutlined />
        </div>
      ) : null}
      <div className="pv-wx-col">
        <h1>{d.title || '无标题'}</h1>
        <div className="pv-wx-meta">
          {d.author ? <span>{d.author}</span> : null}
          <a>{d.blogName || d.author || '公众号'}</a>
          <span>{formatDate(d.date, 'YYYY年M月D日 HH:mm')}</span>
        </div>
        <Body className="pv-wx-body" html={forPlatform('wechat', d.wechatHtml || d.html)} />
        <div className="pv-wx-foot">
          <span>阅读 10万+</span>
          <span>
            <HeartOutlined /> 在看
          </span>
        </div>
      </div>
    </div>
  );
}

/** 小红书: the 3:4 image leads, then a short text note with #tags (the app shows text, not rich layout). */
function Xiaohongshu({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  const text = d.text.length > XHS_TEXT_MAX ? `${d.text.slice(0, XHS_TEXT_MAX)}…` : d.text;
  const author = (
    <div className="pv-xhs-author">
      <Face name={d.author} src={d.avatarUrl} size={mobile ? 30 : 36} />
      <b>{d.author}</b>
      <span className="pv-xhs-follow">关注</span>
    </div>
  );
  const note = (
    <div className="pv-xhs-note">
      <h1>{d.title || '无标题'}</h1>
      <p>{text}</p>
      <p className="pv-xhs-tags">
        {(d.tags.length ? d.tags : d.category ? [d.category] : []).map((t) => `#${t}`).join(' ')}
      </p>
      <small>{formatDate(d.date, 'MM-DD')} 编辑于 上海</small>
    </div>
  );
  if (!mobile) {
    return (
      <div className="pv-xhs-pc">
        <div className="pv-xhs-card">
          <div className="pv-xhs-media">
            <Pic src={d.variants.portrait} ratio="3 / 4" />
          </div>
          <div className="pv-xhs-side">
            {author}
            {note}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pv-xhs is-m">
      <div className="pv-appbar">
        <LeftOutlined />
        {author}
        <ShareAltOutlined />
      </div>
      <div className="pv-xhs-media">
        <Pic src={d.variants.portrait} ratio="3 / 4" />
        <span className="pv-xhs-dots">
          <i className="on" />
        </span>
      </div>
      {note}
      <div className="pv-xhs-actions">
        <span className="pv-xhs-input">说点什么…</span>
        <HeartOutlined /> <StarOutlined /> <MessageOutlined />
      </div>
    </div>
  );
}

/** 知乎专栏: wide title image, title, author row with 关注, 16px body on a 690px column. */
function Zhihu({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-zh${mobile ? ' is-m' : ''}`}>
      {mobile ? (
        <div className="pv-appbar">
          <LeftOutlined />
          <span className="pv-zh-brand">知乎</span>
          <EllipsisOutlined />
        </div>
      ) : (
        <div className="pv-zh-top">
          <b>知乎</b>
          <span>首页</span>
          <span>专栏</span>
        </div>
      )}
      <div className="pv-zh-col">
        <Pic src={d.variants.wide ?? d.cover} ratio="2.35 / 1" className="pv-zh-cover" />
        <h1>{d.title || '无标题'}</h1>
        <div className="pv-zh-author">
          <Face name={d.author} src={d.avatarUrl} size={mobile ? 32 : 38} />
          <span>
            <b>{d.author}</b>
            <small>{d.summary.slice(0, 18) || '作者'}</small>
          </span>
          <span className="pv-zh-follow">+ 关注</span>
        </div>
        <Body className="pv-zh-body" html={forPlatform('zhihu', d.markdownHtml ?? d.html)} />
        <small className="pv-zh-date">发布于 {formatDate(d.date, 'YYYY-MM-DD HH:mm')}</small>
      </div>
    </div>
  );
}

/** 掘金: grey page, white article card (~820px), title, author line, cover, 15px body. */
function Juejin({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-jj${mobile ? ' is-m' : ''}`}>
      <div className="pv-jj-top">
        <b>稀土掘金</b>
        {!mobile ? (
          <>
            <span>首页</span>
            <span>沸点</span>
            <span>课程</span>
          </>
        ) : null}
      </div>
      <article className="pv-jj-card">
        <h1>{d.title || '无标题'}</h1>
        <div className="pv-jj-meta">
          <b>{d.author}</b>
          <span>{formatDate(d.date, 'YYYY-MM-DD HH:mm')}</span>
          <span>阅读 {readingMinutes(d.words)} 分钟</span>
        </div>
        {d.cover ? <Pic src={d.cover} ratio="3 / 2" className="pv-jj-cover" /> : null}
        <Body className="pv-jj-body" html={d.markdownHtml ?? d.html} />
      </article>
    </div>
  );
}

/** Medium: 680px column, big title, the summary as the subtitle, author row, wide lead image, serif 20px body. */
function Medium({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-md${mobile ? ' is-m' : ''}`}>
      <div className="pv-md-top">
        <b>Medium</b>
        <span>Write</span>
      </div>
      <article className="pv-md-col">
        <h1>{d.title || '无标题'}</h1>
        {d.summary ? <h2>{d.summary}</h2> : null}
        <div className="pv-md-author">
          <Face name={d.author} src={d.avatarUrl} size={mobile ? 32 : 44} />
          <span>
            <span>
              <b>{d.author}</b> · <a>Follow</a>
            </span>
            <small>
              {readingMinutes(d.words)} min read · {formatDate(d.date, 'MMM D, YYYY')}
            </small>
          </span>
        </div>
        <div className="pv-md-bar">
          <span>
            <HeartOutlined /> <MessageOutlined />
          </span>
          <span>
            <StarOutlined /> <ShareAltOutlined />
          </span>
        </div>
        <Pic src={d.variants.og ?? d.cover} ratio="1.91 / 1" className="pv-md-cover" />
        <Body className="pv-md-body" html={d.portableHtml ?? d.html} />
      </article>
    </div>
  );
}

/** GitHub Pages (Jekyll minima): site header, title, date, plain 16px body on a 740px column; no cover. */
function GithubPages({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-gh${mobile ? ' is-m' : ''}`}>
      <header className="pv-gh-head">
        <b>{d.blogName || d.author}</b>
        {!mobile ? <span>About</span> : <span>☰</span>}
      </header>
      <article className="pv-gh-col">
        <h1>{d.title || '无标题'}</h1>
        <p className="pv-gh-date">
          {formatDate(d.date, 'MMM D, YYYY')} · {d.author}
        </p>
        <Body className="pv-gh-body" html={d.markdownHtml ?? d.html} />
      </article>
    </div>
  );
}

/** 语雀: document tree on the left (PC), doc title and a 15px body on a 750px column. */
function Yuque({ d, mobile }: { d: PreviewData; mobile: boolean }) {
  return (
    <div className={`pv-yq${mobile ? ' is-m' : ''}`}>
      {!mobile ? (
        <aside className="pv-yq-tree">
          <b>{d.blogName || `${d.author} 的知识库`}</b>
          <span className="on">{d.title || '无标题'}</span>
          <span>目录</span>
          <span>更多文档</span>
        </aside>
      ) : (
        <div className="pv-appbar">
          <LeftOutlined />
          <span>语雀</span>
          <EllipsisOutlined />
        </div>
      )}
      <article className="pv-yq-col">
        <h1>{d.title || '无标题'}</h1>
        <p className="pv-yq-meta">
          {d.author} · {formatDate(d.date, 'YYYY-MM-DD HH:mm')}
        </p>
        <Body className="pv-yq-body" html={d.markdownHtml ?? d.html} />
      </article>
    </div>
  );
}

const VIEWS: Record<PreviewPlatform, (p: { d: PreviewData; mobile: boolean }) => ReactElement> = {
  chenji: Chenji,
  wechat: Wechat,
  xiaohongshu: Xiaohongshu,
  zhihu: Zhihu,
  juejin: Juejin,
  medium: Medium,
  github: GithubPages,
  yuque: Yuque,
};

/** The article page of `platform` as it would look on `device`. */
export function ArticleView({
  platform,
  device,
  data,
}: {
  platform: PreviewPlatform;
  device: Device;
  data: PreviewData;
}) {
  const View = VIEWS[platform];
  return <View d={data} mobile={device === 'mobile'} />;
}
