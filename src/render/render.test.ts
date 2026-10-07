import { describe, expect, it } from 'vitest';
import { clampZoom, pointerToTile, TILE_SIZE, tileToWorld, worldToTile } from './coords';
import { depthFor, LAYERS } from './depth';
import { DEFAULT_PALETTE, FALLBACK_STYLE, tileColor } from './palette';
import { facingScaleX, hitBoundsFor, OBJECT_FOOTPRINTS, VIEW_HIT_BOUNDS } from './views';

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

describe('hit bounds', () => {
  it('trees reach canopy top: centre 26 above feet plus radius (13 / 15)', () => {
    expect(VIEW_HIT_BOUNDS.tree).toEqual({ up: 39, radius: 13 });
    expect(VIEW_HIT_BOUNDS.oak_tree).toEqual({ up: 41, radius: 15 });
  });
  it('bank chest matches its 22px-tall drawing', () => {
    expect(VIEW_HIT_BOUNDS.bank_chest.up).toBe(22);
  });
  it('bank booth and npc bounds match their drawings', () => {
    expect(VIEW_HIT_BOUNDS.bank_booth).toEqual({ up: 28, radius: 15 });
    expect(VIEW_HIT_BOUNDS.npc).toEqual({ up: 31, radius: 6 });
    expect(OBJECT_FOOTPRINTS.bank_booth).toEqual({ w: 1, h: 1, blocking: true });
    const n = hitBoundsFor('npc', { x: 48, y: 80 });
    expect(n.h).toBeGreaterThanOrEqual(TILE_SIZE);
    expect(n.w).toBeGreaterThanOrEqual(TILE_SIZE);
  });
  it('hitBoundsFor is anchored at the feet and never smaller than the tile', () => {
    const c = { x: 48, y: 80 };
    const oak = hitBoundsFor('oak_tree', c);
    expect(oak.y + oak.h).toBe(c.y + TILE_SIZE / 2);
    expect(c.y + TILE_SIZE / 2 - oak.y).toBe(41);
    expect(oak.x + oak.w / 2).toBe(c.x);
    const chest = hitBoundsFor('bank_chest', c);
    expect(chest.w).toBeGreaterThanOrEqual(TILE_SIZE);
    expect(chest.h).toBeGreaterThanOrEqual(TILE_SIZE);
  });
});
