import { describe, expect, it } from 'vitest';
import { findDuplicates, neighbors, pointKey } from '@core/utils';
import { CHUNK_SIZE, NPC_SPAWNS, OBJECT_SPAWNS, PLAYER_SPAWN, namedLocations } from './data';
import { VILLAGE_ROWS } from './areas/village';
import { WORLD_DEF, areaAt, createWorldCollisionGrid, terrainAt } from './logic';
import { AREA_ZONES, WORLD_OBJECT_SPAWNS } from './data';

/** The village exactly as shipped before the big world (rows from git history, 2026-10-08). */
const ORIGINAL_ROWS = [
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#######GGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGG#########GGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGG###=#=###GGGGGG###.###GGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGf#=======#.GGfGGGGG.GGfGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG####.####.GGGGGGGG.GGGGGGs~~~~~',
  'GGGG...............................~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGfGGGGG.GGGfGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGfGfGGGG.GGGGfGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'sssssssssssssssssssssssssssssssssss~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

const grid = createWorldCollisionGrid();

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

describe('world chunks', () => {
  it('is 4x3 chunks of 32 tiles', () => {
    expect([WORLD_DEF.widthChunks, WORLD_DEF.heightChunks]).toEqual([4, 3]);
    expect([WORLD_DEF.widthTiles, WORLD_DEF.heightTiles]).toEqual([128, 96]);
  });

  it('chunk() returns full chunks inside and null outside', () => {
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const c = WORLD_DEF.chunk(cx, cy)!;
        expect([c.cx, c.cy]).toEqual([cx, cy]);
        expect(c.tiles).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
        expect(c.blocked).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
      }
    }
    for (const [cx, cy] of [
      [-1, 0],
      [0, -1],
      [4, 0],
      [0, 3],
      [1.5, 0],
    ] as const) {
      expect(WORLD_DEF.chunk(cx, cy)).toBeNull();
    }
    expect(WORLD_DEF.chunk(1, 1)).toBe(WORLD_DEF.chunk(1, 1));
  });

  it('chunk data agrees with collisionAt and terrainAt across borders', () => {
    for (let ty = 0; ty < WORLD_DEF.heightTiles; ty++) {
      for (let tx = 0; tx < WORLD_DEF.widthTiles; tx++) {
        const c = WORLD_DEF.chunk(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE))!;
        const i = (ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE);
        expect(c.blocked[i] === 1).toBe(WORLD_DEF.collisionAt(tx, ty));
        expect(c.tiles[i]).toBe(WORLD_DEF.terrainAt(tx, ty));
      }
    }
  });

  it('collisionAt blocks out of bounds and works either side of chunk borders', () => {
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [128, 0],
      [0, 96],
      [1.5, 2],
      [NaN, 0],
    ] as const) {
      expect(WORLD_DEF.collisionAt(x, y)).toBe(true);
    }
    // x=31|32 border on the forest-free village row 15, y=15 path; x=39/40 causeway into the forest road
    for (const x of [30, 31, 32, 33, 39, 40, 41]) expect(WORLD_DEF.collisionAt(x, 15)).toBe(false);
    expect(WORLD_DEF.collisionAt(66, 40)).toBe(false);
    expect(WORLD_DEF.collisionAt(128, 95)).toBe(true);
  });
});

describe('village is unchanged', () => {
  it('rows match the original except the documented causeway (row 15, x35..39)', () => {
    expect(VILLAGE_ROWS).toHaveLength(30);
    VILLAGE_ROWS.forEach((row, y) => {
      const expected = y === 15 ? ORIGINAL_ROWS[y]!.slice(0, 35) + 'b'.repeat(5) : ORIGINAL_ROWS[y];
      expect(row, `row ${y}`).toBe(expected);
    });
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        expect(terrainAt(x, y)).toBe(
          {
            G: 'grass',
            '.': 'path',
            '~': 'water',
            s: 'sand',
            '#': 'wall',
            f: 'flowers',
            '=': 'floor',
            b: 'bridge',
          }[VILLAGE_ROWS[y]![x]!],
        );
      }
    }
  });

  it('keeps the original spawns, objects, NPCs and spawn point', () => {
    const trees = WORLD_DEF.spawns.filter((s) => s.type === 'tree').slice(0, 16);
    expect(trees.map((s) => [s.id, s.ref, s.x, s.y])).toMatchSnapshot();
    expect(OBJECT_SPAWNS.map((o) => [o.objectId, o.x, o.y])).toEqual([
      ['bank_booth_1', 12, 9],
      ['bank_booth_2', 14, 9],
    ]);
    expect(NPC_SPAWNS.map((n) => [n.spawnId, n.npcId, n.x, n.y])).toEqual([
      ['banker_1', 'banker', 12, 8],
      ['banker_2', 'banker_f', 14, 8],
    ]);
    expect(PLAYER_SPAWN).toEqual({ x: 18, y: 15 });
    expect(namedLocations.bank!.tile).toEqual({ x: 12, y: 10 });
  });
});

describe('big world content', () => {
  const trees = WORLD_DEF.spawns.filter((s) => s.type === 'tree');

  it('has unique spawn ids and tiles', () => {
    expect(findDuplicates(WORLD_DEF.spawns.map((s) => s.id))).toEqual([]);
    const solid = WORLD_DEF.spawns.filter((s) => s.type !== 'npc').map(pointKey);
    expect(new Set(solid).size).toBe(solid.length);
  });

  it('spawn refs are real owning-module ids', () => {
    for (const s of trees) expect(['tree', 'oak_tree']).toContain(s.ref);
    for (const s of WORLD_DEF.spawns.filter((x) => x.type === 'object')) {
      expect(['bank_booth', 'bank_chest', 'deposit_chest']).toContain(s.ref);
    }
    for (const s of WORLD_DEF.spawns.filter((x) => x.type === 'npc'))
      expect(['banker', 'banker_f']).toContain(s.ref);
    expect(trees.filter((s) => s.ref === 'tree').length).toBeGreaterThan(100);
    expect(trees.filter((s) => s.ref === 'oak_tree').length).toBeGreaterThan(30);
  });

  it('every spawn is on open terrain and non-NPC spawns block', () => {
    for (const s of WORLD_DEF.spawns) {
      const k = WORLD_DEF.terrainAt(s.x, s.y);
      expect(k, s.id).toBeDefined();
      expect(['water', 'wall']).not.toContain(k);
      expect(WORLD_DEF.collisionAt(s.x, s.y)).toBe(s.type !== 'npc');
    }
  });

  it('every tree and object has a neighbour reachable from the spawn point', () => {
    for (const s of WORLD_DEF.spawns.filter((x) => x.type !== 'npc')) {
      expect(
        neighbors(s).some((n) => reach.has(pointKey(n))),
        s.id,
      ).toBe(true);
    }
  });

  it('every location is walkable and reachable from the spawn point', () => {
    for (const [id, loc] of Object.entries(namedLocations)) {
      expect(reach.has(pointKey(loc.tile)), id).toBe(true);
    }
  });

  it('every area has a reachable tile and every non-bank-staff NPC tile is enclosed', () => {
    for (const z of AREA_ZONES) {
      let found = false;
      for (let y = z.y0; y <= z.y1 && !found; y++)
        for (let x = z.x0; x <= z.x1 && !found; x++)
          if (reach.has(`${x},${y}`) && areaAt(x, y).id === z.id) found = true;
      expect(found, z.id).toBe(true);
    }
  });

  it('fernhaven has a bank with two booths and two bankers', () => {
    const near = (s: { x: number; y: number }) => s.x >= 90 && s.x <= 98 && s.y >= 60 && s.y <= 67;
    const objs = WORLD_DEF.spawns.filter((s) => s.type === 'object' && near(s));
    const npcs = WORLD_DEF.spawns.filter((s) => s.type === 'npc' && near(s));
    expect(objs).toHaveLength(2);
    expect(npcs).toHaveLength(2);
    for (const o of objs) {
      expect(neighbors(o).some((n) => reach.has(pointKey(n)))).toBe(true);
    }
    for (const n of npcs) expect(reach.has(pointKey(n))).toBe(false);
  });

  it('areas exist for the forest, lake, shore and second village', () => {
    expect(areaAt(48, 15).id).toBe('whispering_wood');
    expect(areaAt(70, 10).id).toBe('oak_ridge');
    expect(areaAt(30, 40).id).toBe('greatmere');
    expect(areaAt(30, 53).id).toBe('greatmere_shore');
    expect(areaAt(102, 69).id).toBe('fernhaven');
    expect(areaAt(94, 62).id).toBe('fernhaven_bank');
  });
});

describe('shore booth and wood deposit chest', () => {
  const placed = [
    { id: 'bank_booth_5', kind: 'bank_booth', x: 72, y: 52 },
    { id: 'deposit_chest_1', kind: 'deposit_chest', x: 48, y: 14 },
  ] as const;
  const grid = createWorldCollisionGrid();
  const { x: sx, y: sy } = PLAYER_SPAWN;
  const reach = new Set<string>([`${sx},${sy}`]);
  const queue: [number, number][] = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = `${x + dx},${y + dy}`;
      if (!reach.has(k) && grid.isWalkable(x + dx, y + dy)) {
        reach.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
  }

  for (const p of placed) {
    it(`${p.id} exists, blocks, and has a reachable 4-neighbour`, () => {
      const o = WORLD_OBJECT_SPAWNS.find((s) => s.objectId === p.id);
      expect(o).toMatchObject({ kind: p.kind, x: p.x, y: p.y });
      expect(['bank_booth', 'deposit_chest']).toContain(o!.kind);
      expect(grid.isWalkable(p.x, p.y)).toBe(false);
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => reach.has(`${p.x + dx!},${p.y + dy!}`));
      expect(near.length).toBeGreaterThan(0);
    });
  }
});
