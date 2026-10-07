import type { Tile } from '@core/contracts';
import { LAYERS } from '@render/depth';

/**
 * Isometric (2:1 diamond) projection: the single source of truth for the iso view.
 * Pure and Phaser-free. Convention (same as the top-down view): an integer tile
 * coordinate is the MIDDLE of that tile, so fractional (interpolated) positions work directly.
 * Tile (0,0) centre is screen (0,0); +x tile goes down-right, +y tile goes down-left.
 */
export const ISO = {
  tileWidth: 64,
  tileHeight: 32,
  /** Screen pixels per elevation level (future: stairs, upper floors). */
  elevationPx: 16,
} as const;

const HALF_W = ISO.tileWidth / 2;
const HALF_H = ISO.tileHeight / 2;

/** Depth tie-break weight per tile column; keeps the tie below one diagonal step for maps < 5000 wide. */
const TIE_WEIGHT = 1e-4;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TileDelta {
  x: number;
  y: number;
}

export interface IsoBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Facing as seen on screen. */
export type IsoFacing8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
/** The four tile-axis directions, which are the screen diagonals. */
export type IsoFacing4 = 'ne' | 'se' | 'sw' | 'nw';

/** Screen pixel of a tile centre (fractional tiles allowed). `level` raises it by elevation levels. */
export function tileToScreen(tile: Tile, level = 0): ScreenPoint {
  return {
    x: (tile.x - tile.y) * HALF_W,
    y: (tile.x + tile.y) * HALF_H - level * ISO.elevationPx,
  };
}

/** Exact inverse of tileToScreen at level 0. Fractional and negative results are kept. */
export function screenToTile(x: number, y: number): Tile {
  const u = x / HALF_W;
  const v = y / HALF_H;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

/**
 * The integer tile whose diamond contains the screen point. A diamond is a square in tile
 * space, so this rounds (half-open: a point exactly on the top/left edge belongs to this tile).
 * With `bounds`, returns null outside the map or for non-finite input.
 */
export function pickTile(
  x: number,
  y: number,
  bounds?: { width: number; height: number },
): Tile | null {
  const t = screenToTile(x, y);
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) return null;
  const tile = { x: Math.floor(t.x + 0.5), y: Math.floor(t.y + 0.5) };
  if (bounds && (tile.x < 0 || tile.y < 0 || tile.x >= bounds.width || tile.y >= bounds.height)) {
    return null;
  }
  return tile;
}

/**
 * Depth for something standing on `tile` (fractional while moving). Larger tx+ty is nearer the
 * camera, so a tall object (tree, booth, NPC) on a nearer tile draws over one behind it.
 * Objects on the same diagonal are side by side; they tie-break by tile x so the order is stable.
 * `layerOffset` adds to the result (e.g. +0.5 to sit in front of whatever shares the tile).
 */
export function depthKey(tile: Tile, layerOffset = 0): number {
  return LAYERS.ENTITY + tile.x + tile.y + tile.x * TIE_WEIGHT + layerOffset;
}

/** Pixel bounding box of the whole diamond map (for camera bounds). */
export function worldBounds(width: number, height: number): IsoBounds {
  return {
    x: -(height * ISO.tileWidth) / 2,
    y: -ISO.tileHeight / 2,
    width: ((width + height) * ISO.tileWidth) / 2,
    height: ((width + height) * ISO.tileHeight) / 2,
  };
}

/** Convert a screen-pixel drag (dx, dy) to the tile-space delta it spans (for drag-pan). */
export function screenDeltaToTileDelta(dx: number, dy: number): TileDelta {
  const u = dx / HALF_W;
  const v = dy / HALF_H;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

// Octant index (tile-space angle, clockwise from +x tile axis) -> screen facing.
const FACING8: readonly IsoFacing8[] = ['se', 's', 'sw', 'w', 'nw', 'n', 'ne', 'e'];
const FACING4_X: readonly IsoFacing4[] = ['se', 'nw']; // moving +x / -x
const FACING4_Y: readonly IsoFacing4[] = ['sw', 'ne']; // moving +y / -y

/** 8-way screen facing for a tile delta; null for no movement. (+1,0) faces se, (+1,+1) faces s. */
export function facing8(dx: number, dy: number): IsoFacing8 | null {
  if (dx === 0 && dy === 0) return null;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return FACING8[((octant % 8) + 8) % 8] ?? null;
}

/** 4-way facing along the dominant tile axis (ties go to x); null for no movement. */
export function facing4(dx: number, dy: number): IsoFacing4 | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return FACING4_X[dx > 0 ? 0 : 1] ?? null;
  return FACING4_Y[dy > 0 ? 0 : 1] ?? null;
}
