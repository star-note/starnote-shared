import { create } from 'zustand';

import { authApi } from '../api/auth';
import { configureClientAuth } from '../api/client';
import type { AuthPayload, User } from '../api/types';

const ACCESS_KEY = 'starnote.access_token';
const REFRESH_KEY = 'starnote.refresh_token';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** True until the first `/me` round-trip settled (or there was no token). */
  booting: boolean;
  setSession(payload: AuthPayload): void;
  setTokens(access: string, refresh: string): void;
  setUser(user: User): void;
  bootstrap(): Promise<void>;
  logout(remote?: boolean): Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: read(ACCESS_KEY),
  refreshToken: read(REFRESH_KEY),
  booting: Boolean(read(ACCESS_KEY) || read(REFRESH_KEY)),
  setSession({ user, access_token, refresh_token }) {
    write(ACCESS_KEY, access_token);
    write(REFRESH_KEY, refresh_token);
    set({ user, accessToken: access_token, refreshToken: refresh_token, booting: false });
  },
  setTokens(access, refresh) {
    write(ACCESS_KEY, access);
    write(REFRESH_KEY, refresh);
    set({ accessToken: access, refreshToken: refresh });
  },
  setUser(user) {
    set({ user });
  },
  async bootstrap() {
    const { accessToken, refreshToken } = get();
    if (!accessToken && !refreshToken) {
      set({ booting: false });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, booting: false });
    } catch {
      set({ booting: false });
    }
  },
  async logout(remote = true) {
    if (remote) {
      try {
        await authApi.logout();
      } catch {
        /* ignore */
      }
    }
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
    set({ user: null, accessToken: null, refreshToken: null, booting: false });
  },
}));

/**
 * Wire the API client to this store. Each app calls it once at startup with where a lost session goes
 * (web: `/login?next=`, mobile: its own sign-in page): there are no import-time side effects in this package.
 */
export function bindAuthClient({ onSignedOut }: { onSignedOut: () => void }) {
  configureClientAuth({
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    setTokens: (a, r) => useAuthStore.getState().setTokens(a, r),
    onLogout: () => {
      void useAuthStore.getState().logout(false);
      onSignedOut();
    },
  });
}

export const selectIsAuthed = (s: AuthState) => Boolean(s.user);
