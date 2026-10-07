import { describe, expect, it } from 'vitest';
import { findDuplicates, neighbors, pointKey } from '@core/utils';
import {
  MAP_ROWS,
  OBJECT_SPAWNS,
  PLAYER_SPAWN,
  TERRAIN_LEGEND,
  TREE_SPAWNS,
  WORLD,
  namedLocations,
} from './data';
import { createCollisionGrid, terrainAt } from './logic';

const open = (x: number, y: number) => {
  const k = terrainAt(x, y);
  return k !== undefined && k !== 'water' && k !== 'wall';
};

describe('world data', () => {
  it('has rows matching WORLD size and only legend chars', () => {
    expect(MAP_ROWS).toHaveLength(WORLD.height);
    for (const row of MAP_ROWS) {
      expect(row).toHaveLength(WORLD.width);
      for (const ch of row) expect(TERRAIN_LEGEND[ch]).toBeDefined();
    }
  });

  it('spawn is a walkable path tile', () => {
    expect(terrainAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe('path');
    expect(createCollisionGrid().isWalkable(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(true);
  });

  it('has unique node ids and valid def ids', () => {
    expect(findDuplicates(TREE_SPAWNS.map((s) => s.nodeId))).toEqual([]);
    for (const s of TREE_SPAWNS) expect(['tree', 'oak_tree']).toContain(s.defId);
    expect(TREE_SPAWNS.filter((s) => s.defId === 'tree').length).toBeGreaterThanOrEqual(12);
    expect(TREE_SPAWNS.filter((s) => s.defId === 'oak_tree').length).toBeGreaterThanOrEqual(4);
  });

  it('trees stand on walkable terrain, block, and have a walkable neighbour', () => {
    const grid = createCollisionGrid();
    const keys = TREE_SPAWNS.map(pointKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of TREE_SPAWNS) {
      expect(open(s.x, s.y)).toBe(true);
      expect(grid.isWalkable(s.x, s.y)).toBe(false);
      expect(neighbors(s).some((n) => grid.isWalkable(n.x, n.y))).toBe(true);
    }
  });

  it('every tree is reachable from spawn', () => {
    const grid = createCollisionGrid();
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
    for (const s of TREE_SPAWNS) {
      expect(neighbors(s).some((n) => seen.has(pointKey(n)))).toBe(true);
    }
  });

  it('treats out of bounds as blocked and extra blockers as blocked', () => {
    const grid = createCollisionGrid([{ x: 1, y: 1 }]);
    expect(grid.isWalkable(-1, 0)).toBe(false);
    expect(grid.isWalkable(WORLD.width, 0)).toBe(false);
    expect(grid.isWalkable(1, 1)).toBe(false);
    expect(terrainAt(-1, 0)).toBeUndefined();
  });

  it('blocks water and walls, and the hut door gap is open', () => {
    const grid = createCollisionGrid();
    expect(grid.isWalkable(39, 0)).toBe(false);
    expect(grid.isWalkable(24, 4)).toBe(false);
    expect(grid.isWalkable(27, 8)).toBe(true);
  });

  it('named locations are walkable', () => {
    const grid = createCollisionGrid();
    for (const [id, loc] of Object.entries(namedLocations)) {
      expect(loc.id).toBe(id);
      expect(grid.isWalkable(loc.tile.x, loc.tile.y)).toBe(true);
    }
  });

  describe('object spawns', () => {
    const reachable = () => {
      const grid = createCollisionGrid();
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
    };

    it('has unique objectIds and two bank booths', () => {
      expect(findDuplicates(OBJECT_SPAWNS.map((o) => o.objectId))).toEqual([]);
      expect(OBJECT_SPAWNS.filter((o) => o.kind === 'bank_booth')).toHaveLength(2);
    });

    it('objects sit on open terrain, block, and do not overlap trees or spawn', () => {
      const grid = createCollisionGrid();
      const taken = new Set([...TREE_SPAWNS.map(pointKey), pointKey(PLAYER_SPAWN)]);
      for (const o of OBJECT_SPAWNS) {
        expect(open(o.x, o.y)).toBe(true);
        expect(['grass', 'flowers', 'floor']).toContain(terrainAt(o.x, o.y));
        expect(grid.isWalkable(o.x, o.y)).toBe(false);
        expect(taken.has(pointKey(o))).toBe(false);
      }
      const keys = OBJECT_SPAWNS.map(pointKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('every object has a neighbour reachable from spawn', () => {
      const seen = reachable();
      for (const o of OBJECT_SPAWNS) {
        expect(neighbors(o).some((n) => seen.has(pointKey(n)))).toBe(true);
      }
    });
  });
});
