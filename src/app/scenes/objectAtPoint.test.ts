import { describe, expect, it } from 'vitest';
import { TILE_SIZE, VIEW_HIT_BOUNDS, hitBoundsFor, tileToWorld } from '@render/index';
import { objectAtPoint } from './objectAtPoint';

const targets = [
  { tile: { x: 5, y: 5 }, kind: 'tree' as const, ref: 'back' },
  { tile: { x: 5, y: 6 }, kind: 'tree' as const, ref: 'front' },
  { tile: { x: 9, y: 9 }, kind: 'bank_booth' as const, ref: 'booth' },
];
const boundsOf = (i: number) => {
  const t = targets[i]!;
  return hitBoundsFor(t.kind, tileToWorld(t.tile));
};
const centreX = (i: number) => boundsOf(i).x + boundsOf(i).w / 2;

describe('objectAtPoint', () => {
  it('canopy above the tile top picks the tree', () => {
    const b = boundsOf(0);
    const tileTop = 5 * TILE_SIZE;
    expect(b.y).toBeLessThan(tileTop); // the canopy extends above the tile
    expect(objectAtPoint(centreX(0), b.y + 1, targets)).toBe('back');
    expect(objectAtPoint(centreX(0), tileTop - 1, targets)).toBe('back');
  });
  it('just above the canopy is ground', () => {
    expect(objectAtPoint(centreX(0), boundsOf(0).y - 1, targets)).toBeNull();
  });
  it('the trunk tile still picks the tree', () => {
    const lone = [targets[0]!];
    expect(objectAtPoint(centreX(0), 6 * TILE_SIZE - 1, lone)).toBe('back');
  });
  it('plain ground and beside the drawing is null (walk)', () => {
    expect(objectAtPoint(TILE_SIZE, TILE_SIZE, targets)).toBeNull();
    const b = boundsOf(0);
    expect(objectAtPoint(b.x + b.w + 1, 5 * TILE_SIZE + 10, targets)).toBeNull();
  });
  it('overlapping canopies: the tree in front (greater y) wins', () => {
    const front = boundsOf(1);
    // inside back's tile and front's canopy
    const y = front.y + 1;
    expect(y).toBeLessThan(6 * TILE_SIZE);
    expect(y).toBeGreaterThanOrEqual(5 * TILE_SIZE);
    expect(objectAtPoint(centreX(1), y, targets)).toBe('front');
  });
  it('a booth matches its own drawn bounds, not above them', () => {
    const b = boundsOf(2);
    expect(objectAtPoint(centreX(2), b.y - 1, targets)).toBeNull();
    expect(objectAtPoint(centreX(2), b.y + 1, targets)).toBe('booth');
    expect(VIEW_HIT_BOUNDS.bank_booth.up).toBeLessThanOrEqual(TILE_SIZE);
  });
});
