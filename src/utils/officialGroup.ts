/**
 * The 「辰记官方」 group (SPEC-r3 §E): every user is a member, it is read-only and only platform admins maintain
 * its notes. It is never offered as a *target* — material / template sources, save-as-template, upload, move,
 * copy, pick-a-note or pick-a-group — and it always sits last among the groups in the sider and group lists.
 *
 * Detection uses the server's `is_official` flag only (never the name).
 */

/** Anything that may carry the server's `is_official` flag (a `Group`, a search label, …). */
export type MaybeOfficial = object | null | undefined;

export function isOfficialGroup(group: MaybeOfficial): boolean {
  return Boolean((group as { is_official?: unknown } | null | undefined)?.is_official);
}

/**
 * Groups a selector may offer: the official group removed. `keepId` keeps one group even when official — the
 * source tree of an in-group move (an admin re-parenting official notes).
 */
export function pickableGroups<T extends { id: string }>(
  groups: readonly T[],
  keepId?: string | null,
): T[] {
  return groups.filter((g) => !isOfficialGroup(g) || (keepId != null && g.id === keepId));
}

/** Ids of the official group(s) in a list — for filtering rows that only carry a group id. */
export function officialGroupIds(groups: readonly { id: string }[]): Set<string> {
  return new Set(groups.filter(isOfficialGroup).map((g) => g.id));
}

/** Same order as given, the official group moved to the end (stable: the other groups keep their order). */
export function officialGroupLast<T extends object>(groups: readonly T[]): T[] {
  const rest: T[] = [];
  const official: T[] = [];
  for (const g of groups) (isOfficialGroup(g) ? official : rest).push(g);
  return official.length ? [...rest, ...official] : [...groups];
}
