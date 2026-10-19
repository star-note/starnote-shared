/**
 * Colours a spark can take. The first five are the landing's own (violet, deep violet, lilac, amber,
 * white) and form the random "mix" a scene sets; the last three are soft accents only avatars and the
 * logo's sea carry, so readers look like different people without the page turning into confetti.
 */
export const PALETTE: readonly string[] = [
  '#8a3ff0',
  '#6918b4',
  '#c7a6ff',
  '#ffb829',
  '#ffffff',
  '#7fe0d6',
  '#ffa3c8',
  '#93b8ff',
];

export const TONE = {
  violet: 0,
  deep: 1,
  lilac: 2,
  amber: 3,
  white: 4,
  teal: 5,
  rose: 6,
  sky: 7,
  /** No fixed colour: the point draws from the scene's mix. */
  mix: 255,
} as const;

export type Tone = (typeof TONE)[keyof typeof TONE];

/** Accent hues for avatars, cycled so neighbours differ. */
export const AVATAR_TONES: readonly Tone[] = [
  TONE.teal,
  TONE.rose,
  TONE.sky,
  TONE.amber,
  TONE.lilac,
];
