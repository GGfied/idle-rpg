import { describe, expect, it } from 'vitest';
import { LAYERS } from '@render/depth';
import {
  depthKey,
  facing4,
  facing8,
  ISO,
  pickTile,
  screenDeltaToTileDelta,
  screenToTile,
  tileToScreen,
  worldBounds,
} from './projection';

const W2 = ISO.tileWidth / 2;
const H2 = ISO.tileHeight / 2;

describe('tileToScreen / screenToTile', () => {
  it('maps known tiles', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [1, 0, 32, 16],
      [0, 1, -32, 16],
      [1, 1, 0, 32],
      [5, 2, 96, 112],
    ];
    for (const [tx, ty, x, y] of cases) {
      expect(tileToScreen({ x: tx, y: ty })).toEqual({ x, y });
    }
  });

  it('round-trips integer, negative and fractional tiles', () => {
    const tiles: [number, number][] = [];
    for (let x = -5; x <= 45; x += 4) for (let y = -5; y <= 35; y += 3) tiles.push([x, y]);
    tiles.push([3.25, 7.75], [-0.5, 0.5], [12.1, -3.9], [39.999, 29.001]);
    for (const [tx, ty] of tiles) {
      const p = tileToScreen({ x: tx, y: ty });
      const t = screenToTile(p.x, p.y);
      expect(t.x).toBeCloseTo(tx, 9);
      expect(t.y).toBeCloseTo(ty, 9);
    }
  });

  it('raises by elevation levels', () => {
    expect(tileToScreen({ x: 2, y: 2 }, 2).y).toBe(
      tileToScreen({ x: 2, y: 2 }).y - 2 * ISO.elevationPx,
    );
  });

  it('interpolated positions move linearly on screen', () => {
    const a = tileToScreen({ x: 4, y: 4 });
    const b = tileToScreen({ x: 5, y: 4 });
    const mid = tileToScreen({ x: 4.5, y: 4 });
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 9);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 9);
  });
});

describe('pickTile', () => {
  it('picks every tile from its centre and from points inside its diamond', () => {
    for (let x = -3; x < 8; x++) {
      for (let y = -3; y < 8; y++) {
        const c = tileToScreen({ x, y });
        for (const [ox, oy] of [
          [0, 0],
          [W2 - 1, 0],
          [-(W2 - 1), 0],
          [0, H2 - 1],
          [0, -(H2 - 1)],
          [W2 * 0.5, H2 * 0.4],
        ]) {
          expect(pickTile(c.x + ox!, c.y + oy!)).toEqual({ x, y });
        }
      }
    }
  });

  it('picks the neighbour just outside a diamond edge, not the bounding-box tile', () => {
    // Tile (3,3) centre; points near its bounding-box corners lie outside the diamond.
    const c = tileToScreen({ x: 3, y: 3 });
    // Point inside bbox but outside the diamond, towards bottom-right edge -> tile (4,3) (screen down-right).
    expect(pickTile(c.x + W2 - 2, c.y + H2 - 2)).toEqual({ x: 4, y: 3 });
    // Towards top-right -> (3,2); bottom-left -> (3,4); top-left -> (2,3).
    expect(pickTile(c.x + W2 - 2, c.y - H2 + 2)).toEqual({ x: 3, y: 2 });
    expect(pickTile(c.x - W2 + 2, c.y + H2 - 2)).toEqual({ x: 3, y: 4 });
    expect(pickTile(c.x - W2 + 2, c.y - H2 + 2)).toEqual({ x: 2, y: 3 });
  });

  it('flips exactly at an edge (just inside vs just outside)', () => {
    const c = tileToScreen({ x: 0, y: 0 });
    // Right-bottom edge midpoint is (W2/2, H2/2).
    const e = 0.01;
    expect(pickTile(W2 / 2 - e, H2 / 2 - e)).toEqual({ x: 0, y: 0 });
    expect(pickTile(W2 / 2 + e, H2 / 2 + e)).toEqual({ x: 1, y: 0 });
    // Vertex tips: just inside the top vertex vs just above it.
    expect(pickTile(c.x, c.y - H2 + e)).toEqual({ x: 0, y: 0 });
    expect(pickTile(c.x, c.y - H2 - e)).toEqual({ x: -1, y: -1 });
    expect(pickTile(c.x + W2 - e, c.y)).toEqual({ x: 0, y: 0 });
    expect(pickTile(c.x + W2 + e, c.y)).toEqual({ x: 1, y: -1 });
  });

  it('respects map bounds and rejects non-finite input', () => {
    const b = { width: 40, height: 30 };
    expect(pickTile(0, 0, b)).toEqual({ x: 0, y: 0 });
    expect(pickTile(0, -H2 - 1, b)).toBeNull();
    const far = tileToScreen({ x: 40, y: 0 });
    expect(pickTile(far.x, far.y, b)).toBeNull();
    expect(pickTile(Number.NaN, 0, b)).toBeNull();
    expect(pickTile(0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('depthKey', () => {
  it('sits in the entity band', () => {
    expect(depthKey({ x: 0, y: 0 })).toBe(LAYERS.ENTITY);
    expect(depthKey({ x: 10, y: 10 })).toBeLessThan(LAYERS.OVERHEAD);
  });

  it('a nearer tall object draws over the one behind it', () => {
    const behind = { x: 10, y: 9 };
    const front = { x: 10, y: 10 };
    expect(depthKey(front)).toBeGreaterThan(depthKey(behind));
    expect(depthKey({ x: 11, y: 10 })).toBeGreaterThan(depthKey({ x: 10, y: 10 }));
    // nearer on the diagonal even with a smaller tile y
    expect(depthKey({ x: 11, y: 5 })).toBeGreaterThan(depthKey({ x: 5, y: 10 }));
  });

  it('orders every pair by tx+ty across a 40x30 map, ties stable and distinct', () => {
    const keys = new Map<number, string>();
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 30; y++) {
        const k = depthKey({ x, y });
        expect(keys.has(k)).toBe(false); // same-diagonal ties are broken
        keys.set(k, `${x},${y}`);
      }
    }
    // max tie weight on diagonal d must stay below min of diagonal d+1
    expect(depthKey({ x: 39, y: 0 })).toBeLessThan(depthKey({ x: 0, y: 40 }));
    expect(depthKey({ x: 39, y: 29 })).toBeLessThan(depthKey({ x: 39, y: 30 }));
  });

  it('moving entity between tiles passes through intermediate depths, and layerOffset adds', () => {
    const a = depthKey({ x: 5, y: 5 });
    const mid = depthKey({ x: 5.5, y: 5 });
    const b = depthKey({ x: 6, y: 5 });
    expect(mid).toBeGreaterThan(a);
    expect(mid).toBeLessThan(b);
    expect(depthKey({ x: 5, y: 5 }, 0.5)).toBeCloseTo(a + 0.5, 9);
    // an entity at the same tile with +0.5 stays behind the next diagonal
    expect(depthKey({ x: 5, y: 5 }, 0.5)).toBeLessThan(depthKey({ x: 6, y: 5 }));
  });
});

describe('worldBounds', () => {
  it('40x30 bounds contain every diamond and are tight', () => {
    const b = worldBounds(40, 30);
    expect(b).toEqual({ x: -960, y: -16, width: 2240, height: 1120 });
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 30; y++) {
        const c = tileToScreen({ x, y });
        minX = Math.min(minX, c.x - W2);
        maxX = Math.max(maxX, c.x + W2);
        minY = Math.min(minY, c.y - H2);
        maxY = Math.max(maxY, c.y + H2);
      }
    }
    expect(b.x).toBe(minX);
    expect(b.x + b.width).toBe(maxX);
    expect(b.y).toBe(minY);
    expect(b.y + b.height).toBe(maxY);
  });

  it('handles tiny and non-square maps', () => {
    expect(worldBounds(1, 1)).toEqual({ x: -32, y: -16, width: 64, height: 32 });
    const b = worldBounds(3, 1);
    expect(b.width).toBe(128);
    expect(b.height).toBe(64);
  });
});

describe('screenDeltaToTileDelta', () => {
  it('inverts tile steps', () => {
    for (const [tx, ty] of [
      [1, 0],
      [0, 1],
      [-2, 3],
      [0.5, -0.25],
    ] as const) {
      const s = tileToScreen({ x: tx, y: ty });
      const d = screenDeltaToTileDelta(s.x, s.y);
      expect(d.x).toBeCloseTo(tx, 9);
      expect(d.y).toBeCloseTo(ty, 9);
    }
    expect(screenDeltaToTileDelta(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('facing', () => {
  it('8-way from tile deltas (screen directions)', () => {
    const cases: [number, number, string][] = [
      [1, 0, 'se'],
      [1, 1, 's'],
      [0, 1, 'sw'],
      [-1, 1, 'w'],
      [-1, 0, 'nw'],
      [-1, -1, 'n'],
      [0, -1, 'ne'],
      [1, -1, 'e'],
      [3, 1, 'se'],
      [1, 3, 'sw'],
      [-2, -2, 'n'],
    ];
    for (const [dx, dy, f] of cases) expect(facing8(dx, dy)).toBe(f);
    expect(facing8(0, 0)).toBeNull();
  });

  it('agrees with the screen direction of the move', () => {
    // facing 'e' must mean the sprite moves right on screen.
    const s = tileToScreen({ x: 1, y: -1 });
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBe(0);
  });

  it('4-way along the dominant tile axis', () => {
    const cases: [number, number, string][] = [
      [1, 0, 'se'],
      [-1, 0, 'nw'],
      [0, 1, 'sw'],
      [0, -1, 'ne'],
      [2, 1, 'se'],
      [1, 2, 'sw'],
      [1, 1, 'se'],
    ];
    for (const [dx, dy, f] of cases) expect(facing4(dx, dy)).toBe(f);
    expect(facing4(0, 0)).toBeNull();
  });
});
