import type { PublishEvent } from './sdk';

/** ANSI SGR codes: the log is written as ANSI text and coloured by the viewer (anser). */
export const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
} as const;

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'running';

export interface LogLine {
  key: string;
  level: LogLevel;
  /** The line as ANSI text: time, platform, step, message, duration. */
  ansi: string;
  /** Plain text (screen readers, copy). */
  plain: string;
  /** A link the line points at (the published post, a screenshot). */
  href?: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  chenji: '辰记',
  wechat: '公众号',
  zhihu: '知乎',
  juejin: '掘金',
  xiaohongshu: '小红书',
  medium: 'Medium',
  yuque: '语雀',
  csdn: 'CSDN',
  app: '辰记',
};

export function platformLabel(key: string): string {
  return PLATFORM_LABEL[key] ?? key;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** HH:mm:ss in local time. */
export function clock(at: string | number | Date): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? '--:--:--'
    : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "+0.4s" / "+12s" / "+1m05s" since the run started. */
export function since(
  at: string | number | Date,
  start: string | number | Date | null | undefined,
): string {
  if (start == null) return '';
  const ms = new Date(at).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 10_000) return `+${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `+${s}s` : `+${Math.floor(s / 60)}m${pad(s % 60)}s`;
}

function stepOf(e: PublishEvent): { step: string; level: LogLevel; text: string; href?: string } {
  switch (e.type) {
    case 'progress':
      return { step: `${e.percent}%`, level: 'running', text: e.text ?? '处理中' };
    case 'log':
      return {
        step: e.level === 'warn' ? '注意' : (e.level as string) === 'error' ? '错误' : '进行',
        level: e.level === 'warn' ? 'warn' : (e.level as string) === 'error' ? 'error' : 'info',
        text: e.text,
      };
    case 'asset':
      return {
        step: e.kind === 'screenshot' ? '截图' : '文件',
        level: 'info',
        text: e.text ?? (e.kind === 'screenshot' ? '查看截图' : '查看文件'),
        href: e.url,
      };
    case 'needInput':
      return { step: '确认', level: 'warn', text: `需要你确认：${e.title}` };
    case 'done':
      return {
        step: '完成',
        level: 'success',
        // a hand-off (发布台 / share page) is not published yet: the user finishes it on the platform
        text:
          e.state === 'handoff'
            ? `已交给你确认发布 ${e.url.replace(/^https?:\/\//, '')}`
            : e.state === 'pending-review'
              ? `等待平台审核 ${e.url.replace(/^https?:\/\//, '')}`
              : `已发布 ${e.url.replace(/^https?:\/\//, '')}`,
        href: e.url,
      };
    case 'failed':
      return { step: '失败', level: 'error', text: e.reason };
    default:
      return { step: '事件', level: 'info', text: String((e as { type?: string }).type ?? '') };
  }
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: ANSI.blue,
  running: ANSI.cyan,
  success: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
};

/**
 * One SDK event as a log line: `12:01:03  辰记  完成  已发布 …  +3.2s` — time and duration dim, the platform tinted,
 * the step coloured by level (green done, amber warnings, red failures).
 */
export function formatLogLine(
  platform: string,
  e: PublishEvent,
  index: number,
  start?: string | number | Date | null,
): LogLine {
  const { step, level, text, href } = stepOf(e);
  const time = clock(e.at);
  const dur = since(e.at, start);
  const color = LEVEL_COLOR[level];
  const msg =
    level === 'error' || level === 'success' ? `${ANSI.bold}${color}${text}${ANSI.reset}` : text;
  const ansi = `${ANSI.dim}${time}${ANSI.reset}  ${ANSI.magenta}${platformLabel(platform)}${ANSI.reset}  ${color}${step}${ANSI.reset}  ${msg}${dur ? `  ${ANSI.dim}${dur}${ANSI.reset}` : ''}`;
  const plain = `${time}  ${platformLabel(platform)}  ${step}  ${text}${dur ? `  ${dur}` : ''}`;
  return { key: `${platform}-${index}`, level, ansi, plain, href };
}

/** Every platform's events as one time-ordered log. */
export function formatRun(events: Record<string, PublishEvent[]>): LogLine[] {
  const all = Object.entries(events).flatMap(([p, list]) => list.map((e, i) => ({ p, e, i })));
  all.sort((a, b) => new Date(a.e.at).getTime() - new Date(b.e.at).getTime() || a.i - b.i);
  const start = all[0]?.e.at ?? null;
  return all.map(({ p, e, i }) => formatLogLine(p, e, i, start));
}

/** The run's outcome for the summary line. */
export function runOutcome(
  events: Record<string, PublishEvent[]>,
  running: boolean,
): 'running' | 'done' | 'failed' | 'idle' {
  const lists = Object.values(events);
  if (!lists.length) return running ? 'running' : 'idle';
  if (running) return 'running';
  const lasts = lists.map((l) => l[l.length - 1]?.type);
  if (lasts.some((t) => t === 'failed')) return 'failed';
  if (lasts.every((t) => t === 'done')) return 'done';
  return 'idle';
}
