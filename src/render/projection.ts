import {
  depthKey,
  facing8,
  pickTile,
  screenDeltaToTileDelta,
  screenToTile,
  tileToScreen,
  worldBounds,
} from './iso';

/**
 * The one projection contract: every renderer, animator, effect and pointer handler goes through
 * a `Projection`, so no one does ad-hoc view maths and a different projection (e.g. 3D) could
 * slot in later. Only `isoProjection` is implemented: isometric 2.5D is THE view.
 *
 * Convention: an integer tile coordinate is the MIDDLE of that tile; fractional tiles are
 * interpolated positions. "World" = the Phaser world pixel space.
 */
export type Facing8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface Projection {
  mode: string;
  /** World pixel of the tile's middle (fractional tiles allowed). */
  tileToWorld(tx: number, ty: number): { x: number; y: number };
  /** Exact inverse of tileToWorld: FRACTIONAL tile under a world pixel. */
  worldToTile(x: number, y: number): { tx: number; ty: number };
  /** Integer tile under a world pixel, or null outside the cols x rows map or for non-finite input. */
  pickTile(x: number, y: number, cols: number, rows: number): { tx: number; ty: number } | null;
  /** Entity depth for something standing on (tx, ty) (fractional while moving). Larger = nearer the camera. */
  depthFor(tx: number, ty: number): number;
  /** World pixel box of the whole map (camera bounds; render-texture placement). */
  worldBounds(cols: number, rows: number): { x: number; y: number; width: number; height: number };
  /** Tile-space delta spanned by a world-pixel drag (dx, dy), for drag-pan. */
  screenDeltaToTileDelta(dx: number, dy: number): { dx: number; dy: number };
  /** On-screen compass facing for a movement given as a TILE delta (dx, dy); (0,0) gives 's'. */
  facing(dx: number, dy: number): Facing8;
}

/** 2:1 isometric diamonds (64x32), built on `render/iso`. */
export const isoProjection: Projection = {
  mode: 'iso',
  tileToWorld: (tx, ty) => tileToScreen({ x: tx, y: ty }),
  worldToTile: (x, y) => {
    const t = screenToTile(x, y);
    return { tx: t.x, ty: t.y };
  },
  pickTile: (x, y, cols, rows) => {
    const t = pickTile(x, y, { width: cols, height: rows });
    return t && { tx: t.x, ty: t.y };
  },
  depthFor: (tx, ty) => depthKey({ x: tx, y: ty }),
  worldBounds: (cols, rows) => worldBounds(cols, rows),
  screenDeltaToTileDelta: (dx, dy) => {
    const d = screenDeltaToTileDelta(dx, dy);
    return { dx: d.x, dy: d.y };
  },
  facing: (dx, dy) => facing8(dx, dy) ?? 's',
};
