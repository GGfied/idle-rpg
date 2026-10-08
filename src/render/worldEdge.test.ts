import { describe, expect, it } from 'vitest';
import {
  EDGE_STEPS,
  edgeCompositeCoverage,
  edgeCoverage,
  edgeLayerAlphas,
  edgeLayerPoly,
} from './worldEdge';

describe('world edge fade', () => {
  it('starts nearly transparent (no brightness jump at the map edge) and ends fully covered', () => {
    expect(edgeCoverage(0)).toBe(0); // ring 0 touches the map: identical to the last tile inside
    expect(edgeCompositeCoverage(0)).toBe(0);
    expect(edgeCompositeCoverage(1)).toBeLessThan(0.06);
    expect(edgeCompositeCoverage(EDGE_STEPS)).toBeCloseTo(1, 9); // beyond the fade = the backdrop
  });

  it('layer alphas compose to the intended coverage at every ring, rising smoothly outward', () => {
    const a = edgeLayerAlphas();
    expect(a).toHaveLength(EDGE_STEPS);
    let prev = 0;
    for (let i = 0; i <= EDGE_STEPS; i++) {
      if (i < EDGE_STEPS) expect(a[i]!).toBeGreaterThanOrEqual(0);
      if (i < EDGE_STEPS) expect(a[i]!).toBeLessThanOrEqual(1);
      const c = edgeCompositeCoverage(i, a);
      expect(c).toBeCloseTo(edgeCoverage(i), 9);
      expect(c - prev).toBeLessThan(0.06); // the step between neighbouring rings stays invisible
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('clips each layer to a chunk as one polygon: rectangle strip, L for a corner chunk, null inside', () => {
    const west = { x0: -32.5, y0: -0.5, x1: -0.5, y1: 31.5 }; // west of a 64x64 map
    // layer 0 grows the map by half a tile: the strip left of -1.0
    expect(edgeLayerPoly(0, 64, 64, west)).toEqual([
      [-32.5, -0.5],
      [-1, -0.5],
      [-1, 31.5],
      [-32.5, 31.5],
    ]);
    // a layer that grows past the whole chunk leaves nothing to cover
    expect(edgeLayerPoly(EDGE_STEPS * 4, 64, 64, west)).toBeNull();
    // chunk wholly out of reach of a layer: its whole rectangle
    const far = { x0: -96.5, y0: -0.5, x1: -64.5, y1: 31.5 };
    expect(edgeLayerPoly(0, 64, 64, far)).toHaveLength(4);
    // corner chunk: L shape (6 points) that excludes the grown-map corner
    const corner = { x0: -32.5, y0: -32.5, x1: -0.5, y1: -0.5 };
    const l = edgeLayerPoly(1, 64, 64, corner)!;
    expect(l).toHaveLength(6);
    expect(l).toContainEqual([-1.5, -1.5]);
    expect(l).not.toContainEqual([-0.5, -0.5]);
  });
});
