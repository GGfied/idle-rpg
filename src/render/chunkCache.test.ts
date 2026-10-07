import { describe, expect, it } from 'vitest';
import { chunkOfTile, createChunkCache, type ChunkSource } from './chunkCache';

const opts = { widthChunks: 4, heightChunks: 3, chunkSize: 32 };
const getChunk = (cx: number, cy: number): ChunkSource => ({ cx, cy, size: 32, tiles: [] });

function setup() {
  let n = 0;
  const log = { paints: [] as string[], released: 0, destroyed: 0 };
  const cache = createChunkCache<{ id: number }>(opts, {
    create: () => ({ id: n++ }),
    paint: (_r, c) => log.paints.push(`${c.cx},${c.cy}`),
    release: () => log.released++,
    destroy: () => log.destroyed++,
  });
  return { cache, log };
}

describe('chunkOfTile', () => {
  it('floors and clamps into the world', () => {
    expect(chunkOfTile(31, 32, opts)).toEqual({ cx: 0, cy: 1 });
    expect(chunkOfTile(-5, 999, opts)).toEqual({ cx: 0, cy: 2 });
    expect(chunkOfTile(127, 95, opts)).toEqual({ cx: 3, cy: 2 });
  });
});

describe('createChunkCache', () => {
  it('loads a clipped window at corners and a full 3x3 in the middle', () => {
    const a = setup();
    a.cache.ensureAround(0, 0, 1, getChunk);
    expect(a.cache.loadedKeys().sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
    const b = setup();
    b.cache.ensureAround(127, 95, 1, getChunk);
    expect(b.cache.loadedKeys().sort()).toEqual(['2,1', '2,2', '3,1', '3,2']);
    const c = setup();
    c.cache.ensureAround(40, 40, 1, getChunk);
    expect(c.cache.loadedKeys()).toHaveLength(9);
    const e = setup();
    e.cache.ensureAround(64, 0, 1, getChunk); // top edge
    expect(e.cache.loadedKeys()).toHaveLength(6);
  });

  it('releases chunks outside the radius', () => {
    const { cache, log } = setup();
    cache.ensureAround(0, 0, 1, getChunk);
    cache.ensureAround(100, 0, 1, getChunk); // cx 3: keeps 2,3
    expect(cache.loadedKeys().sort()).toEqual(['2,0', '2,1', '3,0', '3,1']);
    expect(log.released).toBe(4); // the whole 2x2 west block left
  });

  it('is a no-op while the centre chunk is unchanged', () => {
    const { cache, log } = setup();
    cache.ensureAround(40, 40, 1, getChunk);
    const painted = log.paints.length;
    cache.ensureAround(41, 63, 1, getChunk);
    cache.ensureAround(33, 33, 1, getChunk);
    expect(log.paints.length).toBe(painted);
    cache.invalidate();
    cache.ensureAround(40, 40, 1, getChunk);
    expect(log.paints.length).toBe(painted); // still loaded, nothing to repaint
  });

  it('keeps the pool bounded after walking across the world and back', () => {
    const { cache } = setup();
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 0; x < 128; x += 8)
        for (const y of [0, 40, 90]) cache.ensureAround(x, y, 1, getChunk);
      for (let x = 127; x >= 0; x -= 8) cache.ensureAround(x, 50, 1, getChunk);
    }
    expect(cache.created()).toBeLessThanOrEqual(10); // 3x3 window + 1 in flight
  });

  it('skips chunks the world does not provide and destroys everything', () => {
    const { cache, log } = setup();
    cache.ensureAround(40, 40, 1, (cx, cy) =>
      cx === 1 && cy === 1 ? undefined : getChunk(cx, cy),
    );
    expect(cache.loadedKeys()).toHaveLength(8);
    cache.destroyAll();
    expect(log.destroyed).toBe(8);
    expect(cache.loadedKeys()).toHaveLength(0);
  });
});

describe('createChunkCache.ensureChunks', () => {
  it('loads exactly the wanted chunks, reuses pooled resources, ignores out-of-world', () => {
    const a = setup();
    a.cache.ensureChunks(
      [
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
        { cx: 9, cy: 9 },
      ],
      getChunk,
    );
    expect(a.cache.loadedKeys().sort()).toEqual(['0,0', '1,0']);
    expect(a.cache.created()).toBe(2);
    a.cache.ensureChunks([{ cx: 2, cy: 0 }], getChunk);
    expect(a.cache.loadedKeys()).toEqual(['2,0']);
    expect(a.cache.created()).toBe(2);
    expect(a.log.released).toBe(2);
  });
  it('is a no-op for an unchanged set and repaints after invalidate', () => {
    const a = setup();
    const w = [{ cx: 1, cy: 1 }];
    a.cache.ensureChunks(w, getChunk);
    a.cache.ensureChunks(w, getChunk);
    expect(a.log.paints).toHaveLength(1);
    a.cache.invalidate();
    a.cache.ensureChunks(
      [
        { cx: 1, cy: 1 },
        { cx: 2, cy: 1 },
      ],
      getChunk,
    );
    expect(a.log.paints).toHaveLength(2);
  });
});
