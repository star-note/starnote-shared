import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/**
 * Lays `children` out at a real device width (so type and measure are true to the platform) and scales the
 * result down to the room available; the frame keeps its aspect while the panel is resized.
 */
export function Scaled({
  width,
  height,
  children,
  label,
}: {
  width: number;
  height: number;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(width);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setAvail(el.getBoundingClientRect().width || width);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const s = Math.min(1, avail / width);
  return (
    <div ref={ref} className="pv-scaled-wrap" style={{ height: Math.round(height * s) }}>
      <div
        className="pv-scaled"
        role="document"
        aria-label={label}
        style={{ width, height, transform: `scale(${s})` }}
      >
        {children}
      </div>
    </div>
  );
}
