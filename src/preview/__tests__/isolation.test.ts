// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { PublishPreview } from '../PublishPreview';
import { article } from './fixture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isolation', () => {
  it('renders its UI in a shadow root and each platform page in an iframe, adding no style to the page', async () => {
    const headBefore = document.head.querySelectorAll('style, link').length;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(
        createElement(PublishPreview, {
          article,
          stylesheets: { chenji: ['.post-body{color:red}'] },
        }),
      ),
    );
    await flush();
    const host = el.querySelector('[data-pv-host]') as HTMLElement;
    const shadow = host.shadowRoot!;
    expect(shadow).toBeTruthy();
    expect(shadow.querySelector('style')?.textContent).toContain(':host');
    expect(shadow.querySelectorAll('iframe')).toHaveLength(1);
    expect(shadow.querySelector('[data-device]')?.getAttribute('data-device')).toBe('pc');
    expect(document.head.querySelectorAll('style, link').length).toBe(headBefore);
    // 微信公众号 opens on a phone
    const chip = [...shadow.querySelectorAll('button[role="checkbox"]')].find((b) =>
      b.textContent?.includes('微信公众号'),
    ) as HTMLButtonElement;
    await act(async () => chip.click());
    await flush();
    expect(shadow.querySelector('[data-device]')?.getAttribute('data-device')).toBe('mobile');
    expect(
      [...shadow.querySelectorAll('[data-card]')].map((n) => n.getAttribute('data-card')),
    ).toEqual(['chenji-link', 'wechat-chat', 'wechat-moments', 'mp-lead', 'mp-sub', 'x-card']);
    // 手机 / 电脑 overrides that platform's default
    const pc = [...shadow.querySelectorAll('button[role="radio"]')].find((b) =>
      b.textContent?.includes('电脑'),
    ) as HTMLButtonElement;
    await act(async () => pc.click());
    await flush();
    expect(shadow.querySelector('[data-device]')?.getAttribute('data-device')).toBe('pc');
    await act(async () => root.unmount());
  });
});
