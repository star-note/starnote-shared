import { useMemo, useState } from 'react';

import { ArticleView } from './ArticleView';
import { DeviceFrame } from './DeviceFrame';
import { DesktopIcon, PhoneIcon } from './icons';
import { IsolatedFrame } from './IsolatedFrame';
import {
  defaultDevice,
  type Device,
  PLATFORM_FORMAT,
  PREVIEW_ORDER,
  previewPlatform,
  type PreviewPlatform,
  type ShareCardKind,
  shareCardsFor,
} from './platforms';
import { Segmented } from './Segmented';
import { ShadowMount } from './ShadowMount';
import { ShareCards } from './ShareCards';
import { ARTICLE_CSS, CHROME_CSS } from './styles';
import type { PreviewArticle } from './types';

export interface PublishPreviewProps {
  article: PreviewArticle;
  /** Platforms chosen when the preview opens (辰记 is always on). */
  platforms?: PreviewPlatform[];
  /** The share cards to show; by default the ones that matter for the chosen platforms (`shareCardsFor`). */
  cards?: ShareCardKind[];
  /** The platform shown first (default 辰记); it is added to the chosen ones. */
  active?: PreviewPlatform;
  /** Start every platform on this device instead of its own default (the 手机 / 电脑 switch still works). */
  device?: Device;
  /**
   * Extra stylesheets (CSS text) for a platform's frame, e.g. the 辰记 blog's own sheet so its page is the real
   * thing. They are injected into that platform's iframe only.
   */
  stylesheets?: Partial<Record<PreviewPlatform, string[]>>;
}

/** Address-bar text for the browser frame. */
function frameUrl(p: PreviewPlatform, d: PreviewArticle): string {
  if (p === 'chenji') return d.url.replace(/^https?:\/\//, '');
  if (p === 'github') return `${d.handle || 'you'}.github.io/posts/…`;
  return `${previewPlatform(p).domain}/…`;
}

/**
 * The preview UI without isolation (tests, or a host that isolates it itself): the platform chips, each chosen
 * platform's article page in its usual device (phone for app-first platforms, a browser for blogs and docs;
 * 手机 / 电脑 switches), then the share cards. Every article page renders in its own iframe.
 */
export function PreviewUI({
  article: data,
  platforms: initial = ['chenji'],
  cards,
  device: forced,
  stylesheets,
  active: initialActive = 'chenji',
}: PublishPreviewProps) {
  const [platforms, setPlatforms] = useState<PreviewPlatform[]>(() =>
    PREVIEW_ORDER.filter((p) => p === 'chenji' || p === initialActive || initial.includes(p)),
  );
  const [active, setActive] = useState<PreviewPlatform>(initialActive);
  const [devices, setDevices] = useState<Partial<Record<PreviewPlatform, Device>>>({});
  const device = devices[active] ?? forced ?? defaultDevice(active);
  const meta = previewPlatform(active);
  const frameStyles = useMemo(
    () => [ARTICLE_CSS, ...(stylesheets?.[active] ?? [])],
    [active, stylesheets],
  );

  const toggle = (p: PreviewPlatform) => {
    if (p === 'chenji') return;
    if (platforms.includes(p)) {
      setPlatforms(platforms.filter((x) => x !== p));
      if (active === p) setActive('chenji');
    } else {
      setPlatforms(PREVIEW_ORDER.filter((x) => x === p || platforms.includes(x)));
      setActive(p);
    }
  };

  return (
    <div className="pv">
      <section className="pv-section" aria-label="预览平台">
        <div className="pv-head">
          <b>平台</b>
          <span className="muted">目前发布到辰记；选其他平台可先看效果</span>
        </div>
        <div className="pub-chips" role="group" aria-label="预览平台">
          {PREVIEW_ORDER.map((p) => {
            const m = previewPlatform(p);
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={p === 'chenji' || undefined}
                className={`pub-chip pv-chip${on ? ' on' : ''}`}
                onClick={() => toggle(p)}
                title={p === 'chenji' ? '辰记始终预览' : undefined}
              >
                <span className="plg">
                  <i style={{ background: m.color }}>{m.short}</i>
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="pv-section" aria-label="文章页">
        <div className="pv-head pv-head--bar">
          <b>文章页</b>
          {platforms.length > 1 ? (
            <Segmented<PreviewPlatform>
              label="平台"
              value={active}
              onChange={setActive}
              options={platforms.map((p) => ({ value: p, label: previewPlatform(p).label }))}
            />
          ) : (
            <span className="muted">{meta.label}</span>
          )}
          <Segmented<Device>
            label="设备"
            className="pv-device-toggle"
            value={device}
            onChange={(v) => setDevices((m) => ({ ...m, [active]: v }))}
            options={[
              {
                value: 'mobile',
                label: (
                  <>
                    <PhoneIcon /> 手机
                  </>
                ),
              },
              {
                value: 'pc',
                label: (
                  <>
                    <DesktopIcon /> 电脑
                  </>
                ),
              },
            ]}
          />
        </div>
        <DeviceFrame
          device={device}
          url={frameUrl(active, data)}
          label={`${meta.label} · ${device === 'mobile' ? '手机' : '电脑'}`}
        >
          {/* keyed by platform + device: a fresh document per page, so one platform's sheet never meets another's */}
          <IsolatedFrame
            key={`${active}-${device}`}
            title={`${meta.label}预览`}
            styles={frameStyles}
          >
            <ArticleView platform={active} device={device} data={data} />
          </IsolatedFrame>
        </DeviceFrame>
        <p className="pv-note muted">
          {meta.label}默认按{defaultDevice(active) === 'mobile' ? '手机' : '电脑'}预览
          {active === 'chenji' ? '，用的是博客文章页的真实样式' : '，版式为近似效果'}。
          {active !== 'chenji' ? (
            <>
              {' '}
              内容是该平台实际收到的格式（{PLATFORM_FORMAT[active].format}）
              {PLATFORM_FORMAT[active].losses.length
                ? `，无法保留：${PLATFORM_FORMAT[active].losses.join('；')}`
                : ''}
              。
            </>
          ) : null}
        </p>
      </section>

      <section className="pv-section" aria-label="分享卡片">
        <div className="pv-head">
          <b>分享卡片</b>
          <span className="muted">用封面的各平台尺寸生成</span>
        </div>
        <ShareCards kinds={cards ?? shareCardsFor(platforms)} data={data} />
      </section>
    </div>
  );
}

/** The publish preview, isolated: its UI in a shadow root, each platform page in its own iframe. */
export function PublishPreview(props: PublishPreviewProps) {
  return (
    <ShadowMount css={CHROME_CSS} className="sn-preview-host">
      <PreviewUI {...props} />
    </ShadowMount>
  );
}
