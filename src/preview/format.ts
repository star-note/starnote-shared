const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The few date shapes the platform pages show: `YYYY`, `MM`, `M`, `DD`, `D`, `HH`, `mm` and `MMM` (English month).
 * Local time, like the platforms show it to their readers.
 */
export function formatDate(date: Date | string | number, pattern: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MMM: MONTHS[d.getMonth()] ?? '',
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
  };
  return pattern.replace(/YYYY|MMM|MM|M|DD|D|HH|mm/g, (t) => tokens[t] ?? t);
}

/** Reading time at 400 characters a minute (the blog's own rule), at least one minute. */
export function readingMinutes(words?: number | null): number {
  return Math.max(1, Math.round((words ?? 0) / 400));
}
