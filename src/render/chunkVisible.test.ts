import { describe, expect, it } from 'vitest';
import { isoProjection } from './projection';
import { visibleChunks } from './chunkVisible';

const grid = { widthChunks: 4, heightChunks: 4, chunkSize: 32 };
const keys = (v: Parameters<typeof visibleChunks>[0], margin = 0) =>
  visibleChunks(v, grid, margin).map((c) => `${c.cx},${c.cy}`);

/** A small view centred on a tile. */
const at = (tx: number, ty: number, w = 100, h = 100) => {
  const p = isoProjection.tileToWorld(tx, ty);
  return { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h };
};

describe('visibleChunks', () => {
  it('a small view in a chunk middle selects only that chunk', () => {
    expect(keys(at(48, 48))).toEqual(['1,1']);
  });
  it('a view on a chunk corner selects the four chunks meeting there', () => {
    expect(keys(at(31.5, 31.5, 40, 20)).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });
  it('a huge view selects every chunk once', () => {
    expect(keys({ x: -1e6, y: -1e6, width: 2e6, height: 2e6 })).toHaveLength(16);
  });
  it('a view far outside the world selects nothing', () => {
    expect(keys({ x: 1e6, y: 1e6, width: 100, height: 100 })).toEqual([]);
  });
  it('the margin pulls in a chunk before it scrolls into view', () => {
    // just left of the chunk (1,1) diamond's west tip, but chunk (0,1) is what we stand in
    const v = at(40, 20, 10, 10);
    const near = keys(v, 0);
    const wide = keys(v, 400);
    expect(wide.length).toBeGreaterThan(near.length);
    for (const k of near) expect(wide).toContain(k);
  });
  it('the diamond corner of the bounding box is not selected', () => {
    // top-left corner of chunk (0,0)'s RenderTexture box is empty ground
    const b = isoProjection.worldBounds(32, 32);
    expect(keys({ x: b.x + 2, y: b.y + 2, width: 10, height: 10 })).toEqual([]);
  });
});
