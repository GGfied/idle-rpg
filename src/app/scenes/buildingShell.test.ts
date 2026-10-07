import { describe, expect, it } from 'vitest';
import { WORLD_DEF } from '@features/world';
import { isBuildingShell } from '@app/scenes/buildingShell';

describe('isBuildingShell', () => {
  it('covers every outer wall of every building, and walls stay blocked', () => {
    for (const b of WORLD_DEF.buildings) {
      const { x, y, w, h } = b.rect;
      for (let ty = y; ty < y + h; ty++)
        for (let tx = x; tx < x + w; tx++) {
          const edge = tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1;
          expect(isBuildingShell(tx, ty), `${b.id} ${tx},${ty}`).toBe(edge);
          if (WORLD_DEF.terrainAt(tx, ty) === 'wall')
            expect(WORLD_DEF.collisionAt(tx, ty)).toBe(true);
        }
    }
  });

  it('leaves interior wall tiles (counters) to the chunk renderer', () => {
    const inner = WORLD_DEF.terrainAt(10, 8);
    expect(inner).toBe('wall');
    expect(isBuildingShell(10, 8)).toBe(false);
  });

  it('is false outside any building', () => {
    expect(isBuildingShell(0, 0)).toBe(false);
  });
});
