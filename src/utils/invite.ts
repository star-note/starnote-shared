import type { Invite } from '../api/types';

/** Absolute URL of an invite; the backend sends a relative `/join/{code}` path. */
export function inviteUrl(inv: Pick<Invite, 'url' | 'code'>): string {
  const path = inv.url || `/join/${inv.code}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return path.startsWith('http') ? path : `${origin}${path}`;
}
