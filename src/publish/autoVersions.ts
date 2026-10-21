/**
 * 多版本自动准备 (r9): which versions a publish run needs, from the platforms ticked — 小红书 / Instagram → 图集,
 * overseas article platforms and the share group → 英文版, 头条号 / 微博 → 精简版. Pure rules; the hook
 * (the web panel's `useAutoVersions`, the phone's `useAutoVersions`) generates what is missing when the user confirms.
 */
import type { VersionKind } from '../api/versions';
import { isImageSetPlatform, isOverseas } from '../versions/platformVersions';

/** Platforms that take the 精简版 (short, phone-first feeds). */
export const CONDENSED_KEYS: readonly string[] = ['toutiao', 'weibo'];

export interface VersionNeed {
  kind: VersionKind;
  /** The ticked platforms this version is for, in selection order. */
  platforms: string[];
}

export const KIND_ORDER: VersionKind[] = ['xhs', 'en', 'condensed'];

/** Which version kinds the selection needs and for which platforms (none → an empty list). */
export function neededVersions(selected: readonly string[]): VersionNeed[] {
  const out: Record<VersionKind, string[]> = { xhs: [], en: [], condensed: [] };
  for (const k of selected) {
    if (k === 'chenji') continue;
    if (isImageSetPlatform(k) || k === 'instagram') out.xhs.push(k);
    else if (CONDENSED_KEYS.includes(k)) out.condensed.push(k);
    else if (isOverseas(k)) out.en.push(k);
  }
  return KIND_ORDER.filter((kind) => out[kind].length).map((kind) => ({
    kind,
    platforms: out[kind],
  }));
}

/** 「小红书」 / 「DEV 和 Medium」 / 「DEV、Medium 等 4 个平台」. */
export function namePlatforms(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} 和 ${names[1]}`;
  return `${names[0]}、${names[1]} 等 ${names.length} 个平台`;
}

/** 中英混排: a space on each side of the name when it starts / ends with Latin text (「为 DEV 准备」, 「为小红书准备」). */
export function spaced(name: string): string {
  const head = /^[\x21-\x7e]/.test(name) ? ' ' : '';
  const tail = /[\x21-\x7e]$/.test(name) ? ' ' : '';
  return `${head}${name}${tail}`;
}

export interface SummaryPart {
  kind: VersionKind;
  /** Platform display names. */
  names: string[];
  /** The version already exists (reused, no new charge). */
  ready: boolean;
  /** How many cards the image set has (ready 图集 only). */
  cards?: number;
}

/**
 * One sentence for the plan card: 「已为小红书准备 8 张图集、为 DEV 准备英文版」 for what exists, 「发布时会为…准备…」
 * for what will be generated on 确认发布; both halves joined with 「；」 when mixed.
 */
export function summarySentence(parts: readonly SummaryPart[]): string {
  const ready = parts.filter((p) => p.ready);
  const later = parts.filter((p) => !p.ready);
  const piece = (p: SummaryPart) => {
    const who = `为${spaced(namePlatforms(p.names))}`;
    if (p.kind === 'xhs') return `${who}准备${p.ready && p.cards ? ` ${p.cards} 张` : ''}图集`;
    if (p.kind === 'en') return `${who}准备英文版`;
    return `${who}准备精简版`;
  };
  const a = ready.length ? `已${ready.map(piece).join('、')}` : '';
  const b = later.length ? `发布时会${later.map(piece).join('、')}` : '';
  return [a, b].filter(Boolean).join('；');
}

/** The run's platforms from the publish options (辰记 + GitHub + relays + share + desk). */
export function keysOfRun(opts: {
  chenji?: boolean;
  github?: unknown;
  relay?: { key: string }[];
  share?: { key: string }[];
  desk?: { key: string }[];
  keys?: string[];
}): string[] {
  return [
    ...(opts.chenji === false ? [] : ['chenji']),
    ...(opts.keys ?? []),
    ...(opts.github ? ['github-pages'] : []),
    ...(opts.relay ?? []).map((r) => r.key),
    ...(opts.share ?? []).map((s) => s.key),
    ...(opts.desk ?? []).map((d) => d.key),
  ];
}
