/**
 * Our asset URLs are `/api/v1/assets/{sha256}` (local) or `.../{sha256}.ext` (S3). The cover
 * field stores the hash, so an article image picked as the cover needs its hash back out.
 */
const HASH_IN_URL = /\/assets\/(?:upload\/)?([0-9a-f]{32,64})(?:[./?#]|$)/i;

export function assetHashFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = HASH_IN_URL.exec(url);
  return m ? m[1].toLowerCase() : null;
}
