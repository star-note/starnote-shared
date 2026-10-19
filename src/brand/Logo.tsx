import { useId, type CSSProperties, type ReactNode } from 'react';

import { useI18n, type Lang } from '../i18n';
import {
  BRAND_COLORS,
  BRAND_SEA,
  BRAND_SKY,
  BRAND_STOPS,
  LOCKUP,
  MARK,
  MOTION_CSS,
} from './paths.gen';

/**
 * 辰记 StarNote logo, round 3.1 ("Pen Apple"): one even, round-ended stroke writes the C+J ligature
 * and its outer edge is the apple; an icon pencil stands where the stalk would be, its tip on the J
 * bar. Colour = night sky (violet, sparks) over the sea (layered waves, glints, a reflected star).
 *
 * `tone` picks the light- or dark-ground palette. CSS hooks:
 *   --sn-mark           flat colour for `variant="flat"` and the small cut (default brand purple)
 *   --sn-accent         the star on 记 (default brand purple / lifted violet on dark)
 *   currentColor        the wordmark, and the mark in `variant="mono"`
 *   --sn-mark-muted     the slogan line
 */

interface SeaData {
  readonly horizon: number;
  readonly base: string;
  readonly layers: readonly {
    readonly d: string;
    readonly top: number;
    readonly dur: number;
    readonly dx: number;
  }[];
  readonly glints: readonly {
    readonly d: string;
    readonly layer: number;
    readonly o: number;
    readonly delay: number;
  }[];
  readonly reflection: readonly { readonly d: string; readonly o: number }[];
}
interface MarkData {
  readonly body: string;
  readonly pen: string;
  readonly centre: string;
  readonly stroke: number;
  readonly sparks: readonly (readonly number[])[];
  readonly sea: SeaData;
  readonly small: { readonly body: string; readonly pen: string; readonly viewBox: string };
}
interface LockupData {
  readonly w: number;
  readonly h: number;
  readonly tx: number;
  readonly ty: number;
  readonly word: string;
  readonly accent: string | null;
  readonly slogan: string | null;
  readonly device: {
    readonly d: string;
    readonly x0: number;
    readonly x1: number;
    readonly behind: boolean;
    readonly opacity: number;
  } | null;
}

export type MarkVariant = 'color' | 'flat' | 'mono';
export type MarkTone = 'light' | 'dark';

const M: MarkData = MARK;
const flat = (tone: MarkTone) =>
  `var(--sn-mark, ${tone === 'dark' ? BRAND_COLORS.purpleOnDark : BRAND_COLORS.purple})`;
const accent = (tone: MarkTone) =>
  `var(--sn-accent, ${tone === 'dark' ? '#b07cff' : BRAND_COLORS.purple})`;
const MUTED = `var(--sn-mark-muted, ${BRAND_COLORS.inkMuted})`;

/** SVG ids must be unique per instance and safe inside url(#…). */
function useUid() {
  return 'sn' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

type Stops = readonly (readonly [number, string])[];
function Gradient({
  id,
  x1,
  y1,
  x2,
  y2,
  stops,
}: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: Stops;
}) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map(([offset, color]) => (
        <stop key={offset} offset={offset} stopColor={color} />
      ))}
    </linearGradient>
  );
}

interface ShapeProps {
  uid: string;
  small: boolean;
  variant: MarkVariant;
  tone: MarkTone;
  textured: boolean;
  animated: boolean;
}

function MarkShapes({ uid, small, variant, tone, textured, animated }: ShapeProps) {
  const body = small ? M.small.body : M.body;
  const pen = small ? M.small.pen : M.pen;
  if (variant !== 'color') {
    const fill = variant === 'mono' ? 'currentColor' : flat(tone);
    return (
      <>
        <path d={body} style={{ fill }} />
        <path d={pen} fillRule="evenodd" style={{ fill }} />
      </>
    );
  }
  if (!textured || small) {
    // small sizes: the same palette as a ramp (never a different flat colour)
    const fill = `url(#${uid}-g)`;
    return (
      <>
        <defs>
          <Gradient id={`${uid}-g`} x1={30} y1={4} x2={62} y2={98} stops={BRAND_STOPS[tone]} />
        </defs>
        <path d={body} fill={fill} />
        <path d={pen} fillRule="evenodd" fill={fill} />
      </>
    );
  }
  const sea = M.sea;
  const pal = BRAND_SEA[tone];
  const sky = `url(#${uid}-sky)`;
  return (
    <>
      <defs>
        <Gradient
          id={`${uid}-sky`}
          x1={0}
          y1={4}
          x2={0}
          y2={sea.horizon + 0.5}
          stops={BRAND_SKY[tone]}
        />
        <Gradient
          id={`${uid}-sb`}
          x1={0}
          y1={sea.horizon - 0.8}
          x2={0}
          y2={sea.horizon + 6}
          stops={[
            [0, pal.base[0]],
            [1, pal.base[1]],
          ]}
        />
        {sea.layers.map((l, i) => {
          const [rim, mid, deep] = pal.layers[i];
          return (
            <Gradient
              key={i}
              id={`${uid}-l${i}`}
              x1={0}
              y1={l.top}
              x2={0}
              y2={l.top + 12 + i * 5}
              stops={[
                [0, rim],
                [0.1, mid],
                [1, deep],
              ]}
            />
          );
        })}
        <clipPath id={`${uid}-b`}>
          <path d={body} />
        </clipPath>
        {animated ? (
          <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={-10} y={-10} width={120} height={120}>
            <path
              className="sn-draw"
              pathLength={1}
              d={M.centre}
              fill="none"
              stroke="#fff"
              strokeWidth={M.stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ '--d': '1.2s', '--t': '.1s' } as CSSProperties}
            />
          </mask>
        ) : null}
      </defs>
      <g mask={animated ? `url(#${uid}-m)` : undefined}>
        <path d={body} fill={sky} />
        <g clipPath={`url(#${uid}-b)`}>
          {M.sparks.map(([x, y, r, o], i) => (
            <path
              key={i}
              className="sn-spark"
              style={{ animationDelay: `${-i * 0.9}s` }}
              fill="#fff"
              fillOpacity={o}
              d={sparkle(x, y, r)}
            />
          ))}
          <path d={sea.base} fill={`url(#${uid}-sb)`} />
          {sea.layers.map((l, i) => (
            <g
              key={i}
              className="sn-swell"
              style={{ '--w': `${l.dur}s`, '--x': `${l.dx}px` } as CSSProperties}
            >
              <path d={l.d} fill={`url(#${uid}-l${i})`} />
              {sea.glints
                .filter((g) => g.layer === i)
                .map((g, j) => (
                  <path
                    key={j}
                    className="sn-glint"
                    style={{ animationDelay: `${g.delay}s` }}
                    fill="#fff"
                    fillOpacity={g.o}
                    d={g.d}
                  />
                ))}
            </g>
          ))}
          {sea.reflection.map((r, i) => (
            <path
              key={i}
              className="sn-refl"
              style={{ animationDelay: `${-i * 0.35}s` }}
              fill="#fff"
              fillOpacity={r.o}
              d={r.d}
            />
          ))}
        </g>
      </g>
      <path className="sn-pen" d={pen} fillRule="evenodd" fill={sky} />
    </>
  );
}

/** Four-point spark, same construction as scripts/brand/geometry.mjs `sparkle(…, 0.22)`. */
function sparkle(cx: number, cy: number, r: number) {
  const i = r * 0.22;
  const n = (v: number) => +v.toFixed(2);
  return `M${n(cx)} ${n(cy - r)}Q${n(cx + i)} ${n(cy - i)} ${n(cx + r)} ${n(cy)}Q${n(cx + i)} ${n(cy + i)} ${n(cx)} ${n(cy + r)}Q${n(cx - i)} ${n(cy + i)} ${n(cx - r)} ${n(cy)}Q${n(cx - i)} ${n(cy - i)} ${n(cx)} ${n(cy - r)}Z`;
}

function Svg({
  viewBox,
  width,
  height,
  base,
  className,
  style,
  title,
  animated,
  children,
}: {
  viewBox: string;
  width: number;
  height: number;
  base: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  animated: boolean;
  children: ReactNode;
}) {
  const cls = [base, animated ? 'sn-anim' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={width}
      height={height}
      className={cls}
      style={{ display: 'block', flex: 'none', ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {animated ? <style>{MOTION_CSS}</style> : null}
      {children}
    </svg>
  );
}

export interface MarkProps {
  /** Rendered width and height in px. */
  size?: number;
  /** Accessible name; omit when a visible label sits next to the mark. */
  title?: string;
  /** `auto` switches to the small cut (heavier stroke, wider dimple, plain pen, tight crop) at 32 px and below. */
  optical?: 'auto' | 'small' | 'large';
  /** `color` = night sky over the sea (from 40 px; a plain ramp below), `flat` = brand purple, `mono` = currentColor. */
  variant?: MarkVariant;
  /** Ground the mark sits on; `dark` lifts the palette. */
  tone?: MarkTone;
  /** The C+J writes itself, the pen settles, sparks twinkle, the sea swells. Off under prefers-reduced-motion. */
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The sea's swell is drawn in mark units, so it vanishes at header sizes: scale it up as the mark shrinks
 *  (1× at 140 px and above, up to 4× at ~35 px) so the water visibly moves everywhere. */
const swellAmp = (px: number) => Math.min(4, Math.max(1, 140 / Math.max(px, 1)));

export function Mark({
  size = 28,
  title,
  optical = 'auto',
  variant = 'color',
  tone = 'light',
  animated = false,
  className,
  style,
}: MarkProps) {
  const uid = useUid();
  const small = optical === 'small' || (optical === 'auto' && size <= 32);
  const textured = size >= 40;
  return (
    <Svg
      viewBox={small ? M.small.viewBox : '0 0 100 100'}
      width={size}
      height={size}
      base="sn-mark"
      className={className}
      style={{ ...style, '--amp': swellAmp(size) } as CSSProperties}
      title={title}
      animated={animated && !small && textured && variant === 'color'}
    >
      <MarkShapes
        uid={uid}
        small={small}
        variant={variant}
        tone={tone}
        textured={textured}
        animated={animated && !small && variant === 'color'}
      />
    </Svg>
  );
}

export interface LockupProps {
  /** Wordmark language; defaults to the current UI language (辰记 for zh-CN, StarNote for en). */
  lang?: Lang;
  /** Adds the slogan (笔落成星，文达四海 / Write it. Send it everywhere.) with its rising swash. */
  slogan?: boolean;
  /** Rendered height in px; width follows the artwork. */
  height?: number;
  /** Mark colour treatment; the wordmark always follows currentColor. */
  variant?: MarkVariant;
  /** Ground the lockup sits on; `dark` lifts the mark palette, the star and the swash. */
  tone?: MarkTone;
  /** Animate the mark. Off under prefers-reduced-motion. */
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Lockup({
  lang,
  slogan = false,
  height = 32,
  variant = 'color',
  tone = 'light',
  animated = false,
  className,
  style,
}: LockupProps) {
  const uid = useUid();
  const uiLang = useI18n((s) => s.lang);
  const L: LockupData = LOCKUP[lang ?? uiLang][slogan ? 'slogan' : 'plain'];
  const label = (lang ?? uiLang) === 'en' ? 'StarNote' : '辰记 StarNote';
  const markPx = (height * 100) / L.h;
  const small = markPx <= 34;
  const textured = markPx >= 36; // a 40 px lockup carries a ~39 px mark: still worth the scene
  const moving = animated && variant === 'color' && textured;
  const dev = L.device;
  const devFill =
    variant === 'color' ? `url(#${uid}-dv)` : variant === 'mono' ? 'currentColor' : flat(tone);
  const playing = animated && variant === 'color'; // the slogan and swash animate even when the mark is too small for the scene
  const device = dev ? (
    <path
      className={playing ? 'sn-wipe' : undefined}
      d={dev.d}
      fill={devFill}
      fillOpacity={dev.opacity < 1 ? dev.opacity : undefined}
    />
  ) : null;
  return (
    <Svg
      viewBox={`0 0 ${L.w} ${L.h}`}
      width={+((height * L.w) / L.h).toFixed(1)}
      height={height}
      base="sn-lockup"
      className={className}
      style={{ ...style, '--amp': swellAmp(markPx) } as CSSProperties}
      title={label}
      animated={playing}
    >
      {dev && variant === 'color' ? (
        <defs>
          <Gradient
            id={`${uid}-dv`}
            x1={dev.x0}
            y1={0}
            x2={dev.x1}
            y2={0}
            stops={BRAND_STOPS[tone]}
          />
        </defs>
      ) : null}
      <g transform={`translate(${L.tx} ${L.ty})`}>
        <MarkShapes
          uid={uid}
          small={small}
          variant={variant}
          tone={tone}
          textured={textured}
          animated={moving}
        />
      </g>
      {dev?.behind ? device : null}
      <path d={L.word} fill="currentColor" />
      {L.accent ? (
        <path d={L.accent} style={{ fill: variant === 'mono' ? 'currentColor' : accent(tone) }} />
      ) : null}
      {L.slogan ? (
        <path className={playing ? 'sn-slogan' : undefined} d={L.slogan} style={{ fill: MUTED }} />
      ) : null}
      {dev && !dev.behind ? device : null}
    </Svg>
  );
}
