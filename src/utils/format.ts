import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export function fromNow(iso?: string | null): string {
  if (!iso) return '';
  return dayjs(iso).fromNow();
}

export function formatDate(iso?: string | null, fmt = 'YYYY-MM-DD'): string {
  if (!iso) return '';
  return dayjs(iso).format(fmt);
}

export function formatNumber(n?: number | null): string {
  if (n == null) return '0';
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('zh-CN');
}

export function readingMinutes(wordCount?: number | null): number {
  return Math.max(1, Math.round((wordCount ?? 0) / 400));
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Where public blogs live. The web app serves them itself (default: the current origin); the phone app runs on
 * its own host (`m.`) and links out to the main site, so it sets this once at startup.
 */
let siteOrigin: string | null = null;

export function configureSiteOrigin(origin: string | null) {
  siteOrigin = origin ? origin.replace(/\/$/, '') : null;
}

function currentSiteOrigin(): string {
  return siteOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
}

export function blogUrl(handle: string, slug?: string): string {
  return `${currentSiteOrigin()}/@${handle}${slug ? `/${slug}` : ''}`;
}

export function blogDisplayHost(): string {
  const origin = currentSiteOrigin();
  return origin ? new URL(origin).host : 'starnote.app';
}

/** The API sometimes returns an author as a string, sometimes as `{name}`. */
export function authorName(a: string | { name?: string } | null | undefined): string {
  if (!a) return '';
  return typeof a === 'string' ? a : (a.name ?? '');
}
