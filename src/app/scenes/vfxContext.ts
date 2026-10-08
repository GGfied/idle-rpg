/** Pure pieces of the vfx hookup: where nodes are in world px, and the swing event vfx expects. */
import type { Tile } from '@core/contracts';
import type { Content } from '@app/registry';
import { gatherNode } from '@app/game/gatherNode';
import { spotTile } from '@app/game/fishingSpots';
import type { GameState } from '@app/game/types';

export interface World2 {
  x: number;
  y: number;
}
type ToWorld = (x: number, y: number) => World2;

/** Tile of a tree, rock, or fishing spot (its current tile) by id. */
export function nodeTile(content: Content, game: GameState, id: string): Tile | undefined {
  const n = gatherNode(content, id);
  if (n) return n;
  const spot = content.fishingSpots.get(id);
  return spot ? spotTile(spot, game.fishing) : undefined;
}

/** The context vfx needs: node feet (trees, rocks, spots) and a spot's candidate tile by index. */
export function buildVfxContext(
  content: Content,
  game: GameState,
  playerWorld: World2,
  toWorld: ToWorld,
) {
  return {
    playerWorld,
    nodeWorld: (id: string): World2 | undefined => {
      const t = nodeTile(content, game, id);
      return t ? toWorld(t.x, t.y) : undefined;
    },
    tileWorld: (spotId: string, index: number): World2 | undefined => {
      const t = content.fishingSpots.get(spotId)?.tiles[index];
      return t ? toWorld(t.x, t.y) : undefined;
    },
  };
}

/** The swing event for vfx: with the node id, effects play at the node instead of the player. */
export const swingVfxEvent = (skill: string | undefined, nodeId: string | undefined) => ({
  type: 'swingImpact',
  ...(skill ? { skill } : {}),
  ...(nodeId ? { nodeId } : {}),
});
