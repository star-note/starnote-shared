/** SVG text of the drawn materials; imported only by the lazy renderer chunk. */
import bloomBg from './bloom.bg.svg?raw';
import bloomFg from './bloom.fg.svg?raw';
import bobBg from './bob.bg.svg?raw';
import bobFg from './bob.fg.svg?raw';
import harborBg from './harbor.bg.svg?raw';
import harborFg from './harbor.fg.svg?raw';
import nocturneBg from './nocturne.bg.svg?raw';
import nocturneFg from './nocturne.fg.svg?raw';
import pearlBg from './pearl.bg.svg?raw';
import pearlFg from './pearl.fg.svg?raw';
import rivieraBg from './riviera.bg.svg?raw';
import rivieraFg from './riviera.fg.svg?raw';
import skylineBg from './skyline.bg.svg?raw';
import skylineFg from './skyline.fg.svg?raw';

const RAW: Record<string, { bg: string; fg: string }> = {
  bloom: { bg: bloomBg, fg: bloomFg },
  bob: { bg: bobBg, fg: bobFg },
  harbor: { bg: harborBg, fg: harborFg },
  nocturne: { bg: nocturneBg, fg: nocturneFg },
  pearl: { bg: pearlBg, fg: pearlFg },
  riviera: { bg: rivieraBg, fg: rivieraFg },
  skyline: { bg: skylineBg, fg: skylineFg },
};

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function artLayers(id: string): { bg: string; fg: string } {
  const raw = RAW[id];
  if (!raw) throw new Error(`未知素材 ${id}`);
  return { bg: svgUrl(raw.bg), fg: svgUrl(raw.fg) };
}
