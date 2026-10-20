/** Handle rules (contract §E): 3–24 chars, lowercase letters / digits / `-`, no leading or trailing `-`. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_COOLDOWN_DAYS = 30;

export const RESERVED_HANDLES = new Set([
  'admin',
  'api',
  'blog',
  'login',
  'register',
  'home',
  'notes',
  'groups',
  'search',
  'settings',
  'help',
  'about',
  'privacy',
  'terms',
  'static',
  'assets',
  'me',
  's',
  'c',
  'join',
  'invites',
  'u',
  'demo',
]);

export type HandleProblem = 'empty' | 'short' | 'long' | 'chars' | 'dash' | 'reserved';

export const HANDLE_PROBLEM_TEXT: Record<HandleProblem, string> = {
  empty: '请输入 handle',
  short: `至少 ${HANDLE_MIN} 个字符`,
  long: `最多 ${HANDLE_MAX} 个字符`,
  chars: '只能用小写字母、数字和 -',
  dash: '不能以 - 开头或结尾',
  reserved: '这个词被系统保留了',
};

export const HANDLE_RULES_TEXT = `${HANDLE_MIN}–${HANDLE_MAX} 位小写字母、数字或 -，不能以 - 开头或结尾`;

/** Local validation; `null` means the handle looks fine and is worth asking the server about. */
export function validateHandle(raw: string, opts: { current?: string } = {}): HandleProblem | null {
  const h = raw.trim();
  if (!h) return 'empty';
  if (h.length < HANDLE_MIN) return 'short';
  if (h.length > HANDLE_MAX) return 'long';
  if (!/^[a-z0-9-]+$/.test(h)) return 'chars';
  if (h.startsWith('-') || h.endsWith('-')) return 'dash';
  if (RESERVED_HANDLES.has(h) && h !== opts.current) return 'reserved';
  return null;
}

/** Lower-case and drop anything the rules forbid, so typing never produces an invalid character. */
export function normalizeHandleInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, HANDLE_MAX);
}

/** When the handle may be changed again, or `null` if it may be changed now. */
export function handleCooldownUntil(
  changedAt?: string | null,
  now: Date = new Date(),
): Date | null {
  if (!changedAt) return null;
  const until = new Date(new Date(changedAt).getTime() + HANDLE_COOLDOWN_DAYS * 86_400_000);
  return until.getTime() > now.getTime() ? until : null;
}
