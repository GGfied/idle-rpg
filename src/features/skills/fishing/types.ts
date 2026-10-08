import type { GameEvent } from '@core/contracts';
import type { NodeState } from '@core/skills';

/** One fish a method can land. Success is out of 256 at level 1 / level 99 (see successChance). */
export interface FishCatch {
  /** Raw fish item id (`raw_<fish>`). */
  itemId: string;
  requiredLevel: number;
  xp: number;
  successLow: number;
  successHigh: number;
  /** Relative chance of being the fish rolled, among the fish the player's level allows. */
  weight: number;
}

/** One way of fishing a spot (e.g. "net", "bait"). */
export interface FishingMethodDef {
  /** Tool kind the player needs ("net", "rod"); resolved by the environment. */
  toolKind: string;
  /** Stackable item used up per fish caught. Omit for methods without bait. */
  baitItemId?: string;
  /** Ticks between attempts before tool speed-ups. */
  baseTicks: number;
  catches: readonly FishCatch[];
}

/** A kind of fishing spot. Ids match the `defId` the world spawns. */
export interface SpotDef {
  id: string;
  /** Methods by id; the first is the default. */
  methods: Readonly<Record<string, FishingMethodDef>>;
  /** A spot moves to another of its tiles every min..max ticks. */
  moveTicksMin: number;
  moveTicksMax: number;
}

/** Where a spot instance currently is and when it next moves. */
export interface SpotState {
  defId: string;
  /** Index into the spot's candidate tiles (the map owns the tile list). */
  tile: number;
  tileCount: number;
  /** `respawnAt` is the tick of the next move (core nodeState used as a countdown). */
  moveTimer: NodeState;
}

export interface FishingSession {
  spotId: string;
  defId: string;
  method: string;
  /** Ticks left until the next attempt. */
  cooldown: number;
}

export interface FishingState {
  session: FishingSession | null;
  /** Spot instances by id. Spots absent here never move. */
  spots: Record<string, SpotState>;
}

export type FishingStopReason =
  'levelTooLow' | 'noTool' | 'noBait' | 'inventoryFull' | 'spotMoved' | 'cancelled';

/** Facts the loop needs from other modules; the integrator implements these. */
export interface FishingEnv {
  /** Current level in a skill. */
  level(skill: string): number;
  /** Best tool of this kind the player has (via `bestTool`), or null. */
  tool(kind: string): { ticksSaved: number } | null;
  /** Whether the player carries at least one of this item (bait). */
  hasItem(itemId: string): boolean;
  /** Whether `quantity` of an item still fits (inventory space). */
  canFit(itemId: string, quantity: number): boolean;
}

/** Intents and notifications; the integrator applies grants (inventory add/remove, xp add). */
export type FishingEvent = GameEvent &
  (
    | { type: 'fishingStarted'; spotId: string; defId: string; method: string }
    /** One per attempt (catch or miss), for per-attempt chat/sound like chopping's swing. */
    | { type: 'fishingAttempt'; spotId: string; defId: string; method: string }
    | {
        type: 'fishingStopped';
        spotId: string;
        defId: string;
        reason: FishingStopReason;
        /** Only with 'levelTooLow'. */
        requiredLevel?: number;
        /** Only with 'noTool'. */
        tool?: string;
        /** Only with 'noBait'. */
        baitItemId?: string;
      }
    | { type: 'itemGathered'; skill: string; nodeId: string; itemId: string; quantity: number }
    | { type: 'xpGranted'; skill: string; amount: number; source: string }
    /** Remove `quantity` of the bait item from the inventory. */
    | { type: 'baitConsumed'; itemId: string; quantity: number }
    | { type: 'spotMoved'; spotId: string; defId: string; from: number; to: number }
  );

/** Chat text as data, looked up by the integrator. `{level}` in levelTooLow is replaced. */
export interface FishingMessages {
  started: string;
  /** Per method id ("net", "bait"): said on every attempt (`fishingAttempt`). */
  attempt: Readonly<Record<string, string>>;
  /** Per raw fish item id. */
  caught: Readonly<Record<string, string>>;
  stopped: Readonly<Record<FishingStopReason, string>>;
}
