import { render, screen } from '@testing-library/react';
import { act } from 'react';

import { useI18n } from '../../i18n';
import { Lockup, Mark } from '../Logo';
import { BRAND_SKY, LOCKUP, MARK } from '../paths.gen';

describe('brand logo', () => {
  afterEach(() => act(() => useI18n.getState().setLang('zh-CN')));

  it('lockup follows the UI language', () => {
    act(() => useI18n.getState().setLang('zh-CN'));
    const { rerender } = render(<Lockup />);
    expect(screen.getByRole('img', { name: '辰记 StarNote' })).toBeInTheDocument();
    act(() => useI18n.getState().setLang('en'));
    rerender(<Lockup />);
    const svg = screen.getByRole('img', { name: 'StarNote' });
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${LOCKUP.en.plain.w} ${LOCKUP.en.plain.h}`);
  });

  it('an explicit lang wins, and slogan adds the slogan line and its device', () => {
    act(() => useI18n.getState().setLang('en'));
    const plain = render(<Lockup lang="zh-CN" />);
    const n = plain.container.querySelectorAll('svg > path').length;
    plain.unmount();
    const { container } = render(<Lockup lang="zh-CN" slogan />);
    expect(screen.getByRole('img', { name: '辰记 StarNote' })).toBeInTheDocument();
    expect(container.querySelector(`path[d="${LOCKUP['zh-CN'].slogan.slogan}"]`)).not.toBeNull();
    expect(container.querySelectorAll('svg > path').length).toBe(n + 2);
  });

  it('mark is decorative without a title and switches to the small cut at 32px', () => {
    const { container, rerender } = render(<Mark size={24} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.getAttribute('viewBox')).not.toBe('0 0 100 100');
    rerender(<Mark size={64} title="辰记" />);
    expect(screen.getByRole('img', { name: '辰记' }).getAttribute('viewBox')).toBe('0 0 100 100');
  });

  it('animates only when asked, with unique gradient ids per instance', () => {
    const { container } = render(
      <>
        <Mark size={64} />
        <Mark size={64} animated />
      </>,
    );
    const [still, moving] = container.querySelectorAll('svg');
    expect(still.classList.contains('sn-anim')).toBe(false);
    expect(still.querySelector('style')).toBeNull();
    expect(moving.classList.contains('sn-anim')).toBe(true);
    expect(moving.querySelector('style')?.textContent).toContain('prefers-reduced-motion');
    expect(moving.querySelector('.sn-draw')).not.toBeNull();
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mono and flat variants drop the gradient', () => {
    const { container } = render(<Mark size={64} variant="mono" />);
    expect(container.querySelector('linearGradient')).toBeNull();
    expect(container.querySelector('path')?.getAttribute('style')?.toLowerCase()).toContain(
      'currentcolor',
    );
  });

  it('tone="dark" lifts the night sky, and the colour mark carries the sea', () => {
    const { container } = render(
      <>
        <Mark size={64} />
        <Mark size={64} tone="dark" />
      </>,
    );
    const [light, dark] = container.querySelectorAll('svg');
    const firstStop = (svg: Element) =>
      svg.querySelector('linearGradient stop')?.getAttribute('stop-color');
    expect(firstStop(light)).toBe(BRAND_SKY.light[0][1]);
    expect(firstStop(dark)).toBe(BRAND_SKY.dark[0][1]);
    expect(light.querySelectorAll('clipPath').length).toBe(1);
    expect(light.querySelectorAll('.sn-swell').length).toBe(3);
  });
});

describe('lockup geometry (paths.gen)', () => {
  const ys = (d: string) => {
    const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
    return { lo: Math.min(...n), hi: Math.max(...n) };
  };
  it('every one-line lockup centres its word on the C of the mark, not on the box that holds the pen', () => {
    const body = ys(MARK.body);
    const mid = (body.lo + body.hi) / 2;
    for (const lang of Object.keys(LOCKUP) as (keyof typeof LOCKUP)[]) {
      const L = LOCKUP[lang].plain;
      const w = ys(L.word);
      // within 1.5 % of the mark's height (outline control points make the box a hair loose)
      expect(Math.abs((w.lo + w.hi) / 2 - (L.ty + mid)), lang).toBeLessThan(1.5);
    }
  });
});
