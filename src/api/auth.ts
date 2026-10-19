import { API_BASE, api, isApiError } from './client';
import { SOFT, softItems } from './soft';
import type { AuthPayload, User } from './types';

/* ------------------------------------------------------------------ r5: login methods */

export type OAuthProvider = 'github' | 'wechat';

/** `GET /auth/providers`. Every method except the password is off until the server says otherwise. */
export interface AuthProviders {
  /** False while the endpoint is not deployed: the UI explains "暂未开放" instead of "未配置". */
  available: boolean;
  github: boolean;
  wechat: boolean;
  passkey: boolean;
}

export const NO_PROVIDERS: AuthProviders = {
  available: false,
  github: false,
  wechat: false,
  passkey: false,
};

const enabled = (v: unknown) =>
  Boolean(v && typeof v === 'object' && (v as { enabled?: unknown }).enabled === true);

export function normalizeProviders(res: unknown): AuthProviders {
  if (!res || typeof res !== 'object' || !('github' in res || 'wechat' in res || 'passkey' in res))
    return NO_PROVIDERS;
  const r = res as Record<string, unknown>;
  return {
    available: true,
    github: enabled(r.github),
    wechat: enabled(r.wechat),
    passkey: enabled(r.passkey),
  };
}

/** A bound GitHub / WeChat account (`GET /me/identities` items). */
export interface Identity {
  id: string;
  provider: OAuthProvider;
  email?: string | null;
  login?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

/** `GET /me/identities`: bound accounts plus what else can sign this user in. */
export interface IdentitiesResult {
  items: Identity[];
  hasPassword: boolean;
  passkeyCount: number;
}

/** `POST /auth/oauth/exchange`: a session, plus where to go and whether this was a login or a bind. */
export interface OAuthExchangeResult extends AuthPayload {
  next?: string;
  provider?: OAuthProvider;
  is_new?: boolean;
  mode?: 'login' | 'bind';
}

/** A registered passkey (`GET /me/passkeys`). */
export interface Passkey {
  id: string;
  name: string;
  created_at?: string;
  last_used_at?: string | null;
}

/** A WebAuthn options response: the options themselves, or wrapped with a server-side ceremony id. */
export interface CeremonyOptions {
  /** `PublicKeyCredential{Request,Creation}OptionsJSON` handed to @simplewebauthn/browser. */
  options: Record<string, unknown>;
  /** Anything else the server returned next to the options (e.g. `challenge_id`), echoed back on verify. */
  extra: Record<string, unknown>;
}

/** Accepts `{...options}`, `{publicKey: options}` or `{options, challenge_id?}`; `null` when it is not options at all. */
export function normalizeCeremony(res: unknown): CeremonyOptions | null {
  if (!res || typeof res !== 'object') return null;
  const r = res as Record<string, unknown>;
  for (const key of ['options', 'publicKey'] as const) {
    const inner = r[key];
    if (
      inner &&
      typeof inner === 'object' &&
      typeof (inner as { challenge?: unknown }).challenge === 'string'
    ) {
      const extra = { ...r };
      delete extra[key];
      return { options: inner as Record<string, unknown>, extra };
    }
  }
  return typeof r.challenge === 'string' ? { options: r, extra: {} } : null;
}

/**
 * An endpoint that is not deployed yet answers either a bare framework 404 (resolved as data under
 * SOFT) or the enveloped `40401 接口不存在`; both read as `null` here.
 */
async function missingAsNull<T>(run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    if (isApiError(e) && (e.code === 40401 || e.status === 404)) return null;
    throw e;
  }
}

/** Public auth calls: a 401 here is about the ticket / credential, never a reason to refresh or log out. */
const PUBLIC = { ...SOFT, skipAuthRetry: true };

const isList = (res: unknown) =>
  Array.isArray(res) ||
  Boolean(res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items));

const isPayload = (v: unknown): v is AuthPayload =>
  Boolean(
    v &&
    typeof v === 'object' &&
    typeof (v as AuthPayload).access_token === 'string' &&
    (v as AuthPayload).user,
  );

/** Where a full-page redirect starts an OAuth login (`next` must be a same-site path, else the server answers 40001). */
export function oauthStartUrl(provider: OAuthProvider, next: string): string {
  return `${API_BASE}/auth/oauth/${provider}/start?${new URLSearchParams({ next }).toString()}`;
}

export const authApi = {
  // a 401 here means a wrong credential, never "refresh and retry"
  register: (body: { email: string; password: string; name: string; handle: string }) =>
    api.post<AuthPayload>('/auth/register', body, { skipAuthRetry: true }),
  login: (body: { email: string; password: string }) =>
    api.post<AuthPayload>('/auth/login', body, { skipAuthRetry: true }),
  logout: () => api.post<Record<string, never>>('/auth/logout'),
  me: () => api.get<User>('/me'),
  updateMe: (body: { name?: string; avatar_asset_hash?: string }) => api.patch<User>('/me', body),

  /** Never throws for a missing endpoint: everything but the password reads as disabled. */
  providers: async (): Promise<AuthProviders> => {
    try {
      return normalizeProviders(await api.get<unknown>('/auth/providers', PUBLIC));
    } catch {
      return NO_PROVIDERS;
    }
  },
  /** Trade the one-time `ticket` from `/auth/callback/:provider` for a session. `null` = endpoint missing. */
  oauthExchange: (ticket: string) =>
    missingAsNull(async () => {
      const res = await api.post<unknown>('/auth/oauth/exchange', { ticket }, PUBLIC);
      return isPayload(res) ? (res as OAuthExchangeResult) : null;
    }),
  /** Settings → 绑定: the server builds the authorize URL for the signed-in user; `null` = endpoint missing. */
  oauthBind: (provider: OAuthProvider, next = '/settings') =>
    missingAsNull(async () => {
      const res = await api.post<unknown>(`/auth/oauth/${provider}/bind`, { next }, SOFT);
      const url =
        res && typeof res === 'object' ? (res as { authorize_url?: unknown }).authorize_url : null;
      return typeof url === 'string' && url ? url : null;
    }),
  passkeyLoginOptions: (email?: string) =>
    missingAsNull(async () =>
      normalizeCeremony(
        await api.post<unknown>('/auth/passkey/login/options', email ? { email } : {}, PUBLIC),
      ),
    ),
  passkeyLoginVerify: (body: Record<string, unknown>) =>
    missingAsNull(async () => {
      const res = await api.post<unknown>('/auth/passkey/login/verify', body, PUBLIC);
      return isPayload(res) ? res : null;
    }),
  passkeyRegisterOptions: () =>
    missingAsNull(async () =>
      normalizeCeremony(await api.post<unknown>('/auth/passkey/register/options', {}, SOFT)),
    ),
  passkeyRegisterVerify: (body: Record<string, unknown>) =>
    missingAsNull(async () => {
      const res = await api.post<unknown>('/auth/passkey/register/verify', body, SOFT);
      return res && typeof res === 'object' && typeof (res as Passkey).id === 'string'
        ? (res as Passkey)
        : null;
    }),

  /** `null` while the endpoint is missing, so settings can say so instead of showing an empty list. */
  identities: () =>
    missingAsNull(async (): Promise<IdentitiesResult | null> => {
      const res = await api.get<unknown>('/me/identities', SOFT);
      if (!isList(res)) return null;
      const r = (Array.isArray(res) ? {} : res) as {
        has_password?: unknown;
        passkey_count?: unknown;
      };
      return {
        items: softItems<Identity>(res).filter((i) => i && typeof i.id === 'string'),
        hasPassword: r.has_password !== false,
        passkeyCount: typeof r.passkey_count === 'number' ? r.passkey_count : 0,
      };
    }),
  unlinkIdentity: (id: string) => api.delete<unknown>(`/me/identities/${encodeURIComponent(id)}`),
  passkeys: () =>
    missingAsNull(async () => {
      const res = await api.get<unknown>('/me/passkeys', SOFT);
      return isList(res)
        ? softItems<Passkey>(res).filter((p) => p && typeof p.id === 'string')
        : null;
    }),
  deletePasskey: (id: string) => api.delete<unknown>(`/me/passkeys/${encodeURIComponent(id)}`),
};
