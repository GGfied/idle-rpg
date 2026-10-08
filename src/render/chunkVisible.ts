import { isoProjection } from './projection';

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChunkGridSize {
  widthChunks: number;
  heightChunks: number;
  chunkSize: number;
}

/**
 * Chunks (row-major) whose iso ground box intersects `view` grown by `margin` world px. The test is
 * exact rectangle-vs-diamond (a chunk's ground is a diamond inside its RenderTexture box).
 */
export function visibleChunks(
  view: ViewRect,
  grid: ChunkGridSize,
  margin = 0,
  /** Also test this many chunks beyond each side of the grid (the world-edge skirt); result keeps real coords (can be -1). */
  pad = 0,
): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  const b = isoProjection.worldBounds(grid.chunkSize, grid.chunkSize);
  const hw = b.width / 2;
  const hh = b.height / 2;
  const left = view.x - margin;
  const top = view.y - margin;
  const right = view.x + view.width + margin;
  const bottom = view.y + view.height + margin;
  for (let cy = -pad; cy < grid.heightChunks + pad; cy++) {
    for (let cx = -pad; cx < grid.widthChunks + pad; cx++) {
      const o = isoProjection.tileToWorld(cx * grid.chunkSize, cy * grid.chunkSize);
      const mx = o.x + b.x + hw;
      const my = o.y + b.y + hh;
      // nearest point of the (grown) view to the diamond centre; inside the diamond = intersects
      const qx = Math.min(right, Math.max(left, mx));
      const qy = Math.min(bottom, Math.max(top, my));
      if (Math.abs(qx - mx) / hw + Math.abs(qy - my) / hh <= 1) out.push({ cx, cy });
    }
  }
  return out;
}
