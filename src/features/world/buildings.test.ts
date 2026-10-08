import { describe, expect, it } from 'vitest';
import { findDuplicates } from '@core/utils';
import { WORLD_DEF, buildingAt } from './index';

const { buildings, labels } = WORLD_DEF;
const onEdge = (b: (typeof buildings)[number], x: number, y: number) => {
  const r = b.rect;
  const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  return inside && (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1);
};

describe('buildings', () => {
  it('has unique ids', () => {
    expect(findDuplicates(buildings.map((b) => b.id))).toEqual([]);
  });

  it('keeps every door on its rect edge, on a walkable tile', () => {
    for (const b of buildings) {
      expect(b.doors.length).toBeGreaterThan(0);
      for (const d of b.doors) {
        expect(onEdge(b, d.x, d.y)).toBe(true);
        expect(WORLD_DEF.collisionAt(d.x, d.y)).toBe(false);
      }
    }
  });

  it('matches the wall tiles: edges are wall except doors, no walls just outside', () => {
    for (const b of buildings) {
      for (let y = b.rect.y; y < b.rect.y + b.rect.h; y++)
        for (let x = b.rect.x; x < b.rect.x + b.rect.w; x++) {
          if (!onEdge(b, x, y)) continue;
          const isDoor = b.doors.some((d) => d.x === x && d.y === y);
          expect(WORLD_DEF.terrainAt(x, y) === 'wall').toBe(!isDoor);
        }
    }
  });

  it('styles banks as bank and the hut as hut', () => {
    const style = (id: string) => buildings.find((b) => b.id === id)?.style;
    expect(style('willowbrook_bank')).toBe('bank');
    expect(style('fernhaven_bank')).toBe('bank');
    expect(style('old_hut')).toBe('hut');
  });

  it('buildingAt: inside, door, outside', () => {
    expect(buildingAt(12, 10)?.id).toBe('willowbrook_bank');
    expect(buildingAt(13, 14)?.id).toBe('willowbrook_bank');
    expect(buildingAt(94, 62)?.id).toBe('fernhaven_bank');
    expect(buildingAt(18, 15)).toBeNull();
    expect(buildingAt(13, 15)).toBeNull();
    expect(buildingAt(-1, -1)).toBeNull();
  });
});

describe('map labels', () => {
  it('lie inside the world', () => {
    for (const l of labels) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThan(WORLD_DEF.widthTiles);
      expect(l.y).toBeLessThan(WORLD_DEF.heightTiles);
    }
  });

  it('has one bank facility label per bank booth group, inside its building', () => {
    const banks = labels.filter((l) => l.kind === 'facility' && l.icon === 'bank');
    const booths = WORLD_DEF.spawns.filter((s) => s.ref === 'bank_booth');
    // Free-standing booths (no building) get no facility label; only the Greatmere shore booth is one.
    const open = booths.filter((b) => !buildingAt(b.x, b.y));
    expect(open.map((b) => [b.x, b.y])).toEqual([[72, 52]]);
    const groups = new Set(booths.flatMap((b) => buildingAt(b.x, b.y)?.id ?? []));
    expect(
      banks
        .map((l) => buildingAt(l.x, l.y)?.id)
        .filter(Boolean)
        .sort(),
    ).toEqual([...groups].sort());
    // Each free-standing booth has its own bank label on its tile.
    for (const b of open) {
      expect(banks.some((l) => l.x === b.x && l.y === b.y)).toBe(true);
    }
    expect(banks).toHaveLength(groups.size + open.length);
  });

  it('region labels are unique and non-empty', () => {
    const regions = labels.filter((l) => l.kind === 'region').map((l) => `${l.text}@${l.x},${l.y}`);
    expect(regions.length).toBeGreaterThanOrEqual(6);
    expect(findDuplicates(regions)).toEqual([]);
  });
});
