import { hitBoundsFor, tileToWorld } from '@render/index';
import type { HitKind } from '@render/index';

/** An interactive world thing drawn on a tile; `kind` selects its drawn bounds from render. */
export interface HitTarget<T> {
  tile: { x: number; y: number };
  kind: HitKind;
  ref: T;
}

/**
 * The interactive object whose DRAWN bounds (render's `hitBoundsFor`, anchored at the tile's bottom
 * edge) contain the world point, or null (-> treat as ground). If several match, the front-most
 * (greatest tile y) wins.
 */
export function objectAtPoint<T>(
  worldX: number,
  worldY: number,
  targets: readonly HitTarget<T>[],
): T | null {
  let best: HitTarget<T> | null = null;
  for (const t of targets) {
    const b = hitBoundsFor(t.kind, tileToWorld(t.tile));
    const inside = worldX >= b.x && worldX < b.x + b.w && worldY >= b.y && worldY < b.y + b.h;
    if (inside && (!best || t.tile.y > best.tile.y)) best = t;
  }
  return best ? best.ref : null;
}
