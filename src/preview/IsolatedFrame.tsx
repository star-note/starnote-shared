import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SRC_DOC =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';

/**
 * A same-origin `srcdoc` iframe the platform page renders into: its stylesheets (the platform look, the 辰记 blog
 * sheet) live only inside it, and nothing of the host page's CSS reaches it. Media queries see the device width.
 */
export function IsolatedFrame({
  title,
  styles,
  className,
  children,
}: {
  title: string;
  styles: string[];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      if (!doc.head.querySelector('base') && typeof window !== 'undefined') {
        // relative asset URLs in the article resolve against the host page
        const base = doc.createElement('base');
        base.href = window.location.href;
        doc.head.prepend(base);
      }
      setBody(doc.body);
    };
    // srcdoc documents may already be parsed (same task) or still loading
    if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body) attach();
    frame.addEventListener('load', attach);
    return () => frame.removeEventListener('load', attach);
  }, []);

  // stylesheets: replaced in place so a change (or a new platform) never reloads the frame
  useEffect(() => {
    const doc = body?.ownerDocument;
    if (!doc) return;
    doc.head.querySelectorAll('style[data-pv]').forEach((n) => n.remove());
    styles.forEach((css, i) => {
      const el = doc.createElement('style');
      el.dataset.pv = String(i);
      el.textContent = css;
      doc.head.appendChild(el);
    });
  }, [body, styles]);

  return (
    <>
      <iframe
        ref={ref}
        title={title}
        className={className}
        srcDoc={SRC_DOC}
        style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#fff' }}
      />
      {body ? createPortal(children, body) : null}
    </>
  );
}
