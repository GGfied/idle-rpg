import { describe, expect, it } from 'vitest';
import { findDuplicates, neighbors, pointKey } from '@core/utils';
import {
  AREA_ZONES,
  NPC_SPAWNS,
  OBJECT_SPAWNS,
  PLAYER_SPAWN,
  TREE_SPAWNS,
  WORLD,
  namedLocations,
} from './data';
import { areaAt, createCollisionGrid, terrainAt } from './logic';

const grid = createCollisionGrid();
const booths = OBJECT_SPAWNS.filter((o) => o.kind === 'bank_booth');

/** Tiles the player can reach from spawn. */
function flood(): Set<string> {
  const seen = new Set([pointKey(PLAYER_SPAWN)]);
  const queue = [PLAYER_SPAWN];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      if (grid.isWalkable(n.x, n.y) && !seen.has(pointKey(n))) {
        seen.add(pointKey(n));
        queue.push(n);
      }
    }
  }
  return seen;
}

const reach = flood();
const bankZone = AREA_ZONES.find((z) => z.id === 'willowbrook_bank')!;
const inZone = (x: number, y: number) =>
  x >= bankZone.x0 && x <= bankZone.x1 && y >= bankZone.y0 && y <= bankZone.y1;

describe('Willowbrook Bank', () => {
  it('floor is walkable terrain', () => {
    expect(terrainAt(11, 11)).toBe('floor');
    expect(grid.isWalkable(11, 11)).toBe(true);
  });

  it('has a village zone named Willowbrook Bank', () => {
    expect(bankZone.kind).toBe('village');
    expect(bankZone.name).toBe('Willowbrook Bank');
    expect(areaAt(12, 10).id).toBe('willowbrook_bank');
  });

  it('flood fill from spawn reaches the inside through the door', () => {
    for (let y = bankZone.y0 + 1; y <= bankZone.y1; y++) {
      for (let x = bankZone.x0; x <= bankZone.x1; x++) {
        expect(terrainAt(x, y)).toBe('floor');
        // Booth tiles block; every other interior tile is reachable.
        if (grid.isWalkable(x, y)) expect(reach.has(pointKey({ x, y })), `${x},${y}`).toBe(true);
      }
    }
    // Door gap at the south wall is walkable and opens onto the main path.
    expect(grid.isWalkable(13, 14)).toBe(true);
    expect(terrainAt(13, 15)).toBe('path');
  });

  it('is enclosed except the door', () => {
    // Every walkable tile reachable from inside that lies outside the building rect must be the door.
    const exits = new Set<string>();
    for (let y = bankZone.y0 + 1; y <= bankZone.y1; y++)
      for (let x = bankZone.x0; x <= bankZone.x1; x++)
        for (const n of neighbors({ x, y }))
          if (!inZone(n.x, n.y) && grid.isWalkable(n.x, n.y)) exits.add(pointKey(n));
    expect([...exits]).toEqual([pointKey({ x: 13, y: 14 })]);
    // Outer wall ring is solid except the door.
    for (let y = 7; y <= 14; y++)
      for (let x = 9; x <= 17; x++)
        if (y === 7 || y === 14 || x === 9 || x === 17)
          expect(grid.isWalkable(x, y), `${x},${y}`).toBe(x === 13 && y === 14);
  });

  it('has two blocking booths on floor, not overlapping trees or spawn', () => {
    expect(booths.map((b) => b.objectId)).toEqual(['bank_booth_1', 'bank_booth_2']);
    const taken = new Set([...TREE_SPAWNS.map(pointKey), pointKey(PLAYER_SPAWN)]);
    for (const b of booths) {
      expect(terrainAt(b.x, b.y)).toBe('floor');
      expect(grid.isWalkable(b.x, b.y)).toBe(false);
      expect(taken.has(pointKey(b))).toBe(false);
    }
  });

  it('each booth has a reachable customer tile', () => {
    for (const b of booths) {
      expect(neighbors(b).some((n) => reach.has(pointKey(n)))).toBe(true);
    }
  });

  it('bankers: unique spawn ids, unreachable, adjacent to their booth, not wandering', () => {
    expect(NPC_SPAWNS.map((n) => n.spawnId)).toEqual(['banker_1', 'banker_2']);
    expect(findDuplicates(NPC_SPAWNS.map((n) => n.spawnId))).toEqual([]);
    NPC_SPAWNS.forEach((n, i) => {
      expect(n.npcId).toBe('banker');
      expect(n.wanderRadius).toBe(0);
      expect(grid.isWalkable(n.x, n.y)).toBe(true);
      expect(reach.has(pointKey(n))).toBe(false);
      expect(neighbors(n).some((m) => pointKey(m) === pointKey(booths[i]!))).toBe(true);
      // No overlap with objects or trees.
      expect([...OBJECT_SPAWNS, ...TREE_SPAWNS].some((o) => pointKey(o) === pointKey(n))).toBe(
        false,
      );
    });
  });

  it('bank location is the customer tile in front of booth 1', () => {
    const { tile } = namedLocations.bank!;
    expect(reach.has(pointKey(tile))).toBe(true);
    expect(tile).toEqual({ x: booths[0]!.x, y: booths[0]!.y + 1 });
    expect(namedLocations.bank!.name).toBe('Willowbrook Bank');
  });

  it('stays inside the world', () => {
    expect(bankZone.x1).toBeLessThan(WORLD.width);
  });
});
