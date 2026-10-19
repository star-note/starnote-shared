import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from './useReducedMotion';

/** Animates 0 → target once (ease-out) when the target first arrives; instant when motion is reduced.
 *  `played` is only set when the run finishes, so StrictMode's mount → unmount → mount still animates. */
export function useCountUp(target: number, duration = 1100): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const played = useRef(false);
  useEffect(() => {
    if (played.current || reduced) {
      setValue(target);
      return;
    }
    if (!target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else played.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return value;
}
