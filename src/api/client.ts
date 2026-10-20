import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiError, Envelope } from './types';

export const API_BASE = '/api/v1';

/** Token storage + auth callbacks are injected so this module stays store-free and testable. */
export interface ClientAuth {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  onLogout(): void;
}

let auth: ClientAuth = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: () => {},
  onLogout: () => {},
};

export function configureClientAuth(next: ClientAuth) {
  auth = next;
}

/** Network-level failures (no envelope reached us): the app shows them (antd `message`, antd-mobile `Toast`…). */
let notifyNetworkError: (message: string) => void = () => {};

export function configureClientNotify(fn: (message: string) => void) {
  notifyNetworkError = fn;
}

export const http = axios.create({ baseURL: API_BASE, timeout: 30_000, withCredentials: true });

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; skipAuthRetry?: boolean };

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Public visitor reads: surface a 40101 to the caller instead of refreshing / logging out (every
     * blog is public since SPEC-r6 §C, so a visitor never needs a session for these).
     */
    skipAuthRetry?: boolean;
  }
}

http.interceptors.request.use((config) => {
  const token = auth.getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string> | null = null;

/** Exchange the refresh token for a new access token (shared by the axios interceptor and the collab socket). */
export async function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post<Envelope<{ access_token: string; refresh_token: string }>>(
        `${API_BASE}/auth/refresh`,
        { refresh_token: auth.getRefreshToken() ?? undefined },
        { withCredentials: true },
      )
      .then((res) => {
        const body = res.data;
        if (body.code !== 0) throw toApiError(body.code, body.message, body.data, res.status);
        auth.setTokens(body.data.access_token, body.data.refresh_token);
        return body.data.access_token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function toApiError(code: number, msg: string, data?: unknown, status?: number): ApiError {
  return { code, message: msg, data, status };
}

export function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

http.interceptors.response.use(
  async (res) => {
    const body = res.data as Envelope<unknown> | undefined;
    if (!body || typeof body !== 'object' || !('code' in body)) return res.data;
    if (body.code === 0) return body.data as never;
    if (body.code === 40101 && !(res.config as RetriableConfig).skipAuthRetry) {
      return retryAfterRefresh(res.config as RetriableConfig, body);
    }
    if (body.code === 40102) {
      auth.onLogout();
    }
    throw toApiError(body.code, body.message, body.data, res.status);
  },
  async (error: AxiosError<Envelope<unknown>>) => {
    const body = error.response?.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 40101 && !(error.config as RetriableConfig | undefined)?.skipAuthRetry) {
        return retryAfterRefresh(error.config as RetriableConfig, body);
      }
      if (body.code === 40102) auth.onLogout();
      throw toApiError(body.code, body.message, body.data, error.response?.status);
    }
    if (error.code === 'ERR_CANCELED') throw toApiError(-1, '已取消');
    const msg = error.response
      ? `请求失败（${error.response.status}）`
      : '网络连接失败，请检查后端是否启动';
    notifyNetworkError(msg);
    throw toApiError(error.response?.status ?? 0, msg, undefined, error.response?.status);
  },
);

async function retryAfterRefresh(config: RetriableConfig | undefined, body: Envelope<unknown>) {
  if (!config || config._retried) {
    auth.onLogout();
    throw toApiError(body.code, body.message, body.data, 401);
  }
  try {
    const token = await refreshAccessToken();
    config._retried = true;
    config.headers.Authorization = `Bearer ${token}`;
    return http.request(config);
  } catch (e) {
    auth.onLogout();
    throw e;
  }
}

/** Typed helpers: the interceptor already unwrapped `data`. */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => http.get<T, T>(url, config),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.post<T, T>(url, data, config),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.patch<T, T>(url, data, config),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.put<T, T>(url, data, config),
  delete: <T>(url: string, config?: AxiosRequestConfig) => http.delete<T, T>(url, config),
};

/** window.fetch with the current Bearer token, for SDKs that take a `fetch`. */
export const authedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  const token = auth.getAccessToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'include' });
};

export function currentAccessToken() {
  return auth.getAccessToken();
}
