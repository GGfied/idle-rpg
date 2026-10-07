import { describe, expect, it } from 'vitest';
import { VIEW_HIT_BOUNDS, hitBoundsFor, isoProjection } from '@render/index';
import { objectAtPoint } from './objectAtPoint';

const targets = [
  { tile: { x: 5, y: 5 }, kind: 'tree' as const, ref: 'back' },
  { tile: { x: 5, y: 6 }, kind: 'tree' as const, ref: 'front' },
  { tile: { x: 9, y: 9 }, kind: 'bank_booth' as const, ref: 'booth' },
];
const feetOf = (i: number) => isoProjection.tileToWorld(targets[i]!.tile.x, targets[i]!.tile.y);
const boundsOf = (i: number) => hitBoundsFor(targets[i]!.kind, feetOf(i));
const centreX = (i: number) => boundsOf(i).x + boundsOf(i).w / 2;

describe('objectAtPoint (iso, feet-anchored)', () => {
  it('canopy above the feet picks the tree', () => {
    const b = boundsOf(0);
    expect(b.y).toBeLessThan(feetOf(0).y - 20); // the canopy extends well above the feet
    expect(objectAtPoint(centreX(0), b.y + 1, [targets[0]!])).toBe('back');
  });
  it('the trunk (just above the feet) picks the tree', () => {
    expect(objectAtPoint(centreX(0), feetOf(0).y - 2, [targets[0]!])).toBe('back');
  });
  it('a click just below the feet still hits (HIT_BELOW_FEET), further below is ground', () => {
    const lone = [targets[0]!];
    const b = boundsOf(0);
    expect(objectAtPoint(centreX(0), feetOf(0).y + 1, lone)).toBe('back');
    expect(objectAtPoint(centreX(0), b.y + b.h + 1, lone)).toBeNull();
  });
  it('just above the canopy is ground', () => {
    expect(objectAtPoint(centreX(0), boundsOf(0).y - 1, [targets[0]!])).toBeNull();
  });
  it('plain ground and beside the drawing is null (walk)', () => {
    expect(objectAtPoint(0, 0, targets)).toBeNull();
    const b = boundsOf(0);
    expect(objectAtPoint(b.x + b.w + 1, feetOf(0).y - 5, [targets[0]!])).toBeNull();
  });
  it('overlap: the nearer tile (greater depthFor) wins', () => {
    // (5,6) is one tile nearer the camera than (5,5); its canopy covers back's feet area
    const y = feetOf(0).y;
    expect(objectAtPoint(feetOf(0).x, y, [targets[0]!])).toBe('back');
    const both = objectAtPoint(centreX(1), feetOf(1).y - 10, targets);
    expect(both).toBe('front');
    // order in the list must not matter
    expect(objectAtPoint(centreX(1), feetOf(1).y - 10, [...targets].reverse())).toBe('front');
  });
  it('a booth matches its own drawn bounds, not above them', () => {
    const b = boundsOf(2);
    expect(objectAtPoint(centreX(2), b.y - 1, targets)).toBeNull();
    expect(objectAtPoint(centreX(2), b.y + 1, targets)).toBe('booth');
    expect(VIEW_HIT_BOUNDS.bank_booth.up).toBeGreaterThan(0);
  });
});

describe('objectAtPoint with drawn-pixel check (the tree you see wins)', () => {
  // Circle canopies of radius 14 centred 30 px above each tree's feet.
  const circle =
    (r = 14, up = 30) =>
    (t: { tile: { x: number; y: number } }, x: number, y: number): boolean => {
      const f = isoProjection.tileToWorld(t.tile.x, t.tile.y);
      const inCanopy = Math.hypot(x - f.x, y - (f.y - up)) <= r;
      const inTrunk = Math.abs(x - f.x) <= 2 && y < f.y && y > f.y - up;
      return inCanopy || inTrunk;
    };
  const back = { tile: { x: 5, y: 5 }, kind: 'tree' as const, ref: 'back' };
  const front = { tile: { x: 6, y: 6 }, kind: 'tree' as const, ref: 'front' };
  const both = [back, front];
  const fb = isoProjection.tileToWorld(5, 5);
  const ff = isoProjection.tileToWorld(6, 6);

  it('tap on the front tree leaves picks the front tree', () => {
    expect(objectAtPoint(ff.x, ff.y - 30, both, circle())).toBe('front');
  });
  it('tap on a gap of the front canopy falls through to the tree behind', () => {
    // inside the front tree's rectangle, away from its leaves, but on the back tree's leaves
    const x = fb.x + 6;
    const y = fb.y - 20;
    expect(circle()(front, x, y)).toBe(false);
    expect(objectAtPoint(x, y, both, circle())).toBe('back');
    expect(objectAtPoint(x, y, both)).toBe('front'); // rect-only would steal it
  });
  it('tap on a gap of every canopy is ground (null)', () => {
    expect(objectAtPoint(fb.x + 16, fb.y - 20, [back], circle())).toBeNull();
  });
  it('trunk taps hit the tree, even slightly beside it (tolerance)', () => {
    expect(objectAtPoint(fb.x, fb.y - 10, [back], circle())).toBe('back');
    expect(objectAtPoint(fb.x + 3, fb.y - 10, [back], circle())).toBe('back');
    expect(objectAtPoint(fb.x + 8, fb.y - 10, [back], circle())).toBeNull();
  });
  it('taps at or below the feet are not pixel-tested', () => {
    expect(objectAtPoint(fb.x + 4, fb.y + 1, [back], () => false)).toBe('back');
  });
  it('unknown opacity (undefined: stump, figure) falls back to the bounds', () => {
    expect(objectAtPoint(fb.x + 4, fb.y - 10, [back], () => undefined)).toBe('back');
  });
});
