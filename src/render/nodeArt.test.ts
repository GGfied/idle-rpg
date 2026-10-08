import { describe, expect, it } from 'vitest';
import {
  paintRockPixels,
  ROCK_FEET_X,
  ROCK_FEET_Y,
  ROCK_HALF_W,
  ROCK_LOOKS,
  ROCK_TEX_W,
  ROCK_TOP,
  ROCK_VARIANTS,
  rockVariantFor,
} from './rockArt';
import type { RockArtKind } from './rockArt';
import { paintSpotPixels, SPOT_FRAMES, SPOT_TEX_H, SPOT_TEX_W } from './spotArt';
import {
  ART_SCALE,
  hitBoundsFor,
  NODE_FOOTPRINTS,
  PIXEL_HIT_KINDS,
  VIEW_HIT_BOUNDS,
} from './views';
import { opaqueAtImage } from './artHit';

const KINDS: RockArtKind[] = ['copper_rock', 'tin_rock', 'iron_rock', 'coal_rock'];

/** Opaque (alpha 255; the shadow is translucent) pixel extents relative to the feet, in art px. */
function solidBox(d: Uint8ClampedArray): { l: number; r: number; top: number } {
  let l = 1e9;
  let r = -1e9;
  let top = -1e9;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] !== 255) continue;
    const px = (i / 4) % ROCK_TEX_W;
    const py = Math.floor(i / 4 / ROCK_TEX_W);
    l = Math.min(l, px - ROCK_FEET_X);
    r = Math.max(r, px - ROCK_FEET_X);
    top = Math.max(top, ROCK_FEET_Y - py);
  }
  return { l, r, top };
}

describe('rock art', () => {
  it('is deterministic', () => {
    const a = paintRockPixels('iron_rock', 2, false);
    const b = paintRockPixels('iron_rock', 2, false);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.glints).toEqual(b.glints);
  });

  it('stays inside the drawn bounds the tap box is derived from', () => {
    for (const k of KINDS)
      for (let v = 0; v < ROCK_VARIANTS; v++) {
        const box = solidBox(paintRockPixels(k, v, false).data);
        expect(box.top).toBeLessThanOrEqual(ROCK_TOP * ART_SCALE);
        expect(Math.max(-box.l, box.r)).toBeLessThanOrEqual(ROCK_HALF_W * ART_SCALE);
        expect(box.top).toBeGreaterThan(ROCK_TOP * ART_SCALE * 0.7); // and fills most of it
      }
  });

  it('each ore looks different, and variants differ', () => {
    const sums = new Set(
      KINDS.map((k) => paintRockPixels(k, 0, false).data.reduce((a, b) => a + b, 0)),
    );
    expect(sums.size).toBe(KINDS.length);
    const variants = new Set(
      Array.from({ length: ROCK_VARIANTS }, (_, v) =>
        paintRockPixels('tin_rock', v, false).data.join(),
      ),
    );
    expect(variants.size).toBe(ROCK_VARIANTS);
    expect(new Set(KINDS.map((k) => ROCK_LOOKS[k].ore)).size).toBe(KINDS.length);
  });

  it('ore veins are painted in the ore colour family and glints sit on solid pixels', () => {
    const { data, glints } = paintRockPixels('copper_rock', 1, false);
    expect(glints.length).toBeGreaterThanOrEqual(3);
    for (const g of glints) expect(data[(g.y * ROCK_TEX_W + g.x) * 4 + 3]).toBe(255);
    let orange = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 3] === 255 && (data[i] ?? 0) > (data[i + 2] ?? 0) + 60) orange++;
    expect(orange).toBeGreaterThan(8);
  });

  it('depleted rubble is low, has no glints and no ore colour', () => {
    const full = solidBox(paintRockPixels('copper_rock', 0, false).data);
    const rub = paintRockPixels('copper_rock', 0, true);
    expect(rub.glints).toEqual([]);
    expect(solidBox(rub.data).top).toBeLessThan(full.top / 2);
  });

  it('variant hash is stable and in range', () => {
    for (let i = 0; i < 50; i++) {
      const v = rockVariantFor(i, i * 3);
      expect(v).toBe(rockVariantFor(i, i * 3));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(ROCK_VARIANTS);
    }
  });
});

describe('spot art', () => {
  const sum = (d: Uint8ClampedArray): number => d.reduce((a, b) => a + b, 0);

  it('animates (frames differ) and loops deterministically', () => {
    const frames = new Set(
      Array.from({ length: SPOT_FRAMES }, (_, f) => paintSpotPixels('net_spot', f).join()),
    );
    expect(frames.size).toBe(SPOT_FRAMES);
    expect(Array.from(paintSpotPixels('bait_spot', 2))).toEqual(
      Array.from(paintSpotPixels('bait_spot', 2 + SPOT_FRAMES)),
    );
  });

  it('net and bait spots look different, and are translucent water decals', () => {
    expect(sum(paintSpotPixels('net_spot', 0))).not.toBe(sum(paintSpotPixels('bait_spot', 0)));
    const d = paintSpotPixels('bait_spot', 0);
    let opaque = 0;
    let some = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] === 255) opaque++;
      if ((d[i] ?? 0) > 0) some++;
    }
    expect(some).toBeGreaterThan(60);
    expect(opaque / some).toBeLessThan(0.15);
  });

  it('net and bait spots differ in every frame and in extent (net is wider)', () => {
    const extent = (d: Uint8ClampedArray): number => {
      let lo = SPOT_TEX_W;
      let hi = 0;
      for (let i = 3; i < d.length; i += 4) {
        if ((d[i] ?? 0) === 0) continue;
        const x = ((i - 3) / 4) % SPOT_TEX_W;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return hi - lo;
    };
    for (let f = 0; f < SPOT_FRAMES; f++) {
      expect(paintSpotPixels('net_spot', f).join()).not.toBe(
        paintSpotPixels('bait_spot', f).join(),
      );
    }
    const sumExt = (k: 'net_spot' | 'bait_spot'): number =>
      Array.from({ length: SPOT_FRAMES }, (_, f) => extent(paintSpotPixels(k, f))).reduce(
        (a, b) => a + b,
        0,
      );
    expect(sumExt('net_spot')).toBeGreaterThan(sumExt('bait_spot'));
  });

  it('net spot is clearly visible: big, bright, mostly covering the tile', () => {
    const stats = (k: 'net_spot' | 'bait_spot', f: number): { px: number; bright: number } => {
      const d = paintSpotPixels(k, f);
      let px = 0;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] ?? 0;
        if (a === 0) continue;
        px++;
        if (a >= 200 && (d[i] ?? 0) > 200 && (d[i + 1] ?? 0) > 220) bright++;
      }
      return { px, bright };
    };
    for (let f = 0; f < SPOT_FRAMES; f++) {
      const net = stats('net_spot', f);
      expect(net.px).toBeGreaterThan(940); // old art covered 730-884
      expect(net.bright).toBeGreaterThan(90); // foam, flecks, glints
      expect(net.px).toBeGreaterThan(stats('bait_spot', f).px * 1.5);
    }
    // the net spot's flecks twinkle: bright pixel count changes between frames
    const counts = new Set(
      Array.from({ length: SPOT_FRAMES }, (_, f) => stats('net_spot', f).bright),
    );
    expect(counts.size).toBeGreaterThan(2);
  });

  it('draws inside the texture (every frame), within the tile', () => {
    for (const k of ['net_spot', 'bait_spot'] as const)
      for (let f = 0; f < SPOT_FRAMES; f++) {
        const d = paintSpotPixels(k, f);
        for (let i = 3; i < d.length; i += 4) {
          if ((d[i] ?? 0) === 0) continue;
          const x = ((i - 3) / 4) % SPOT_TEX_W;
          const y = Math.floor((i - 3) / 4 / SPOT_TEX_W);
          expect(x).toBeGreaterThan(2);
          expect(x).toBeLessThan(SPOT_TEX_W - 3);
          expect(y).toBeGreaterThan(1);
          expect(y).toBeLessThan(SPOT_TEX_H - 2);
        }
      }
  });
});

describe('node hit bounds and footprints', () => {
  const tile = { x: 100, y: 100 };
  it('rocks cover their drawn body, spots cover the whole water tile', () => {
    const rock = hitBoundsFor('iron_rock', tile);
    expect(rock.y).toBe(tile.y - ROCK_TOP * ART_SCALE);
    expect(rock.w).toBe(ROCK_HALF_W * ART_SCALE * 2);
    const spot = hitBoundsFor('net_spot', tile);
    expect(spot.w).toBeGreaterThanOrEqual(60);
    expect(spot.y).toBeLessThan(tile.y);
    expect(hitBoundsFor('bait_spot', tile)).toEqual({ ...spot });
    expect(Object.keys(VIEW_HIT_BOUNDS)).toEqual(
      expect.arrayContaining([...KINDS, 'net_spot', 'bait_spot']),
    );
  });
  it('rocks block their tile and pixel-hit; spots do not', () => {
    for (const k of KINDS) {
      expect(NODE_FOOTPRINTS[k].blocking).toBe(true);
      expect(PIXEL_HIT_KINDS.has(k)).toBe(true);
    }
    expect(PIXEL_HIT_KINDS.has('net_spot')).toBe(false);
    expect(PIXEL_HIT_KINDS.has('bait_spot')).toBe(false);
    expect(PIXEL_HIT_KINDS.has('tree')).toBe(true);
  });
});

describe('opaqueAtImage', () => {
  const img = {
    x: 0,
    y: -10,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 10,
    height: 10,
    displayOriginX: 5,
    displayOriginY: 5,
    texture: { key: 't' },
    frame: { name: '__BASE' },
  };
  const textures = { getPixelAlpha: (x: number, _y: number) => (x < 5 ? 255 : 0) };
  it('reads the texture under the world point and rejects outside the image', () => {
    const c = { x: 100, y: 100 };
    expect(opaqueAtImage(textures, c, img, 100 - 3, 100 - 10)).toBe(true);
    expect(opaqueAtImage(textures, c, img, 100 + 3, 100 - 10)).toBe(false);
    expect(opaqueAtImage(textures, c, img, 100 - 30, 100 - 10)).toBe(false);
  });
});
