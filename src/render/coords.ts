import type { Tile } from '@core/contracts';

export const TILE_SIZE = 32;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface TileBounds {
  width: number;
  height: number;
}

/** Pixel position of the centre of a tile. */
export function tileToWorld(tile: Tile): WorldPoint {
  return { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
}

/** Tile containing a world pixel. */
export function worldToTile(x: number, y: number): Tile {
  return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
}

/** Tile under a pointer's world coordinates, or null when outside the map. */
export function pointerToTile(x: number, y: number, bounds: TileBounds): Tile | null {
  const t = worldToTile(x, y);
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) return null;
  if (t.x < 0 || t.y < 0 || t.x >= bounds.width || t.y >= bounds.height) return null;
  return t;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

/** Clamp a zoom factor (for pinch/wheel). Non-finite input falls back to 1. */
export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(min, zoom));
}
