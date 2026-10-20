/** The URL segment of a published post: its short id, or the slug for records created before short ids. */
export function postKey(p: { slug: string; short_id?: string | null }): string {
  return p.short_id || p.slug;
}

/** The public path of one of my posts, used by the title link, 预览 and 复制链接 alike. */
export function publicPostPath(p: {
  blog_handle: string;
  slug: string;
  short_id?: string | null;
}): string {
  return `/@${p.blog_handle}/${postKey(p)}`;
}

/**
 * What 分享 / 复制链接 copy (contract r3 §B): the API's `share_url` when present; otherwise the plain url,
 * with `?pwd=` appended from `access_code` for a password post so older payloads still copy a working link.
 */
export function shareUrl(p: {
  url: string;
  share_url?: string | null;
  visibility?: string | null;
  access_code?: string | null;
}): string {
  if (p.share_url) return p.share_url;
  if ((p.visibility === 'password' || p.visibility === 'link') && p.access_code) {
    return `${p.url}${p.url.includes('?') ? '&' : '?'}pwd=${encodeURIComponent(p.access_code)}`;
  }
  return p.url;
}
