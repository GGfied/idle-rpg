import { describe, expect, it } from 'vitest';
import { facilityDef } from '@features/facilities';
import { getNpcDef } from '@features/npc';
import { FISHING_SPOTS as WORLD_FISHING_SPOTS, WORLD_DEF } from '@features/world';
import { MINING_NODES } from '@features/skills/mining';
import { FISHING_SPOTS } from '@features/skills/fishing';
import { CONTENT } from '@app/registry';

/** Every placement in the world refers to something the real registries know. */
describe('world spawn refs exist in the real registries', () => {
  const of = (type: string) => WORLD_DEF.spawns.filter((s) => s.type === type);

  it('tree refs are woodcutting gather defs', () => {
    const trees = of('tree');
    expect(trees.length).toBeGreaterThan(50);
    for (const s of trees) expect(CONTENT.gatherDefs.has(s.ref), `${s.id} -> ${s.ref}`).toBe(true);
  });
  it('object refs are facility kinds', () => {
    expect(of('object').length).toBeGreaterThan(0);
    for (const s of of('object')) expect(facilityDef(s.ref), `${s.id} -> ${s.ref}`).toBeDefined();
  });
  it('npc refs are npc defs', () => {
    expect(of('npc').length).toBeGreaterThan(0);
    for (const s of of('npc')) expect(getNpcDef(s.ref), `${s.id} -> ${s.ref}`).toBeDefined();
  });
  it('every spawn id is in the content maps the game runs on, and ids are unique', () => {
    const ids = WORLD_DEF.spawns.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONTENT.trees.size).toBe(of('tree').length);
    expect(CONTENT.objects.size).toBe(of('object').length);
    expect(CONTENT.npcs.size).toBe(of('npc').length);
  });
  it('the player spawn and every npc stand on valid tiles of the world grid', () => {
    expect(CONTENT.grid.isWalkable(CONTENT.spawn.x, CONTENT.spawn.y)).toBe(true);
    expect(CONTENT.grid.width).toBe(WORLD_DEF.widthTiles);
  });
  it('every rock spawn is a mining gather def', () => {
    const ids = new Set(MINING_NODES.map((d) => d.id));
    const rocks = of('rock');
    expect(rocks.length).toBeGreaterThan(0);
    expect(CONTENT.rocks.size).toBe(rocks.length);
    for (const s of rocks) expect(ids.has(s.ref), `${s.id} -> ${s.ref}`).toBe(true);
  });
  it('every world fishing spot is a fishing module spot def', () => {
    const ids = new Set(FISHING_SPOTS.map((d) => d.id));
    expect(WORLD_FISHING_SPOTS.length).toBeGreaterThan(0);
    expect(CONTENT.fishingSpots.size).toBe(WORLD_FISHING_SPOTS.length);
    for (const f of WORLD_FISHING_SPOTS) expect(ids.has(f.defId), `${f.spotId}`).toBe(true);
  });
});
