/** Views of the world's rocks and fishing spots (graphics' `createNodeView`), keyed by node/spot id. */
import type Phaser from 'phaser';
import type { Tile } from '@core/contracts';
import { createNodeView, isoProjection } from '@render/index';
import type { NodeView } from '@render/index';
import type { FishingSpotSpawn, RockSpawn } from '@features/world';

export interface NodeViews {
  /** The live view of a rock (by node id) or spot (by spot id). */
  get(id: string): NodeView | undefined;
  setDepleted(nodeId: string, depleted: boolean): void;
  /** A spot hopped: the old view goes away for a beat, then reappears on the new tile. */
  moveSpot(spotId: string, tile: Tile): void;
  destroy(): void;
}

export function createNodeViews(
  scene: Phaser.Scene,
  rocks: readonly RockSpawn[],
  spots: readonly FishingSpotSpawn[],
  spotStart: (s: FishingSpotSpawn) => Tile,
  idle: () => boolean,
): NodeViews {
  const views = new Map<string, NodeView>();
  const place = (v: NodeView, t: Tile): void => {
    const feet = isoProjection.tileToWorld(t.x, t.y);
    v.setWorldPosition(feet.x, feet.y);
  };
  for (const r of rocks) {
    const v = createNodeView(scene, r.defId, { idle: idle() });
    place(v, r);
    views.set(r.nodeId, v);
  }
  for (const s of spots) {
    const v = createNodeView(scene, s.defId, { idle: idle() });
    place(v, spotStart(s));
    views.set(s.spotId, v);
  }
  return {
    get: (id) => views.get(id),
    setDepleted: (id, depleted) => views.get(id)?.setDepleted(depleted),
    moveSpot(spotId, tile) {
      const v = views.get(spotId);
      if (!v) return;
      v.setDepleted(true);
      place(v, tile);
      v.setDepleted(false);
    },
    destroy() {
      for (const v of views.values()) v.destroy();
      views.clear();
    },
  };
}
