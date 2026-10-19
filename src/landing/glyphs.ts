/**
 * A tiny 5×7 pixel font for the labels particles can spell: file formats on the document icons
 * (PDF, DOC, MD, XLS, PPT, IMG, MP4) and the initials on avatar discs. Pixel cells read crisply as
 * dots, need no font loading, and keep the shapes deterministic.
 */
const FONT: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
};

export const GLYPH_ROWS = 7;

/** Lit cells of `text` on a pixel grid (column, row), one blank column between letters. */
export function glyphCells(text: string): { cells: [number, number][]; cols: number } {
  const cells: [number, number][] = [];
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch];
    if (!g) {
      x += 4; // unknown or space: an empty slot
      continue;
    }
    g.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '1') cells.push([x + c, r]);
    });
    x += g[0].length + 1;
  }
  return { cells, cols: Math.max(0, x - 1) };
}

export const hasGlyph = (ch: string) => ch.toUpperCase() in FONT;
