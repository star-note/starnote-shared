import type { ReactNode } from 'react';

/** The handful of glyphs the mock platform pages use (no icon font, no app dependency). */
// plain props, not SVGProps: the apps resolve their own @types/react, so a spread of React's types would not match
function Svg({
  children,
  className,
  strokeWidth = '1.8',
}: {
  children: ReactNode;
  className?: string;
  strokeWidth?: string;
}) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}
export const HeartIcon = () => (
  <Svg>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </Svg>
);
export const EllipsisIcon = () => (
  <Svg>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);
export const LeftIcon = () => (
  <Svg>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const MessageIcon = () => (
  <Svg>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </Svg>
);
export const ShareIcon = () => (
  <Svg>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <path d="m8 11 8-4M8 13l8 4" />
  </Svg>
);
export const StarIcon = () => (
  <Svg>
    <path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 4Z" />
  </Svg>
);
export const LockIcon = () => (
  <Svg strokeWidth="2">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const PhoneIcon = () => (
  <Svg>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);
export const DesktopIcon = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </Svg>
);
