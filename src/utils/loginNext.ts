/**
 * The `next` query of `/login` and `/register`: where to go once signed in.
 * Only same-origin paths are honoured, so a crafted link cannot bounce a fresh
 * session to another site (`//evil.com`, `https://…`, `javascript:` are all refused).
 */
export const DEFAULT_NEXT = '/home';

export function safeNext(raw: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback;
  for (const ch of v) if (ch.charCodeAt(0) < 0x20) return fallback;
  // The login pages themselves are never a destination.
  if (/^\/(login|register)(\/|\?|$)/.test(v)) return fallback;
  return v;
}

/** `/login?next=<path>` for the page the visitor is on (path + query). */
export function loginPath(next: string, page: 'login' | 'register' = 'login'): string {
  const n = safeNext(next, '');
  return n ? `/${page}?next=${encodeURIComponent(n)}` : `/${page}`;
}

/** The current location as a `next` value. */
export function currentPath(loc: { pathname: string; search?: string } = window.location): string {
  return `${loc.pathname}${loc.search ?? ''}`;
}
