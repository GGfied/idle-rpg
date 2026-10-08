import { describe, expect, it } from 'vitest';
import { FISHING_SPOTS, TREE_SPAWNS, WORLD_ROCKS } from '@features/world';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import { buildVfxContext, nodeTile, swingVfxEvent } from '@app/scenes/vfxContext';

const toWorld = (x: number, y: number) => ({ x: x * 10, y: y * 100 });
const game = newGame(CONTENT);
const spot = FISHING_SPOTS[0]!;

describe('vfx context', () => {
  it('nodeWorld resolves trees, rocks and fishing spots (current tile)', () => {
    const ctx = buildVfxContext(CONTENT, game, { x: 0, y: 0 }, toWorld);
    const t = TREE_SPAWNS[0]!;
    expect(ctx.nodeWorld(t.nodeId)).toEqual(toWorld(t.x, t.y));
    const r = WORLD_ROCKS[0]!;
    expect(ctx.nodeWorld(r.nodeId)).toEqual(toWorld(r.x, r.y));
    expect(ctx.nodeWorld(spot.spotId)).toEqual(toWorld(spot.tiles[0]!.x, spot.tiles[0]!.y));
    expect(ctx.nodeWorld('nope')).toBeUndefined();
  });

  it('a hopped spot resolves to its new tile', () => {
    const hopped = {
      ...game,
      fishing: {
        ...game.fishing,
        spots: {
          [spot.spotId]: { defId: spot.defId, tile: 2, tileCount: 4, moveTimer: { respawnAt: 9 } },
        },
      },
    } as typeof game;
    expect(nodeTile(CONTENT, hopped, spot.spotId)).toEqual(spot.tiles[2]);
  });

  it('tileWorld maps a spot tile index; unknown spot or index is undefined', () => {
    const ctx = buildVfxContext(CONTENT, game, { x: 0, y: 0 }, toWorld);
    const t = spot.tiles[1]!;
    expect(ctx.tileWorld(spot.spotId, 1)).toEqual(toWorld(t.x, t.y));
    expect(ctx.tileWorld(spot.spotId, 99)).toBeUndefined();
    expect(ctx.tileWorld('nope', 0)).toBeUndefined();
  });

  it('the swing event carries skill and the node id', () => {
    expect(swingVfxEvent('woodcutting', 'tree_1')).toEqual({
      type: 'swingImpact',
      skill: 'woodcutting',
      nodeId: 'tree_1',
    });
    expect(swingVfxEvent(undefined, undefined)).toEqual({ type: 'swingImpact' });
  });
});
