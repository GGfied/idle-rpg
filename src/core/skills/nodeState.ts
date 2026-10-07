import type { NodeState } from './types';

/** A fresh, harvestable node. */
export const createNode = (): NodeState => ({ respawnAt: null });

export const isDepleted = (node: NodeState): boolean => node.respawnAt !== null;

/** Deplete a node at `tick`; it becomes available again at `tick + respawnTicks`. */
export const depleteNode = (tick: number, respawnTicks: number): NodeState => ({
  respawnAt: tick + Math.max(1, respawnTicks),
});

/** Advance one node: returns the (possibly respawned) node and whether it just respawned. */
export function tickNode(node: NodeState, tick: number): { node: NodeState; respawned: boolean } {
  if (node.respawnAt !== null && tick >= node.respawnAt) {
    return { node: createNode(), respawned: true };
  }
  return { node, respawned: false };
}
