import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Renders `children` inside an open shadow root with its own stylesheet, through a React root of its own (events
 * then dispatch inside the shadow tree). The host page's CSS does not reach in, and the preview's does not leak out.
 */
export function ShadowMount({
  css,
  children,
  className,
}: {
  css: string;
  children: ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<Root | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    mount.className = 'pv-root';
    shadow.replaceChildren(style, mount);
    container.current = mount;
    root.current = createRoot(mount);
    return () => {
      const r = root.current;
      root.current = null;
      // unmount after the current render pass (React forbids a synchronous unmount during render)
      queueMicrotask(() => r?.unmount());
    };
  }, [css]);

  useLayoutEffect(() => {
    root.current?.render(children);
  });

  return <div ref={host} className={className} data-pv-host="" />;
}
