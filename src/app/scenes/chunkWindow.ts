import type { Tile } from '@core/contracts';

/** Chunk grid of the world: how many chunks, and tiles per chunk side. */
export interface ChunkGrid {
  widthChunks: number;
  heightChunks: number;
  chunkSize: number;
}

const keyOf = (cx: number, cy: number): string => `${cx},${cy}`;

/** Chunk coordinates of a key made by this module. */
export function parseChunkKey(key: string): { cx: number; cy: number } {
  const [cx, cy] = key.split(',').map(Number);
  return { cx: cx ?? 0, cy: cy ?? 0 };
}

/** Keys of the (2*radius+1)^2 chunks around a tile (clamped into the world), edges cut off. */
export function windowKeys(tile: Tile, radius: number, grid: ChunkGrid): Set<string> {
  const at = (v: number, max: number): number =>
    Math.min(max - 1, Math.max(0, Math.floor(Math.round(v) / grid.chunkSize)));
  const cx = at(tile.x, grid.widthChunks);
  const cy = at(tile.y, grid.heightChunks);
  const out = new Set<string>();
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x >= 0 && y >= 0 && x < grid.widthChunks && y < grid.heightChunks) out.add(keyOf(x, y));
    }
  }
  return out;
}

/** Group placed things by the chunk that holds their tile. */
export function groupByChunk<T extends Tile>(items: readonly T[], size: number): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(Math.floor(it.x / size), Math.floor(it.y / size));
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Which chunk keys to load and which to drop when the window moves from `prev` to `next`. */
export function diffWindow(
  prev: ReadonlySet<string>,
  next: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: [...next].filter((k) => !prev.has(k)),
    remove: [...prev].filter((k) => !next.has(k)),
  };
}
