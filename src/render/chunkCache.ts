/** Structural chunk shape the renderer needs; the world feature's ChunkDef satisfies it. */
export interface ChunkSource {
  cx: number;
  cy: number;
  /** Side length in tiles (32). */
  size: number;
  /** size*size tile kind names, row-major. */
  tiles: readonly string[];
}

export interface ChunkCacheHooks<T> {
  /** Build a fresh resource (only called when the pool is empty). */
  create(): T;
  /** Fill `res` with this chunk's content (it may hold a previous chunk's). */
  paint(res: T, chunk: ChunkSource): void;
  /** Hide/clear a resource that left the radius; it goes back to the pool. */
  release(res: T): void;
  destroy(res: T): void;
}

export interface ChunkCacheOptions {
  widthChunks: number;
  heightChunks: number;
  chunkSize: number;
}

export type GetChunk = (cx: number, cy: number) => ChunkSource | undefined;

export interface ChunkCache {
  /** Load chunks within `radius` of the centre tile's chunk, release the rest. No-op if unchanged. */
  ensureAround(centreTx: number, centreTy: number, radius: number, getChunk: GetChunk): void;
  /** Keep exactly these chunks loaded (any shape, e.g. the camera-visible ones); the rest go to the pool. */
  ensureChunks(wanted: readonly { cx: number; cy: number }[], getChunk: GetChunk): void;
  /** Force the next ensureAround to repaint everything (e.g. world edited). */
  invalidate(): void;
  loadedKeys(): string[];
  /** Resources ever created (loaded + pooled): bounded by the most chunks wanted at once. */
  created(): number;
  destroyAll(): void;
}

const key = (cx: number, cy: number) => `${cx},${cy}`;

/** Which chunk holds a tile (global coords), clamped into the world. */
export function chunkOfTile(
  tx: number,
  ty: number,
  o: ChunkCacheOptions,
): { cx: number; cy: number } {
  const c = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.floor(v / o.chunkSize)));
  return { cx: c(tx, o.widthChunks), cy: c(ty, o.heightChunks) };
}

/** Pooling + windowing logic, independent of Phaser so it is unit-testable. */
export function createChunkCache<T>(
  opts: ChunkCacheOptions,
  hooks: ChunkCacheHooks<T>,
): ChunkCache {
  const loaded = new Map<string, T>();
  const pool: T[] = [];
  let made = 0;
  let last = '';

  const apply = (wanted: readonly { cx: number; cy: number }[], getChunk: GetChunk): void => {
    const want = new Set<string>();
    for (const { cx, cy } of wanted) {
      if (cx >= 0 && cy >= 0 && cx < opts.widthChunks && cy < opts.heightChunks)
        want.add(key(cx, cy));
    }
    for (const [k, res] of loaded) {
      if (want.has(k)) continue;
      hooks.release(res);
      pool.push(res);
      loaded.delete(k);
    }
    for (const k of want) {
      if (loaded.has(k)) continue;
      const [x, y] = k.split(',').map(Number) as [number, number];
      const chunk = getChunk(x, y);
      if (!chunk) continue;
      let res = pool.pop();
      if (res === undefined) {
        res = hooks.create();
        made++;
      }
      hooks.paint(res, chunk);
      loaded.set(k, res);
    }
  };

  return {
    ensureAround(tx, ty, radius, getChunk) {
      const { cx, cy } = chunkOfTile(tx, ty, opts);
      const sig = `${cx},${cy},${radius}`;
      if (sig === last) return;
      const want: { cx: number; cy: number }[] = [];
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) want.push({ cx: x, cy: y });
      }
      apply(want, getChunk);
      last = sig;
    },
    ensureChunks(wanted, getChunk) {
      const sig = 'v' + wanted.map((c) => key(c.cx, c.cy)).join(';');
      if (sig === last) return;
      apply(wanted, getChunk);
      last = sig;
    },
    invalidate() {
      last = '';
    },
    loadedKeys: () => [...loaded.keys()],
    created: () => made,
    destroyAll() {
      for (const res of loaded.values()) hooks.destroy(res);
      for (const res of pool) hooks.destroy(res);
      loaded.clear();
      pool.length = 0;
      made = 0;
      last = '';
    },
  };
}
