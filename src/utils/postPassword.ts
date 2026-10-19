/**
 * A password post (contract r3 §B) is read with `?pwd=<提取码>`. The code is remembered per post for
 * the tab's lifetime so navigating away and back does not ask again; a share link carries it in the URL.
 */
export const PWD_PARAM = 'pwd';

export function pwdStorageKey(handle: string, postKey: string): string {
  return `starnote.pwd:${handle.toLowerCase()}/${postKey}`;
}

export function readStoredPwd(handle: string, postKey: string): string | null {
  try {
    return sessionStorage.getItem(pwdStorageKey(handle, postKey));
  } catch {
    return null;
  }
}

export function storePwd(handle: string, postKey: string, pwd: string): void {
  try {
    if (pwd) sessionStorage.setItem(pwdStorageKey(handle, postKey), pwd);
    else sessionStorage.removeItem(pwdStorageKey(handle, postKey));
  } catch {
    /* private mode */
  }
}

/** The `?pwd=` of a share link, trimmed; `null` when absent. */
export function pwdFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get(PWD_PARAM)?.trim();
  return v ? v : null;
}

/** Whether an API error is the "this post needs a password" answer. */
export function isPasswordGate(err: unknown): boolean {
  const e = err as { code?: number; data?: { reason?: string } } | null;
  return e?.code === 40301 && e?.data?.reason === 'password';
}

/** The first code to try: the URL beats the remembered one (a fresh share link may carry a reset code). */
export function initialPwd(handle: string, postKey: string, search: string): string | null {
  return pwdFromSearch(search) ?? readStoredPwd(handle, postKey);
}
