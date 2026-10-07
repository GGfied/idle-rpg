import { describe, expect, it } from 'vitest';
import {
  blendEdge,
  edgeTufts,
  ensureGroundTextures,
  getGroundTexture,
  GROUND_H,
  GROUND_VARIANTS,
  GROUND_W,
  paintGroundPixels,
  tintFor,
  tintSpan,
  variantCount,
  variantFor,
  type GroundKind,
} from './groundTextures';

const KINDS: GroundKind[] = [
  'grass',
  'path',
  'water',
  'sand',
  'wall',
  'flowers',
  'floor',
  'bridge',
];

function fakeScene() {
  const made: string[] = [];
  const scene = {
    textures: {
      exists: (k: string) => made.includes(k),
      createCanvas: (k: string) => {
        made.push(k);
        return {
          context: {
            createImageData: () => ({ data: new Uint8ClampedArray(GROUND_W * GROUND_H * 4) }),
            putImageData: () => {},
          },
          refresh: () => {},
        };
      },
    },
  };
  return { scene: scene as never, made };
}

describe('groundTextures', () => {
  it('every kind has 4-6 variants with opaque diamond pixels and transparent corners', () => {
    for (const k of KINDS) {
      const n = variantCount(k);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(6);
      for (let v = 0; v < n; v++) {
        const px = paintGroundPixels(k, v);
        expect(px.length).toBe(GROUND_W * GROUND_H * 4);
        expect(px[3]).toBe(0); // top-left corner
        expect(px[(16 * GROUND_W + 32) * 4 + 3]).toBe(255); // centre
      }
    }
  });

  it('is deterministic, variants differ, flowers share grass', () => {
    expect(paintGroundPixels('grass', 1)).toEqual(paintGroundPixels('grass', 1));
    expect(paintGroundPixels('grass', 1)).not.toEqual(paintGroundPixels('grass', 2));
    expect(paintGroundPixels('flowers', 3)).toEqual(paintGroundPixels('grass', 3));
  });

  it('variantFor is deterministic, in range and uses every variant', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const v = variantFor(i % 20, Math.floor(i / 20), 'grass');
      expect(v).toBe(variantFor(i % 20, Math.floor(i / 20), 'grass'));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(GROUND_VARIANTS.grass);
      seen.add(v);
    }
    expect(seen.size).toBe(GROUND_VARIANTS.grass);
  });

  it('caches textures: generated once per key, flowers reuse grass', () => {
    const { scene, made } = fakeScene();
    const a = getGroundTexture(scene, 'grass', 2);
    expect(getGroundTexture(scene, 'flowers', 2)).toBe(a);
    expect(getGroundTexture(scene, 'grass', 2 + GROUND_VARIANTS.grass)).toBe(a);
    expect(made).toEqual([a]);
    const r = ensureGroundTextures(scene);
    expect(made.length).toBe(r.count);
    expect(r.bytes).toBeLessThan(4 * 1024 * 1024);
  });

  it('tintFor stays within each kind span, varies, and is smooth', () => {
    for (const k of KINDS) {
      const lo = Math.round(255 * (1 - tintSpan(k)));
      let min = 255;
      let max = 0;
      for (let i = 0; i < 300; i++) {
        const c = tintFor(i * 3, i * 7, k);
        for (const ch of [(c >> 16) & 255, (c >> 8) & 255, c & 255]) {
          expect(ch).toBeGreaterThanOrEqual(lo);
          expect(ch).toBeLessThanOrEqual(255);
          min = Math.min(min, ch);
          max = Math.max(max, ch);
        }
      }
      expect(max - min).toBeGreaterThan(2);
    }
    const a = tintFor(40, 40, 'grass') & 255;
    const b = tintFor(41, 40, 'grass') & 255;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(6);
  });

  it('blendEdge: grass overhangs path/sand, nothing else invents edges', () => {
    expect(blendEdge('path', 'grass')?.from).toBe('grass');
    expect(blendEdge('path', 'flowers')?.from).toBe('grass');
    expect(blendEdge('grass', 'path')).toBeNull();
    expect(blendEdge('grass', 'grass')).toBeNull();
    const b = blendEdge('path', 'grass')!;
    const t = edgeTufts(3, 4, 'se', b);
    expect(t).toHaveLength(b.count);
    expect(edgeTufts(3, 4, 'se', b)).toEqual(t);
    for (const p of t) expect(Math.abs(p.x) / 32 + Math.abs(p.y) / 16).toBeLessThanOrEqual(1);
  });
});
