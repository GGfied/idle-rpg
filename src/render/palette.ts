export interface TileStyle {
  /** Base 0xRRGGBB colour. */
  base: number;
  /** Max per-channel brightness variation (+/-). */
  variation: number;
}

export type TilePalette = Record<string, TileStyle>;

export const DEFAULT_PALETTE: TilePalette = {
  grass: { base: 0x4f8a3c, variation: 10 },
  path: { base: 0xb09564, variation: 8 },
  water: { base: 0x2f6fb5, variation: 12 },
  sand: { base: 0xd9c78a, variation: 6 },
  wall: { base: 0x6b6b72, variation: 8 },
  floor: { base: 0xa8793f, variation: 6 },
  flowers: { base: 0x4f8a3c, variation: 10 },
};

export const FALLBACK_STYLE: TileStyle = { base: 0xff00ff, variation: 0 };

/** Deterministic hash of a tile position to [0,1). */
export function tileNoise(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function shade(color: number, delta: number): number {
  const c = (v: number) => Math.min(255, Math.max(0, v + delta));
  return (c((color >> 16) & 255) << 16) | (c((color >> 8) & 255) << 8) | c(color & 255);
}

/** Colour for a tile kind at (x,y); unknown kinds get the magenta fallback. Deterministic. */
export function tileColor(
  kind: string,
  x: number,
  y: number,
  palette: TilePalette = DEFAULT_PALETTE,
): number {
  const style = palette[kind] ?? FALLBACK_STYLE;
  const delta = Math.round((tileNoise(x, y) * 2 - 1) * style.variation);
  return shade(style.base, delta);
}
