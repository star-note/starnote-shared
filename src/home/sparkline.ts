import dayjs from 'dayjs';

import type { PublicationStats } from '../api/types';

export interface SparkPoint {
  /** `YYYY-MM-DD` */
  day: string;
  reads: number;
}

export interface Sparkline {
  points: SparkPoint[];
  /** `true` when the per-day split is unknown and the 7-day total was spread evenly. */
  estimated: boolean;
}

const DAYS = 7;

/**
 * The last 7 days of reads for the hero's small line (contract r4 §C.2). Uses `daily` when the
 * server sends it (any order, gaps filled with 0, today last); otherwise spreads `reads_7d` evenly
 * so the line is flat rather than missing — and says so via `estimated`.
 */
export function sparkline7(
  stats: Pick<PublicationStats, 'reads_7d' | 'daily'> | null | undefined,
  today = dayjs(),
): Sparkline {
  const end = today.startOf('day');
  const days = Array.from({ length: DAYS }, (_, i) =>
    end.subtract(DAYS - 1 - i, 'day').format('YYYY-MM-DD'),
  );
  const daily = stats?.daily;
  if (Array.isArray(daily) && daily.some((d) => d && typeof d.day === 'string')) {
    const byDay = new Map<string, number>();
    for (const d of daily) {
      if (!d || typeof d.day !== 'string') continue;
      const key = dayjs(d.day).format('YYYY-MM-DD');
      byDay.set(
        key,
        (byDay.get(key) ?? 0) +
          (typeof d.reads === 'number' && Number.isFinite(d.reads) ? Math.max(0, d.reads) : 0),
      );
    }
    return { points: days.map((day) => ({ day, reads: byDay.get(day) ?? 0 })), estimated: false };
  }
  const total =
    typeof stats?.reads_7d === 'number' && Number.isFinite(stats.reads_7d)
      ? Math.max(0, stats.reads_7d)
      : 0;
  const base = Math.floor(total / DAYS);
  const rest = total - base * DAYS;
  // leftovers land on the latest days so the sum stays exact
  const points = days.map((day, i) => ({ day, reads: base + (i >= DAYS - rest ? 1 : 0) }));
  return { points, estimated: true };
}

/** SVG polyline points for a `w × h` box; a flat series draws on the lower third, not on the baseline. */
export function sparkPath(points: SparkPoint[], w: number, h: number, pad = 2): string {
  if (!points.length) return '';
  const max = Math.max(...points.map((p) => p.reads));
  const min = Math.min(...points.map((p) => p.reads));
  const flat = max === min;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = pad + i * step;
      const y = flat ? h - pad - (h - pad * 2) / 3 : pad + (h - pad * 2) * (1 - p.reads / max);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
