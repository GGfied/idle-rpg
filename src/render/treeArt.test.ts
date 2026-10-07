import { describe, expect, it } from 'vitest';
import {
  paintTreePixels,
  TREE_FEET_X,
  TREE_FEET_Y,
  TREE_TEX_W,
  TREE_VARIANTS,
  treeVariantFor,
} from './treeArt';
import type { TreeShape } from './treeArt';
import { ART_SCALE, VIEW_HIT_BOUNDS } from './views';

const shapeFor = (kind: 'tree' | 'oak_tree'): TreeShape => ({
  canopyUp: 26 * ART_SCALE,
  canopyRadius: (kind === 'tree' ? 13 : 15) * ART_SCALE,
  trunkHalf: kind === 'tree' ? 3.5 : 4.5,
  leaf: 0x2f7d32,
  trunk: 0x6b4a2b,
});

/** Bounding box (x/y relative to the feet) of opaque pixels: the shadow is translucent so it is excluded. */
function solidBox(data: Uint8ClampedArray): { l: number; r: number; top: number } {
  let l = 1e9;
  let r = -1e9;
  let top = -1e9;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    const px = (i / 4) % TREE_TEX_W;
    const py = Math.floor(i / 4 / TREE_TEX_W);
    l = Math.min(l, px - TREE_FEET_X);
    r = Math.max(r, px - TREE_FEET_X);
    top = Math.max(top, TREE_FEET_Y - py);
  }
  return { l, r, top };
}

describe('tree art', () => {
  it('is deterministic per kind and variant', () => {
    const a = paintTreePixels(shapeFor('tree'), 'tree', 3, false);
    const b = paintTreePixels(shapeFor('tree'), 'tree', 3, false);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('variants differ in pixels and silhouette', () => {
    const shapes = new Set<string>();
    const sums = new Set<number>();
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const d = paintTreePixels(shapeFor('oak_tree'), 'oak_tree', v, false);
      const box = solidBox(d);
      shapes.add(`${box.l},${box.r},${box.top}`);
      sums.add(d.reduce((s, x) => s + x, 0));
    }
    expect(sums.size).toBe(TREE_VARIANTS);
    expect(shapes.size).toBeGreaterThan(3);
  });

  it.each(['tree', 'oak_tree'] as const)('%s never draws outside its tap box', (kind) => {
    const b = VIEW_HIT_BOUNDS[kind];
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const box = solidBox(paintTreePixels(shapeFor(kind), kind, v, false));
      expect(box.top).toBeLessThanOrEqual(b.up);
      expect(box.top).toBeGreaterThan(b.up - 2 * b.radius); // a real canopy, not a sprout
      expect(box.l).toBeGreaterThanOrEqual(-b.radius);
      expect(box.r).toBeLessThanOrEqual(b.radius);
    }
  });

  it('the stump is short, wood-topped and shares its tree trunk', () => {
    const full = paintTreePixels(shapeFor('tree'), 'tree', 2, false);
    const stump = paintTreePixels(shapeFor('tree'), 'tree', 2, true);
    expect(solidBox(stump).top).toBeLessThan(16);
    // same trunk base row (pixels one row above the feet) in both
    const row = (TREE_FEET_Y - 1) * TREE_TEX_W * 4;
    for (let x = 0; x < TREE_TEX_W; x++) {
      const i = row + x * 4;
      if (stump[i + 3] !== 255 || full[i + 3] !== 255) continue;
      expect([stump[i], stump[i + 1], stump[i + 2]]).toEqual([full[i], full[i + 1], full[i + 2]]);
    }
    expect(stump[row + TREE_FEET_X * 4 + 3]).toBe(255);
  });

  it('the tile hash covers every variant and is stable', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 40; x++)
      for (let y = 0; y < 40; y++) {
        const v = treeVariantFor(x, y);
        expect(v).toBe(treeVariantFor(x, y));
        seen.add(v);
      }
    expect(seen.size).toBe(TREE_VARIANTS);
  });
});
