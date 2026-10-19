import { formatDate } from './format';
import { HeartIcon as HeartOutlined } from './icons';
import { type ShareCardKind, SHARE_CARD_META } from './platforms';
import type { PreviewArticle as PreviewData } from './types';

function Thumb({ src, ratio, className }: { src?: string; ratio: string; className?: string }) {
  return src ? (
    <img
      className={`pv-thumb${className ? ` ${className}` : ''}`}
      src={src}
      alt=""
      style={{ aspectRatio: ratio }}
    />
  ) : (
    <span
      className={`pv-thumb pv-ph${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: ratio }}
      aria-hidden="true"
    />
  );
}

function Face({ name, src }: { name: string; src?: string | null }) {
  return src ? (
    <img className="pv-face" src={src} alt="" />
  ) : (
    <span className="pv-face">{(name || '?').slice(0, 1)}</span>
  );
}

function hostOf(url: string) {
  try {
    return new URL(
      url,
      typeof window === 'undefined' ? 'https://starnote.app' : window.location.origin,
    ).host;
  } catch {
    return url;
  }
}

function Card({ kind, d }: { kind: ShareCardKind; d: PreviewData }) {
  const title = d.title || '无标题';
  const summary = d.summary;
  const host = hostOf(d.url);
  const v = d.variants;
  switch (kind) {
    case 'chenji-link':
      return (
        <div className="pv-sc-link-lg">
          <Thumb src={v.og ?? d.cover} ratio="1.91 / 1" />
          <div>
            <small>{host}</small>
            <b>{title}</b>
            {summary ? <p>{summary}</p> : null}
          </div>
        </div>
      );
    case 'wechat-chat':
      return (
        <div className="pv-sc-scene pv-sc-wx">
          <Face name={d.author} src={d.avatarUrl} />
          <div className="pv-sc-wxchat">
            <b>{title}</b>
            <div>
              <p>{summary || host}</p>
              <Thumb src={v.square} ratio="1 / 1" />
            </div>
            <small>{d.blogName || '辰记'}</small>
          </div>
        </div>
      );
    case 'wechat-moments':
      return (
        <div className="pv-sc-moments">
          <Face name={d.author} src={d.avatarUrl} />
          <div>
            <b className="pv-sc-name">{d.author}</b>
            <p>刚写完，分享一下。</p>
            <div className="pv-sc-moments-link">
              <Thumb src={v.square} ratio="1 / 1" />
              <span>{title}</span>
            </div>
            <small>1 分钟前</small>
          </div>
        </div>
      );
    case 'mp-lead':
      return (
        <div className="pv-sc-mp">
          <small className="pv-sc-mp-time">{formatDate(d.date, 'HH:mm')}</small>
          <div className="pv-sc-mp-card">
            <div className="pv-sc-mp-lead">
              <Thumb src={v.wide} ratio="2.35 / 1" />
              <b>{title}</b>
            </div>
            <div className="pv-sc-mp-row pv-sc-ghost">
              <span>次条文章的标题</span>
              <span className="pv-thumb pv-ph" />
            </div>
          </div>
        </div>
      );
    case 'mp-sub':
      return (
        <div className="pv-sc-mp">
          <div className="pv-sc-mp-card">
            <div className="pv-sc-mp-lead pv-sc-ghost">
              <span className="pv-thumb pv-ph" style={{ aspectRatio: '2.35 / 1' }} />
              <b>头条文章</b>
            </div>
            <div className="pv-sc-mp-row">
              <span>{title}</span>
              <Thumb src={v.square} ratio="1 / 1" />
            </div>
          </div>
        </div>
      );
    case 'x-card':
      return (
        <div className="pv-sc-x">
          <div className="pv-sc-x-head">
            <Face name={d.author} src={d.avatarUrl} />
            <span>
              <b>{d.author}</b> <small>@{d.handle || 'starnote'} · 1m</small>
            </span>
          </div>
          <div className="pv-sc-x-card">
            <Thumb src={v.og} ratio="1.91 / 1" />
            <div>
              <small>{host}</small>
              <span>{title}</span>
            </div>
          </div>
        </div>
      );
    case 'xhs-note':
      return (
        <div className="pv-sc-xhs">
          <div className="pv-sc-xhs-card">
            <Thumb src={v.portrait} ratio="3 / 4" />
            <b>{title}</b>
            <span>
              <Face name={d.author} src={d.avatarUrl} />
              <em>{d.author}</em>
              <HeartOutlined /> 128
            </span>
          </div>
          <div className="pv-sc-xhs-card pv-sc-ghost" aria-hidden="true">
            <span className="pv-thumb pv-ph" style={{ aspectRatio: '3 / 4' }} />
            <b>其他笔记</b>
          </div>
        </div>
      );
    case 'link':
      return (
        <div className="pv-sc-unfurl">
          <div>
            <small>{d.blogName || host}</small>
            <b>{title}</b>
            {summary ? <p>{summary}</p> : null}
          </div>
          <Thumb src={v.og} ratio="1.91 / 1" />
        </div>
      );
  }
}

/** The share / feed cards for the chosen platforms, drawn with the generated cover sizes and the live title / summary. */
export function ShareCards({ kinds, data }: { kinds: ShareCardKind[]; data: PreviewData }) {
  return (
    <div className="pv-cards">
      {kinds.map((k) => (
        <figure key={k} className="pv-card" data-card={k} aria-label={SHARE_CARD_META[k].title}>
          <figcaption>
            <b>{SHARE_CARD_META[k].title}</b>
            <span>{SHARE_CARD_META[k].hint}</span>
          </figcaption>
          <Card kind={k} d={data} />
        </figure>
      ))}
    </div>
  );
}
