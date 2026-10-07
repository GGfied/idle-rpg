/** Where the player may stand to use something: pure geometry over the collision grid. */
import type { CollisionGrid, Tile } from '@core/contracts';
import { findPath, isAdjacentTo } from '@features/movement';

/** Whether a tile is a counter (a booth) that people may talk across. */
export type IsCounter = (tile: Tile) => boolean;

const STEPS: readonly Tile[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Tiles from which `target` can be talked to: 4-adjacent, or 2 away in a straight line over a counter. */
export function talkTiles(target: Tile, isCounter: IsCounter): Tile[] {
  const tiles: Tile[] = [];
  for (const d of STEPS) {
    tiles.push({ x: target.x + d.x, y: target.y + d.y });
    if (isCounter({ x: target.x + d.x, y: target.y + d.y }))
      tiles.push({ x: target.x + 2 * d.x, y: target.y + 2 * d.y });
  }
  return tiles;
}

/** OSRS-like reach: adjacent, or two tiles away in a straight line with a counter between. */
export function canTalk(from: Tile, target: Tile, isCounter: IsCounter): boolean {
  return (
    isAdjacentTo(from, target) ||
    talkTiles(target, isCounter).some((t) => t.x === from.x && t.y === from.y)
  );
}

/** [] if already in reach; the shortest path to a tile in reach; null if none is reachable. */
export function findPathToTalk(
  grid: CollisionGrid,
  from: Tile,
  target: Tile,
  isCounter: IsCounter,
): Tile[] | null {
  if (canTalk(from, target, isCounter)) return [];
  let best: Tile[] | null = null;
  for (const t of talkTiles(target, isCounter)) {
    const path = findPath(grid, from, t);
    if (path && (best === null || path.length < best.length)) best = path;
  }
  return best;
}
