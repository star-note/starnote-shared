import type { CSSProperties, ReactNode } from 'react';

import { FONTS } from './fonts';
import type { Item, MagazineLayout, MastItem, TextItem } from './layout';
import type { Rect } from './types';

import './magazine.css';

const box = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

const SHADOW = {
  dark: '0 1px 2px rgba(10,6,18,0.32), 0 2px 24px rgba(10,6,18,0.3)',
  light: '0 1px 16px rgba(255,255,255,0.5)',
};

/** Numbers in a cover line take the accent colour, the way a newsstand cover sells "10 件事". */
const NUMBER =
  /([0-9０-９]+(?:[.,][0-9]+)?|[一二三四五六七八九十百千两]+(?=[件个条种招步点次本篇]))/g;

function withAccent(text: string, accent?: string): ReactNode {
  if (!accent) return text;
  const parts = text.split(NUMBER);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} style={{ color: accent }}>
        {p}
      </span>
    ) : (
      p
    ),
  );
}

function TextBlock({ it }: { it: TextItem }) {
  const f = FONTS[it.font];
  const style: CSSProperties = {
    ...box(it.rect),
    fontFamily: f.family,
    fontWeight: f.weight,
    fontStyle: f.style,
    fontSize: it.size,
    lineHeight: `${it.size * it.lh}px`,
    color: it.color,
    textAlign: it.align,
    letterSpacing: it.tracking ? `${it.tracking}em` : undefined,
    textShadow: it.shadow ? SHADOW[it.shadow] : undefined,
    // Single-weight Latin faces (Prata) must not be smeared into a fake bold next to bold Songti.
    fontSynthesis: 'none',
  };
  return (
    <div className={`mz-text mz-${it.key}`} style={style}>
      {it.lines.map((l, i) => (
        <div key={i} className="mz-line">
          {it.deco ? (
            <span
              className={`mz-deco mz-deco-${it.deco.type}`}
              style={{ ['--mz-deco' as string]: it.deco.color }}
            >
              {l}
            </span>
          ) : (
            withAccent(l, it.accent)
          )}
        </div>
      ))}
    </div>
  );
}

/** The masthead as SVG text on its baseline, so its caps land exactly where the layout put them. */
function Masthead({ it, w, h }: { it: MastItem; w: number; h: number }) {
  const f = FONTS[it.font];
  const filter =
    it.shadow === 'dark'
      ? 'drop-shadow(0 2px 14px rgba(10,6,18,0.28))'
      : it.shadow === 'light'
        ? 'drop-shadow(0 1px 12px rgba(255,255,255,0.35))'
        : undefined;
  return (
    <svg
      className="mz-mast"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ left: 0, top: 0, filter }}
      aria-hidden
    >
      <text
        x={it.rect.x}
        y={it.baseline}
        fill={it.color}
        fontFamily={f.family}
        fontWeight={f.weight}
        fontStyle={f.style}
        fontSize={it.size}
        letterSpacing={`${it.tracking}em`}
      >
        {it.text}
      </text>
    </svg>
  );
}

/** Deterministic bars from the code string: a decorative barcode, as on a newsstand cover. */
function Barcode({ rect, code }: { rect: Rect; code: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let h = 0;
  for (let i = 0; i < code.length * 4; i++) {
    h = (h * 31 + code.charCodeAt(i % code.length) + i * 7) >>> 0;
    const w = 1 + (h % 3);
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  }
  const pad = rect.w * 0.08;
  const scale = (rect.w - 2 * pad) / x;
  const barH = rect.h * 0.64;
  return (
    <div className="mz-barcode" style={box(rect)}>
      <svg width={rect.w} height={rect.h} viewBox={`0 0 ${rect.w} ${rect.h}`} aria-hidden>
        {bars.map((b, i) => (
          <rect
            key={i}
            x={pad + b.x * scale}
            y={rect.h * 0.08}
            width={b.w * scale}
            height={barH}
            fill="#16121c"
          />
        ))}
        <text
          x={rect.w / 2}
          y={rect.h * 0.94}
          textAnchor="middle"
          fontSize={rect.h * 0.18}
          fontFamily="Menlo, Consolas, monospace"
          fill="#16121c"
        >
          {code}
        </text>
      </svg>
    </div>
  );
}

/** 地理志 map scale bar: a hairline with end and middle ticks and the distance label above its right end. */
function ScaleBar({ rect, color, label }: { rect: Rect; color: string; label: string }) {
  const tick = Math.max(6, Math.round(rect.h * 0.4));
  const base = rect.h - 1;
  const fs = Math.max(10, Math.round(rect.h * 0.52));
  return (
    <svg
      className="mz-scalebar"
      width={rect.w}
      height={rect.h}
      viewBox={`0 0 ${rect.w} ${rect.h}`}
      style={{ left: rect.x, top: rect.y }}
      aria-hidden
    >
      <line x1={0} y1={base} x2={rect.w} y2={base} stroke={color} strokeWidth={1.5} />
      {[0, rect.w / 2, rect.w].map((x, i) => (
        <line key={i} x1={x} y1={base - tick} x2={x} y2={base} stroke={color} strokeWidth={1.5} />
      ))}
      <text
        x={rect.w - 1}
        y={base - tick - 4}
        textAnchor="end"
        fontSize={fs}
        fontFamily={FONTS.geoLabel.family}
        fontWeight={600}
        letterSpacing="0.08em"
        fill={color}
      >
        {label}
      </text>
      <text
        x={1}
        y={base - tick - 4}
        fontSize={fs}
        fontFamily={FONTS.geoLabel.family}
        fontWeight={600}
        letterSpacing="0.08em"
        fill={color}
      >
        0
      </text>
    </svg>
  );
}

export interface CoverLayers {
  /** Composited photo layers (blurred backdrop + feathered photo, feathered cutout), by item key. */
  photo: Record<string, string>;
  art(id: string): { bg: string; fg: string };
}

function ItemView({ it, layers, w, h }: { it: Item; layers: CoverLayers; w: number; h: number }) {
  switch (it.kind) {
    case 'photo': {
      const src = layers.photo[it.key];
      return src ? <img className="mz-layer" src={src} alt="" style={box(it.clip)} /> : null;
    }
    case 'artBg':
      return (
        <div className="mz-clip" style={box(it.clip)}>
          <img className="mz-cover" src={layers.art(it.id).bg} alt="" />
        </div>
      );
    case 'artFg':
      return (
        <div className="mz-clip" style={box(it.clip)}>
          <img
            src={layers.art(it.id).fg}
            alt=""
            style={{
              left: it.box.x - it.clip.x,
              top: it.box.y - it.clip.y,
              width: it.box.w,
              height: it.box.h,
            }}
          />
        </div>
      );
    case 'fill':
      return (
        <div
          className="mz-fill"
          style={{ ...box(it.rect), background: it.background, borderRadius: it.radius }}
        />
      );
    case 'masthead':
      return <Masthead it={it} w={w} h={h} />;
    case 'text':
      return <TextBlock it={it} />;
    case 'barcode':
      return <Barcode rect={it.rect} code={it.code} />;
    case 'scalebar':
      return <ScaleBar rect={it.rect} color={it.color} label={it.label} />;
    case 'sticker':
      return (
        <div
          className="mz-sticker"
          style={{
            ...box(it.rect),
            background: it.background,
            color: it.color,
            fontSize: it.size,
            fontFamily: FONTS.heavy.family,
            transform: `rotate(${it.rotate}deg)`,
          }}
        >
          {it.text}
        </div>
      );
    case 'byline': {
      const dot = Math.round(it.size * 1.6);
      return (
        <div
          className="mz-byline"
          style={{
            ...box(it.rect),
            background: it.background,
            color: it.color,
            fontSize: it.size,
            fontFamily: FONTS.sansBold.family,
            borderRadius: it.rect.h / 2,
          }}
        >
          <span
            className="mz-dot"
            style={{
              width: dot,
              height: dot,
              background: it.dot,
              color: it.dotInk,
              fontSize: it.size * 0.8,
            }}
          >
            {it.initial}
          </span>
          <span className="mz-handle">{it.text}</span>
        </div>
      );
    }
  }
}

/** Paints a computed layout at 1:1 (1200 px wide); the renderer rasterises it. */
export function MagazineCover({ layout, layers }: { layout: MagazineLayout; layers: CoverLayers }) {
  return (
    <div
      className={`mz mz-${layout.template} mz-${layout.size}`}
      style={{ width: layout.w, height: layout.h }}
    >
      {layout.items.map((it) => (
        <ItemView key={it.key} it={it} layers={layers} w={layout.w} h={layout.h} />
      ))}
    </div>
  );
}
