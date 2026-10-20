import { wechatApi } from '../api/wechat';

/**
 * Custom share card inside WeChat (微信 JS-SDK). WeChat ignores Open Graph: without `wx.updateAppMessageShareData`
 * it shows the page title with a default icon / the first image. That call needs a verified 公众号 whose
 * 「JS接口安全域名」 lists this domain, plus a server signature — so this is a no-op unless we are inside WeChat
 * *and* the API answers `enabled: true` (WECHAT_JSSDK_APPID / WECHAT_JSSDK_SECRET set). The SSR blog does the same
 * in blog.js.
 */
export interface WechatShareData {
  title: string;
  desc: string;
  link: string;
  imgUrl?: string | null;
}

interface Wx {
  config(c: Record<string, unknown>): void;
  ready(fn: () => void): void;
  updateAppMessageShareData(d: Record<string, unknown>): void;
  updateTimelineShareData(d: Record<string, unknown>): void;
}

const SDK = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';

export function isWechat(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  return /MicroMessenger/i.test(ua);
}

function loadSdk(): Promise<Wx | undefined> {
  const w = window as unknown as { wx?: Wx };
  if (w.wx) return Promise.resolve(w.wx);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SDK;
    s.onload = () => resolve(w.wx);
    s.onerror = () => resolve(undefined);
    document.head.appendChild(s);
  });
}

export async function setupWechatShare(data: WechatShareData): Promise<boolean> {
  if (!isWechat()) return false;
  try {
    const cfg = await wechatApi.jssdkSignature(window.location.href.split('#')[0]);
    if (!cfg?.enabled) return false;
    const wx = await loadSdk();
    if (!wx) return false;
    wx.config({
      debug: false,
      appId: cfg.app_id,
      timestamp: cfg.timestamp,
      nonceStr: cfg.nonce_str,
      signature: cfg.signature,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
    });
    const imgUrl = data.imgUrl ?? '';
    wx.ready(() => {
      wx.updateAppMessageShareData({ title: data.title, desc: data.desc, link: data.link, imgUrl });
      wx.updateTimelineShareData({ title: data.title, link: data.link, imgUrl });
    });
    return true;
  } catch {
    return false;
  }
}
