import { describe, expect, it } from 'vitest';
import {
  FISH_SHADOW,
  LEAP_FRAMES,
  LEAP_START,
  SPOT_CY,
  SPOT_FRAMES,
  SPOT_TEX_W,
  paintSpotPixels,
} from './spotArt';

const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;
// representative lake water (blue) and white churn, from the live screenshots
const WATER = lum(60, 140, 190);
const FOAM = lum(240, 250, 252);

/** Count opaque pixels exactly the fish-shadow colour (rows optionally limited). */
function shadowPx(d: Uint8ClampedArray, maxRow = 1e9): number {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const row = Math.floor(i / 4 / SPOT_TEX_W);
    if (
      row <= maxRow &&
      d[i + 3]! >= 200 &&
      d[i] === FISH_SHADOW[0] &&
      d[i + 1] === FISH_SHADOW[1] &&
      d[i + 2] === FISH_SHADOW[2]
    )
      n++;
  }
  return n;
}
/** Opaque body pixels (grey-silver, not foam white) above the water line = a fish in the air. */
function airPx(d: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const row = Math.floor(i / 4 / SPOT_TEX_W);
    if (row < SPOT_CY - 4 && d[i + 3]! >= 250 && d[i]! < 200 && d[i]! > 100) n++;
  }
  return n;
}

describe('fishing spot fish', () => {
  it('shadow colour contrasts with both water and churn', () => {
    const l = lum(...FISH_SHADOW);
    expect(WATER - l).toBeGreaterThan(70);
    expect(FOAM - l).toBeGreaterThan(150);
  });
  it('every net frame shows a readable school (>= 90 shadow px), every bait frame a shadow fish (>= 25)', () => {
    for (let f = 0; f < SPOT_FRAMES; f++) {
      expect(shadowPx(paintSpotPixels('net_spot', f))).toBeGreaterThanOrEqual(90);
      expect(shadowPx(paintSpotPixels('bait_spot', f))).toBeGreaterThanOrEqual(25);
    }
  });
  it('bait fish is in the air only during the jump frames; net fish never jump', () => {
    for (let f = 0; f < SPOT_FRAMES; f++) {
      const inJump = f >= LEAP_START && f < LEAP_START + LEAP_FRAMES;
      const air = airPx(paintSpotPixels('bait_spot', f));
      if (inJump) expect(air).toBeGreaterThanOrEqual(8);
      else expect(air).toBe(0);
      expect(airPx(paintSpotPixels('net_spot', f))).toBe(0);
    }
  });
});
