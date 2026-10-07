import { describe, expect, it } from 'vitest';
import { FLOWER_VARIETIES, FLOWERS_PER_TILE, flowersForTile, placeFlower } from './flowers';
import { isoProjection } from './projection';

describe('flowers', () => {
  it('lays out a deterministic few flowers per tile, inside the tile, in several varieties', () => {
    const a = flowersForTile(12, 7);
    expect(a).toHaveLength(FLOWERS_PER_TILE);
    expect(flowersForTile(12, 7)).toEqual(a);
    expect(flowersForTile(13, 7)).not.toEqual(a);
    const seen = new Set<string>();
    for (let x = 0; x < 30; x++)
      for (const f of flowersForTile(x, 4)) {
        expect(Math.abs(f.ox)).toBeLessThanOrEqual(0.35);
        expect(Math.abs(f.oy)).toBeLessThanOrEqual(0.35);
        seen.add(f.variety);
      }
    expect([...seen].sort()).toEqual([...FLOWER_VARIETIES].sort());
  });

  it('places an image depth-sorted by its base, reusing a pooled image and tagging its data', () => {
    const calls: string[] = [];
    const data: Record<string, unknown> = {};
    const img: Record<string, unknown> = {};
    for (const m of ['setTexture', 'setPosition', 'setOrigin', 'setRotation', 'setVisible'])
      img[m] = () => (calls.push(m), img);
    img.setDepth = (d: number) => ((img.depth = d), img);
    img.setData = (k: string, v: unknown) => ((data[k] = v), img);
    const f = flowersForTile(5, 9)[0]!;
    const out = placeFlower({} as never, img as never, 5, 9, f);
    expect(out).toBe(img);
    expect(img.depth).toBeCloseTo(isoProjection.depthFor(5 + f.ox, 9 + f.oy));
    expect(calls).toContain('setRotation'); // sway reset on reuse
    expect(data.flower).toMatchObject({ tx: 5, ty: 9, variety: f.variety });
  });
});
