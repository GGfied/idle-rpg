import { tileNoise } from './palette';
import type { Projection } from './projection';

export interface WaterView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WaterMotion = 'on' | 'reduced' | 'off';

/** Per-mode shimmer: redraw rate, drift speed (cycles/s) and brightness scale. 'off' draws nothing. */
export const WATER_MOTION: Record<WaterMotion, { fps: number; speed: number; alpha: number }> = {
  on: { fps: 8, speed: 0.22, alpha: 1 },
  reduced: { fps: 4, speed: 0.08, alpha: 0.5 },
  off: { fps: 0, speed: 0, alpha: 0 },
};

/** Most water tiles shimmered at once; beyond this (zoomed far out) the rest stay still. */
export const MAX_WATER_TILES = 450;
const DASHES_PER_TILE = 2;
const VIEW_PAD = 40;

/**
 * Appends the packed (x, y) of every water tile whose middle is in `view` (grown by a small pad) to
 * `out`, which is cleared first and reused, so there is no per-frame allocation. At most `cap` tiles.
 */
export function collectVisibleWater(
  view: WaterView,
  proj: Projection,
  kindAt: (x: number, y: number) => string | undefined,
  out: number[],
  cap = MAX_WATER_TILES,
): number[] {
  out.length = 0;
  const l = view.x - VIEW_PAD;
  const t = view.y - VIEW_PAD;
  const r = view.x + view.width + VIEW_PAD;
  const b = view.y + view.height + VIEW_PAD;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [px, py] of [
    [l, t],
    [r, t],
    [l, b],
    [r, b],
  ] as const) {
    const w = proj.worldToTile(px, py);
    x0 = Math.min(x0, w.tx);
    x1 = Math.max(x1, w.tx);
    y0 = Math.min(y0, w.ty);
    y1 = Math.max(y1, w.ty);
  }
  if (!Number.isFinite(x0 + x1 + y0 + y1)) return out;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      if (kindAt(x, y) !== 'water') continue;
      const p = proj.tileToWorld(x, y);
      if (p.x < l || p.x > r || p.y < t || p.y > b) continue;
      out.push(x, y);
      if (out.length >= cap * 2) return out;
    }
  }
  return out;
}

export interface Dash {
  /** Tile-space offset from the tile middle, kept inside the tile. */
  ox: number;
  oy: number;
  /** 0..1 brightness envelope (fades in and out over the drift). */
  a: number;
}

/** Dash `i` of tile (x, y) at `clock` seconds: drifts along tile-x, per-tile phase and row. */
export function dashAt(
  x: number,
  y: number,
  i: number,
  clock: number,
  speed: number,
  out: Dash,
): Dash {
  const phase = tileNoise(x * 3 + i * 17, y * 5 + i) + clock * speed;
  const f = phase - Math.floor(phase);
  out.ox = -0.3 + 0.6 * f;
  out.oy = (tileNoise(y * 7 + i, x * 2 + i * 3) - 0.5) * 0.6;
  out.a = Math.sin(Math.PI * f);
  return out;
}

export const DASH_COUNT = DASHES_PER_TILE;

/** Streak length in px for dash `i` of a tile (varied so ripples don't look stamped). */
export function dashLength(x: number, y: number, i: number): number {
  return 6 + Math.floor(tileNoise(x * 11 + i, y * 3 + i * 5) * 8);
}

/**
 * A twinkling specular glint on about a third of the water tiles: `a` is 0 when the tile has none or
 * the glint is dark, up to 1 at its peak; its place on the tile is fixed, only brightness moves.
 */
export function glintAt(x: number, y: number, clock: number, speed: number, out: Dash): Dash {
  const has = tileNoise(x * 19 + 3, y * 23 + 1) > 0.66;
  out.ox = (tileNoise(x + 101, y * 7) - 0.5) * 0.6;
  out.oy = (tileNoise(y + 57, x * 5) - 0.5) * 0.6;
  if (!has) {
    out.a = 0;
    return out;
  }
  const t = clock * speed * 5 + tileNoise(x * 5, y * 9) * 6.283;
  const s = Math.sin(t);
  out.a = s > 0 ? Math.pow(s, 6) : 0;
  return out;
}
