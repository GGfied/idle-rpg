import { describe, expect, it } from 'vitest';
import { findDuplicates, neighbors, pointKey } from '@core/utils';
import { PLAYER_SPAWN, QUARRY_ROCKS, FISHING_SPOTS, namedLocations } from './data';
import { WORLD_DEF, WORLD_ROCKS, areaAt, createWorldCollisionGrid } from './logic';

/** Mining's node ids. features cannot import each other: app/worldRefs.test.ts checks them against MINING_NODES. */
const MINING_DEF_IDS = ['copper_rock', 'tin_rock', 'iron_rock', 'coal_rock'];

describe('Stonefold Quarry', () => {
  it('places 4 copper, 4 tin, 3 iron and 3 coal rocks with unique ids and known defs', () => {
    const count = (d: string) => WORLD_ROCKS.filter((r) => r.defId === d).length;
    expect([
      count('copper_rock'),
      count('tin_rock'),
      count('iron_rock'),
      count('coal_rock'),
    ]).toEqual([4, 4, 3, 3]);
    expect(WORLD_ROCKS).toEqual(QUARRY_ROCKS);
    for (const r of WORLD_ROCKS) expect(MINING_DEF_IDS).toContain(r.defId);
    const ids = WORLD_DEF.spawns.map((s) => s.id);
    expect(findDuplicates(ids)).toEqual([]);
  });

  it('rocks block movement and sit on grass, off every other spawn', () => {
    const grid = createWorldCollisionGrid();
    for (const r of WORLD_ROCKS) {
      expect(grid.isWalkable(r.x, r.y), r.nodeId).toBe(false);
      expect(WORLD_DEF.terrainAt(r.x, r.y), r.nodeId).toBe('grass');
      const same = WORLD_DEF.spawns.filter((s) => s.x === r.x && s.y === r.y);
      expect(
        same.map((s) => s.id),
        r.nodeId,
      ).toEqual([r.nodeId]);
    }
  });

  it('every rock has a walkable 4-neighbour reachable from the player spawn', () => {
    const grid = createWorldCollisionGrid();
    const seen = new Set<string>([pointKey(PLAYER_SPAWN)]);
    const queue = [PLAYER_SPAWN];
    while (queue.length) {
      const t = queue.pop()!;
      for (const n of neighbors(t)) {
        if (!grid.isWalkable(n.x, n.y) || seen.has(pointKey(n))) continue;
        seen.add(pointKey(n));
        queue.push(n);
      }
    }
    for (const r of WORLD_ROCKS) {
      const open = neighbors(r).filter((n) => seen.has(pointKey(n)));
      expect(open.length, r.nodeId).toBeGreaterThan(0);
    }
    const loc = namedLocations.stonefold_quarry!.tile;
    expect(seen.has(pointKey(loc))).toBe(true);
  });

  it('is a named area covering every rock and the location', () => {
    for (const r of WORLD_ROCKS) expect(areaAt(r.x, r.y).id, r.nodeId).toBe('stonefold_quarry');
    const loc = namedLocations.stonefold_quarry!.tile;
    expect(areaAt(loc.x, loc.y)).toEqual({
      id: 'stonefold_quarry',
      kind: 'default',
      name: 'Stonefold Quarry',
    });
    expect(areaAt(69, 41).id).toBe('stonefold_quarry');
    expect(areaAt(79, 46).id).toBe('stonefold_quarry');
    expect(areaAt(68, 43).id).toBe('greatmere_east');
    expect(areaAt(72, 40).id).toBe('greatmere_east');
    expect(areaAt(72, 47).id).toBe('greatmere_east');
  });

  it('is within 16 walking tiles (Manhattan) of the Greatmere Bank booth', () => {
    for (const r of WORLD_ROCKS)
      expect(Math.abs(r.x - 72) + Math.abs(r.y - 52), r.nodeId).toBeLessThanOrEqual(16);
  });
});

describe('Greatmere shore fishing spots', () => {
  const grid = createWorldCollisionGrid();
  const reach = new Set<string>([pointKey(PLAYER_SPAWN)]);
  const queue = [PLAYER_SPAWN];
  while (queue.length) {
    const t = queue.pop()!;
    for (const n of neighbors(t)) {
      if (!grid.isWalkable(n.x, n.y) || reach.has(pointKey(n))) continue;
      reach.add(pointKey(n));
      queue.push(n);
    }
  }

  it('has 2 net and 2 bait spots with unique ids and fishing def ids', () => {
    expect(FISHING_SPOTS.filter((s) => s.defId === 'net_spot')).toHaveLength(2);
    expect(FISHING_SPOTS.filter((s) => s.defId === 'bait_spot')).toHaveLength(2);
    expect(findDuplicates(FISHING_SPOTS.map((s) => s.spotId))).toEqual([]);
    const all = FISHING_SPOTS.flatMap((s) => s.tiles.map(pointKey));
    expect(findDuplicates(all)).toEqual([]);
  });

  it('every candidate is Greatmere water with a reachable walkable shore neighbour', () => {
    for (const s of FISHING_SPOTS) {
      expect(s.tiles.length, s.spotId).toBeGreaterThanOrEqual(3);
      for (const t of s.tiles) {
        const id = `${s.spotId}@${t.x},${t.y}`;
        expect(WORLD_DEF.terrainAt(t.x, t.y), id).toBe('water');
        expect(areaAt(t.x, t.y).id, id).toBe('greatmere');
        expect(
          WORLD_DEF.spawns.some((p) => p.x === t.x && p.y === t.y),
          id,
        ).toBe(false);
        const shore = neighbors(t).filter((n) => reach.has(pointKey(n)));
        expect(shore.length, id).toBeGreaterThan(0);
      }
    }
  });
});
