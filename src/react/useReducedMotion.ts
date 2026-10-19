import { useEffect, useState } from 'react';

/** The phone app's in-app 「减弱动态效果」 switch puts this class on <html>; the web app never does. */
const APP_CLASS = 'sn-reduce-motion';

function current(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
    document.documentElement.classList.contains(APP_CLASS)
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(current);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(current());
    mq?.addEventListener?.('change', on);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(on) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq?.removeEventListener?.('change', on);
      mo?.disconnect();
    };
  }, []);
  return reduced;
}
