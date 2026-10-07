import { describe, expect, it } from 'vitest';
import { diffWindow, groupByChunk, parseChunkKey, windowKeys } from './chunkWindow';

const grid = { widthChunks: 4, heightChunks: 3, chunkSize: 32 };

describe('windowKeys', () => {
  it('is the 3x3 block around the tile in the middle of the world', () => {
    const k = windowKeys({ x: 40, y: 40 }, 1, grid);
    expect([...k].sort()).toEqual(
      ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2'].sort(),
    );
  });
  it('is cut off at the world corner', () => {
    expect(windowKeys({ x: 2, y: 2 }, 1, grid).size).toBe(4);
    expect(windowKeys({ x: 127, y: 95 }, 1, grid).size).toBe(4);
  });
  it('uses the chunk of the rounded tile (interpolated positions)', () => {
    expect(windowKeys({ x: 31.6, y: 10 }, 0, grid)).toEqual(new Set(['1,0']));
    expect(windowKeys({ x: 31.4, y: 10 }, 0, grid)).toEqual(new Set(['0,0']));
  });
});

describe('groupByChunk', () => {
  it('buckets by chunk and keeps order', () => {
    const items = [
      { x: 1, y: 1, id: 'a' },
      { x: 33, y: 1, id: 'b' },
      { x: 31, y: 31, id: 'c' },
    ];
    const g = groupByChunk(items, 32);
    expect(g.get('0,0')?.map((i) => i.id)).toEqual(['a', 'c']);
    expect(g.get('1,0')?.map((i) => i.id)).toEqual(['b']);
  });
});

describe('diffWindow', () => {
  it('adds new and removes old chunks, nothing when unchanged', () => {
    const d = diffWindow(new Set(['0,0', '1,0']), new Set(['1,0', '2,0']));
    expect(d).toEqual({ add: ['2,0'], remove: ['0,0'] });
    expect(diffWindow(new Set(['1,0']), new Set(['1,0']))).toEqual({ add: [], remove: [] });
  });
});

describe('parseChunkKey', () => {
  it('round-trips', () => {
    expect(parseChunkKey('3,2')).toEqual({ cx: 3, cy: 2 });
  });
});
