/** 热度 as readers say it: 1.2 万, 3 亿; smaller numbers as plain digits. */
export function formatHeat(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')} 亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')} 万`;
  return n.toLocaleString('zh-CN');
}
