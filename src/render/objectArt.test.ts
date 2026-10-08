import { describe, expect, it } from 'vitest';
import { OBJECT_ART } from './objectArt';
import { ART_SCALE, OBJECT_FOOTPRINTS, VIEW_HIT_BOUNDS } from './views';
import type { ObjectKind } from './views';

const KINDS = Object.keys(OBJECT_ART) as ObjectKind[];

function topOf(kind: ObjectKind): number {
  return Math.min(...OBJECT_ART[kind].rects.map((r) => r.y));
}

describe('object art', () => {
  it('has art, a footprint and hit bounds for every ObjectKind', () => {
    expect(KINDS.sort()).toEqual(['bank_booth', 'bank_chest', 'deposit_chest']);
    for (const k of KINDS) {
      expect(OBJECT_ART[k].rects.length).toBeGreaterThan(3);
      expect(OBJECT_FOOTPRINTS[k]).toEqual({ w: 1, h: 1, blocking: true });
      expect(VIEW_HIT_BOUNDS[k].up).toBeGreaterThan(0);
    }
  });

  it('the drawing reaches exactly the hit-bound top and stays inside the half width', () => {
    for (const k of KINDS) {
      expect(-topOf(k) * ART_SCALE).toBe(VIEW_HIT_BOUNDS[k].up);
      expect(VIEW_HIT_BOUNDS[k].radius).toBe(OBJECT_ART[k].halfW * ART_SCALE);
      for (const r of OBJECT_ART[k].rects) {
        expect(r.x).toBeGreaterThanOrEqual(-OBJECT_ART[k].halfW);
        expect(r.x + r.w).toBeLessThanOrEqual(OBJECT_ART[k].halfW);
        expect(r.y + r.h).toBeLessThanOrEqual(0); // nothing below the feet
      }
    }
  });

  it('the deposit chest is a different, darker drawing than the bank chest, with a coin slot', () => {
    const lum = (c: number): number => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    const body = (k: ObjectKind): number => OBJECT_ART[k].rects[0]!.color;
    expect(OBJECT_ART.deposit_chest.rects).not.toEqual(OBJECT_ART.bank_chest.rects);
    expect(lum(body('deposit_chest'))).toBeLessThan(lum(body('bank_chest')));
    // slot: a near-black thin rect on the lid
    const slot = OBJECT_ART.deposit_chest.rects.find((r) => r.color === 0x120a04);
    expect(slot).toBeDefined();
    expect(slot!.h).toBe(1);
    expect(slot!.y).toBeLessThan(-16); // on the lid, not the body
    // no keyhole / lock plate like the bank chest's
    expect(OBJECT_ART.deposit_chest.rects.some((r) => r.color === 0x3a2412)).toBe(false);
  });
});
