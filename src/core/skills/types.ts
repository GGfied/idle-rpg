import type { GameEvent } from '@core/contracts';
import type { WeightedEntry } from '@core/utils';

/** Depletion state of one harvestable thing (tree, rock, fishing spot). null = available. */
export interface NodeState {
  respawnAt: number | null;
}

/** Node states by node instance id (e.g. "tree_12_8"). Missing entries mean "available". */
export type NodeMap = Record<string, NodeState>;

export interface GatherYield {
  itemId: string;
  quantity: number;
}

/**
 * Everything a gathering skill needs, as data. A tree, rock or fishing spot is one of these.
 * Woodcutting, mining and fishing add entries; they add no loop code.
 */
export interface GatherDef {
  id: string;
  skill: string;
  requiredLevel: number;
  xp: number;
  /** Success rate out of 256 at level 1 and level 99 (see successChance). */
  successLow: number;
  successHigh: number;
  /** Ticks between attempts before tool speed-ups. */
  baseTicks: number;
  /** What a success yields (weighted; use a single entry for "always logs"). */
  yields: WeightedEntry<GatherYield>[];
  /** Chance per success that the node depletes (1 for rocks, ~1/8 for trees, 0 for fishing). */
  depleteChance: number;
  /** Ticks until a depleted node comes back. */
  respawnTicks: number;
  /** Tool kind needed ("axe", "pickaxe"); the environment resolves it. Omit for none. */
  toolKind?: string;
}

export type GatherStopReason =
  'levelTooLow' | 'noTool' | 'inventoryFull' | 'depleted' | 'cancelled';

/** The player is acting on one node. Plain data, serializable. */
export interface GatherSession {
  nodeId: string;
  defId: string;
  /** Ticks left until the next attempt. */
  cooldown: number;
}

export interface GatheringState {
  session: GatherSession | null;
  nodes: NodeMap;
}

/** Facts the loop needs from other modules; the integrator implements these. */
export interface GatherEnv {
  getDef(defId: string): GatherDef | undefined;
  /** Current level in a skill. */
  level(skill: string): number;
  /** The best tool of this kind the player has, or null. `ticksSaved` shortens the attempt time. */
  tool(kind: string): { ticksSaved: number } | null;
  /** Whether `quantity` of an item still fits (inventory space). */
  canFit(itemId: string, quantity: number): boolean;
}

/** Intents and notifications; the integrator applies grants (inventory add, xp add). */
export type GatherEvent = GameEvent &
  (
    | { type: 'itemGathered'; skill: string; nodeId: string; itemId: string; quantity: number }
    | { type: 'xpGranted'; skill: string; amount: number; source: string }
    | { type: 'nodeDepleted'; nodeId: string }
    | { type: 'nodeRespawned'; nodeId: string }
    | { type: 'gatherStarted'; nodeId: string; defId: string }
    | {
        type: 'gatherStopped';
        nodeId: string;
        reason: GatherStopReason;
        /** The def being gathered, when known. */
        defId?: string;
        /** Only with reason 'levelTooLow': the def's requiredLevel. */
        requiredLevel?: number;
        /** Only with reason 'noTool': the def's toolKind (e.g. 'axe'). */
        tool?: string;
      }
  );
