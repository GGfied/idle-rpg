import { hitBoundsFor, isoProjection } from '@render/index';
import type { HitKind } from '@render/index';

/** An interactive world thing drawn on a tile; `kind` selects its drawn bounds from render. */
export interface HitTarget<T> {
  tile: { x: number; y: number };
  kind: HitKind;
  ref: T;
}

/** Pointer slack (world px) around a tap when checking drawn pixels, so thin trunks stay tappable. */
export const OPAQUE_TOLERANCE = 2;

/**
 * Did the object draw an opaque pixel at this world point? `undefined` = unknown (no texture to
 * read, e.g. a stump or a vector figure): the drawn bounds alone decide.
 */
export type IsOpaqueAt<T> = (
  target: HitTarget<T>,
  worldX: number,
  worldY: number,
) => boolean | undefined;

const TOLERANCE_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  ...[-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1].filter((dy) => dx !== 0 || dy !== 0).map((dy) => [dx, dy] as const),
  ),
];

/**
 * The interactive object whose DRAWN bounds (render's `hitBoundsFor`, anchored at the tile's feet =
 * diamond centre) contain the world point, or null (-> treat as ground). If several match, the one
 * drawn on top (greatest `depthFor`) wins. With `isOpaqueAt`, a bounds hit above the feet only counts
 * if a drawn pixel is within OPAQUE_TOLERANCE of the point, so a tap on a transparent gap in a
 * canopy falls through to what is behind it ("the tree you see wins").
 */
export function objectAtPoint<T>(
  worldX: number,
  worldY: number,
  targets: readonly HitTarget<T>[],
  isOpaqueAt?: IsOpaqueAt<T>,
): T | null {
  let best: HitTarget<T> | null = null;
  let bestDepth = -Infinity;
  for (const t of targets) {
    const b = hitBoundsFor(t.kind, isoProjection.tileToWorld(t.tile.x, t.tile.y));
    const inside = worldX >= b.x && worldX < b.x + b.w && worldY >= b.y && worldY < b.y + b.h;
    if (!inside) continue;
    const feetY = isoProjection.tileToWorld(t.tile.x, t.tile.y).y;
    if (isOpaqueAt && worldY < feetY && !seen(t, worldX, worldY, isOpaqueAt)) continue;
    const depth = isoProjection.depthFor(t.tile.x, t.tile.y);
    if (depth > bestDepth) {
      best = t;
      bestDepth = depth;
    }
  }
  return best ? best.ref : null;
}

function seen<T>(t: HitTarget<T>, x: number, y: number, isOpaqueAt: IsOpaqueAt<T>): boolean {
  for (const [dx, dy] of TOLERANCE_OFFSETS) {
    const r = isOpaqueAt(t, x + dx * OPAQUE_TOLERANCE, y + dy * OPAQUE_TOLERANCE);
    if (r === undefined) return true;
    if (r) return true;
  }
  return false;
}
