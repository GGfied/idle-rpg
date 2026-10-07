import type { CollisionGrid, Tile } from '@core/contracts';
import { pointKey } from '@core/utils';
import {
  AREA_ZONES,
  BLOCKING_TERRAIN,
  DEFAULT_AREA,
  MAP_ROWS,
  OBJECT_SPAWNS,
  TERRAIN_LEGEND,
  TREE_SPAWNS,
  WORLD,
} from './data';
import type { AreaInfo, TerrainKind } from './types';

/** Terrain at a tile, or undefined when out of bounds. */
export function terrainAt(x: number, y: number): TerrainKind | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  const ch = MAP_ROWS[y]?.[x];
  return ch === undefined ? undefined : TERRAIN_LEGEND[ch];
}

/**
 * Walkability grid: water, walls and tree and object tiles block; out of bounds is not walkable.
 * `blockers` adds extra blocked tiles (e.g. other entities).
 */
export function createCollisionGrid(blockers: readonly Tile[] = []): CollisionGrid {
  const blocked = new Set<string>([...TREE_SPAWNS, ...OBJECT_SPAWNS, ...blockers].map(pointKey));
  return {
    width: WORLD.width,
    height: WORLD.height,
    isWalkable(x, y) {
      const kind = terrainAt(x, y);
      return kind !== undefined && !BLOCKING_TERRAIN.includes(kind) && !blocked.has(`${x},${y}`);
    },
  };
}

/** The area containing a tile: the first matching zone, else the default area. */
export function areaAt(x: number, y: number): AreaInfo {
  const zone = AREA_ZONES.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  return zone ? { id: zone.id, kind: zone.kind, name: zone.name } : DEFAULT_AREA;
}
