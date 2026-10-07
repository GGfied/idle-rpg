import { describe, expect, it } from 'vitest';
import type { CollisionGrid } from '@core/contracts';
import { seededRng, makeCtx } from '@test-utils/index';
import {
  createMovementState,
  findPath,
  findPathToNearest,
  planPath,
  setDestination,
  tickMovement,
} from './index';

const t = (x: number, y: number) => ({ x, y });
const W = 128;
const H = 96;

/** A 128x96 world from a blocked(x,y) predicate, shaped like map's collisionAt (OOB = blocked). */
const world = (blocked: (x: number, y: number) => boolean): CollisionGrid => ({
  width: W,
  height: H,
  isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && !blocked(x, y),
});

describe('big world paths', () => {
  const open = world(() => false);
  // Wall on the x=32 chunk border from y=0..H-2, gap at the very bottom row.
  const border = world((x, y) => x === 32 && y < H - 1);
  // Island: the tile (100,50) is fully enclosed.
  const island = world(
    (x, y) => Math.max(Math.abs(x - 100), Math.abs(y - 50)) === 1 && !(x === 100 && y === 50),
  );

  it('walks a straight line across a chunk border', () => {
    const p = findPath(open, t(28, 10), t(40, 10)) as ReturnType<typeof findPath> & object;
    expect(p).toHaveLength(12);
    expect(p[3]).toEqual(t(32, 10));
    expect(p.at(-1)).toEqual(t(40, 10));
  });

  it('goes around a wall that spans a chunk border via the gap', () => {
    const p = findPath(border, t(30, 5), t(34, 5)) as ReturnType<typeof findPath> & object;
    expect(p.at(-1)).toEqual(t(34, 5));
    expect(p.some((s) => s.x === 32 && s.y === H - 1)).toBe(true);
    for (const s of p) expect(border.isWalkable(s.x, s.y)).toBe(true);
  });

  it.each([
    ['enclosed tile', island, t(100, 50), 'adjacent ring'],
    ['out of bounds', open, t(200, 10), 'edge'],
  ])('unreachable target (%s) -> nearest reachable tile', (_n, grid, target, _why) => {
    const p = findPathToNearest(grid, t(90, 50), target);
    const end = p.at(-1) as { x: number; y: number };
    expect(p.length).toBeGreaterThan(0);
    expect(grid.isWalkable(end.x, end.y)).toBe(true);
    expect(Math.max(Math.abs(end.x - target.x), Math.abs(end.y - target.y))).toBeLessThanOrEqual(
      Math.max(Math.abs(90 - target.x), Math.abs(50 - target.y)),
    );
  });

  it('enclosed target ends on the nearest tile outside the wall ring', () => {
    const p = findPathToNearest(island, t(90, 50), t(100, 50));
    expect(p.at(-1)).toEqual(t(98, 50));
  });

  it('cap hit gives a partial waypoint path, then re-pathing completes the walk', () => {
    const from = t(2, 2);
    const to = t(120, 90);
    const full = planPath(open, from, to);
    expect(full.partial).toBe(false);
    const capped = planPath(open, from, to, { maxNodes: 40 });
    expect(capped.partial).toBe(true);
    expect(capped.path.length).toBeGreaterThan(0);
    expect(capped.path.length).toBeLessThan(full.path.length);
    expect(capped.expanded).toBeLessThanOrEqual(40);
  });

  it('default cap on a huge detour: partial leg, then tick re-paths until arrival', () => {
    const trap = world((x, y) => x === 70 && y < H - 2);
    let s = setDestination(createMovementState(t(5, 5)), trap, t(120, 5));
    expect(s.destination).toEqual(t(120, 5)); // search blew the 4000 cap
    expect(s.path.length).toBeGreaterThan(0);
    let rePathed = false;
    for (let i = 0; i < 1000 && !(s.position.x === 120 && s.position.y === 5); i++) {
      const before = s.destination;
      s = tickMovement(s, makeCtx(i), trap).state;
      if (before && s.destination && s.path.length > 1) rePathed = true;
    }
    expect(s.position).toEqual(t(120, 5));
    expect(s.destination).toBeUndefined();
    expect(rePathed).toBe(true);
  });

  it('long walk with a tiny cap is re-pathed by tickMovement until it arrives', () => {
    // Patch the cap through a grid wrapper is not possible, so drive planPath legs by hand.
    let pos = t(2, 2);
    const to = t(120, 90);
    let legs = 0;
    while (!(pos.x === to.x && pos.y === to.y) && legs < 50) {
      const leg = planPath(open, pos, to, { maxNodes: 300 });
      expect(leg.path.length).toBeGreaterThan(0);
      pos = leg.path.at(-1) as { x: number; y: number };
      legs++;
    }
    expect(pos).toEqual(to);
    expect(legs).toBeGreaterThan(1);
  });

  it('allocates nothing world-sized: expansions stay bounded for 100 random paths', () => {
    const rng = seededRng(7);
    // Scattered obstacles (~15%) plus long walls with gaps, no allocation of a width*height array.
    const obstacle = (x: number, y: number): boolean =>
      ((x * 73856093) ^ (y * 19349663)) % 100 < 15 ||
      (x % 32 === 16 && y % 24 !== 5 && y % 24 !== 17);
    const grid = world(obstacle);
    let total = 0;
    let max = 0;
    let done = 0;
    while (done < 100) {
      const a = t(rng.int(0, W - 1), rng.int(0, H - 1));
      const b = t(rng.int(0, W - 1), rng.int(0, H - 1));
      if (!grid.isWalkable(a.x, a.y) || !grid.isWalkable(b.x, b.y)) continue;
      const r = planPath(grid, a, b);
      expect(r.expanded).toBeLessThanOrEqual(4000);
      total += r.expanded;
      max = Math.max(max, r.expanded);
      done++;
    }
    expect(max).toBeLessThanOrEqual(4000);
    expect(total / 100).toBeLessThan(2500);
  });
});
