import { describe, expect, it } from 'vitest';
import { findDuplicates } from '@core/utils';
import { AREA_ZONES, DEFAULT_AREA, PLAYER_SPAWN, namedLocations } from './data';
import { WORLD_DEF, areaAt } from './logic';

describe('areas', () => {
  it('maps every tile to exactly one valid area', () => {
    const ids = new Set([DEFAULT_AREA.id, ...AREA_ZONES.map((z) => z.id)]);
    for (let y = 0; y < WORLD_DEF.heightTiles; y++) {
      for (let x = 0; x < WORLD_DEF.widthTiles; x++) {
        const a = areaAt(x, y);
        expect(ids.has(a.id)).toBe(true);
        expect(areaAt(x, y)).toEqual(a);
      }
    }
  });

  it('spawn and hut are village', () => {
    expect(areaAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y).kind).toBe('village');
    const hut = namedLocations.hut_door!.tile;
    expect(areaAt(hut.x, hut.y).kind).toBe('village');
  });

  it('every named area has at least one tile it actually wins', () => {
    for (const z of AREA_ZONES) {
      let n = 0;
      for (let y = 0; y < WORLD_DEF.heightTiles; y++)
        for (let x = 0; x < WORLD_DEF.widthTiles; x++) if (areaAt(x, y).id === z.id) n++;
      expect(n, z.id).toBeGreaterThan(0);
    }
  });

  it('has unique ids, in-bounds zones, and kinds for lake/shore/forest', () => {
    expect(findDuplicates([DEFAULT_AREA.id, ...AREA_ZONES.map((z) => z.id)])).toEqual([]);
    for (const z of AREA_ZONES) {
      expect(z.x0 <= z.x1 && z.y0 <= z.y1).toBe(true);
      expect(z.x0).toBeGreaterThanOrEqual(0);
      expect(z.x1).toBeLessThan(WORLD_DEF.widthTiles);
      expect(z.y1).toBeLessThan(WORLD_DEF.heightTiles);
    }
    const kinds = AREA_ZONES.map((z) => z.kind);
    for (const k of ['village', 'forest', 'lake', 'shore'] as const) expect(kinds).toContain(k);
    expect(areaAt(34, 15).kind).toBe('lake');
    expect(areaAt(10, 27).kind).toBe('shore');
    expect(areaAt(0, 0).kind).toBe('default');
  });
});
