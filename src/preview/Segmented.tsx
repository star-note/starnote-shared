import type { ReactNode } from 'react';

/** A small segmented switch (the preview draws its own controls: no host UI kit inside the shadow root). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange(v: T): void;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`pv-seg${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
