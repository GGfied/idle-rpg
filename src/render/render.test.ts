import { describe, expect, it } from 'vitest';
import { clampZoom, pointerToTile, TILE_SIZE, tileToWorld, worldToTile } from './coords';
import { depthFor, LAYERS } from './depth';
import { DEFAULT_PALETTE, FALLBACK_STYLE, tileColor } from './palette';
import { ISO } from './iso';
import { isoProjection } from './projection';
import { ART_SCALE, facingScaleX, hitBoundsFor, OBJECT_FOOTPRINTS, VIEW_HIT_BOUNDS } from './views';

describe('coords', () => {
  it('tileToWorld gives tile centre and round-trips', () => {
    expect(tileToWorld({ x: 2, y: 3 })).toEqual({ x: 80, y: 112 });
    const p = tileToWorld({ x: 7, y: 9 });
    expect(worldToTile(p.x, p.y)).toEqual({ x: 7, y: 9 });
  });
  it('worldToTile floors, including negatives', () => {
    expect(worldToTile(TILE_SIZE - 0.1, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(-1, -1)).toEqual({ x: -1, y: -1 });
  });
  it('pointerToTile returns null out of bounds', () => {
    const b = { width: 4, height: 3 };
    expect(pointerToTile(0, 0, b)).toEqual({ x: 0, y: 0 });
    expect(pointerToTile(4 * TILE_SIZE - 1, 3 * TILE_SIZE - 1, b)).toEqual({ x: 3, y: 2 });
    expect(pointerToTile(4 * TILE_SIZE, 0, b)).toBeNull();
    expect(pointerToTile(-1, 5, b)).toBeNull();
    expect(pointerToTile(NaN, 5, b)).toBeNull();
  });
  it('clampZoom clamps and handles NaN', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(NaN)).toBe(1);
  });
});

describe('depth', () => {
  it('sorts by y within the entity layer', () => {
    expect(depthFor(5)).toBeGreaterThan(depthFor(4));
    expect(depthFor(0)).toBeGreaterThanOrEqual(LAYERS.ENTITY);
    expect(depthFor(1000)).toBeLessThan(LAYERS.OVERHEAD);
  });
});

describe('palette', () => {
  it('is deterministic and varies subtly', () => {
    expect(tileColor('grass', 3, 4)).toBe(tileColor('grass', 3, 4));
    const base = DEFAULT_PALETTE['grass']!;
    const g = (c: number) => (c >> 8) & 255;
    for (let i = 0; i < 50; i++) {
      expect(Math.abs(g(tileColor('grass', i, i * 3)) - g(base.base))).toBeLessThanOrEqual(
        base.variation,
      );
    }
  });
  it('floor is warm wood, deterministic and subtly varied', () => {
    const f = DEFAULT_PALETTE['floor']!;
    expect(f.base >> 16).toBeGreaterThan(f.base & 255); // red > blue: warm
    expect(f.variation).toBeLessThanOrEqual(8);
    expect(tileColor('floor', 5, 6)).toBe(tileColor('floor', 5, 6));
    expect(tileColor('floor', 5, 6)).not.toBe(FALLBACK_STYLE.base);
  });
  it('covers default kinds and falls back for unknown', () => {
    for (const k of ['grass', 'path', 'water', 'sand', 'wall', 'flowers', 'floor'])
      expect(DEFAULT_PALETTE[k]).toBeDefined();
    expect(tileColor('lava', 1, 1)).toBe(FALLBACK_STYLE.base);
  });
});

describe('facingScaleX', () => {
  it('flips only when facing left', () => {
    expect(facingScaleX(true)).toBe(-1);
    expect(facingScaleX(false)).toBe(1);
  });
});

describe('hit bounds (iso)', () => {
  const c = isoProjection.tileToWorld(3, 4); // the view's feet
  it('trees reach canopy top: (centre 26 + radius) * art scale above the feet', () => {
    expect(VIEW_HIT_BOUNDS.tree).toEqual({ up: 39 * ART_SCALE, radius: 13 * ART_SCALE });
    expect(VIEW_HIT_BOUNDS.oak_tree).toEqual({ up: 41 * ART_SCALE, radius: 15 * ART_SCALE });
  });
  it('bank and npc bounds match their drawings', () => {
    expect(VIEW_HIT_BOUNDS.bank_chest.up).toBe(22 * ART_SCALE);
    expect(VIEW_HIT_BOUNDS.bank_booth).toEqual({ up: 28 * ART_SCALE, radius: 15 * ART_SCALE });
    expect(VIEW_HIT_BOUNDS.npc).toEqual({ up: 31 * ART_SCALE, radius: 6 * ART_SCALE });
    expect(OBJECT_FOOTPRINTS.bank_booth).toEqual({ w: 1, h: 1, blocking: true });
  });
  it('a tree box covers trunk, canopy top and canopy edge, and nothing past them', () => {
    const b = hitBoundsFor('oak_tree', c);
    const inside = (x: number, y: number) =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    expect(inside(c.x, c.y - 4)).toBe(true); // trunk base
    expect(inside(c.x, c.y - 41 * ART_SCALE + 1)).toBe(true); // canopy top
    expect(inside(c.x + 15 * ART_SCALE - 1, c.y - 26 * ART_SCALE)).toBe(true); // canopy edge
    expect(inside(c.x, c.y - 41 * ART_SCALE - 2)).toBe(false); // above canopy
    expect(inside(c.x + 15 * ART_SCALE + 2, c.y - 26 * ART_SCALE)).toBe(false);
    expect(inside(c.x, c.y + 20)).toBe(false); // below the feet
  });
  it('box is centred on the feet and at least half a tile wide', () => {
    const n = hitBoundsFor('npc', c);
    expect(n.x + n.w / 2).toBeCloseTo(c.x);
    expect(n.w).toBeGreaterThanOrEqual(ISO.tileWidth / 2);
    expect(n.y).toBeCloseTo(c.y - 31 * ART_SCALE);
  });
});

describe('isoProjection', () => {
  const p = isoProjection;
  it('tileToWorld gives the diamond centre and round-trips fractional tiles', () => {
    expect(p.tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(p.tileToWorld(2, 3)).toEqual({ x: -32, y: 80 });
    for (const [tx, ty] of [
      [7, 9],
      [3.25, 8.5],
      [-1.5, 2],
    ] as const) {
      const w = p.tileToWorld(tx, ty);
      const t = p.worldToTile(w.x, w.y);
      expect(t.tx).toBeCloseTo(tx);
      expect(t.ty).toBeCloseTo(ty);
    }
  });
  it('pickTile hits tile centres, corners-of-diamond inside, and rejects outside the map', () => {
    expect(p.pickTile(0, 0, 4, 3)).toEqual({ tx: 0, ty: 0 });
    const c = p.tileToWorld(2, 1);
    expect(p.pickTile(c.x, c.y, 4, 3)).toEqual({ tx: 2, ty: 1 });
    expect(p.pickTile(c.x + 30, c.y, 4, 3)).toEqual({ tx: 2, ty: 1 }); // near right corner
    expect(p.pickTile(c.x, c.y + 15, 4, 3)).toEqual({ tx: 2, ty: 1 }); // near bottom corner
    expect(p.pickTile(c.x + 34, c.y, 4, 3)).not.toEqual({ tx: 2, ty: 1 }); // past the corner
    const out = p.tileToWorld(4, 0);
    expect(p.pickTile(out.x, out.y, 4, 3)).toBeNull();
    expect(p.pickTile(NaN, 0, 4, 3)).toBeNull();
  });
  it('depth: nearer (larger tx+ty) draws later', () => {
    expect(p.depthFor(3, 3)).toBeGreaterThan(p.depthFor(2, 3));
    expect(p.depthFor(3, 3)).toBeGreaterThan(p.depthFor(3, 2));
    expect(p.depthFor(9, 0)).toBeGreaterThan(p.depthFor(0, 8)); // 9 > 8 diagonal steps
    expect(p.depthFor(2.5, 3)).toBeGreaterThan(p.depthFor(2, 3)); // fractional while moving
    expect(p.depthFor(40, 40)).toBeLessThan(LAYERS.OVERHEAD);
    expect(p.depthFor(0, 0)).toBeGreaterThanOrEqual(LAYERS.ENTITY);
  });
  it('worldBounds contains every tile diamond; drag delta and facing follow tile axes', () => {
    const b = p.worldBounds(5, 3);
    for (const [tx, ty] of [
      [0, 0],
      [4, 0],
      [0, 2],
      [4, 2],
    ] as const) {
      const w = p.tileToWorld(tx, ty);
      expect(w.x - ISO.tileWidth / 2).toBeGreaterThanOrEqual(b.x - 1e-9);
      expect(w.x + ISO.tileWidth / 2).toBeLessThanOrEqual(b.x + b.width + 1e-9);
      expect(w.y + ISO.tileHeight / 2).toBeLessThanOrEqual(b.y + b.height + 1e-9);
    }
    expect(p.screenDeltaToTileDelta(64, 0)).toEqual({ dx: 1, dy: -1 });
    expect(p.facing(1, 0)).toBe('se');
    expect(p.facing(0, -1)).toBe('ne');
    expect(p.facing(0, 0)).toBe('s');
  });
});
