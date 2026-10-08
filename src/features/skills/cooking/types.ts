import type { GameEvent } from '@core/contracts';

/** What the fish is cooked on. Only 'fire' exists in-world for now. */
export type CookSource = 'fire' | 'range';

/** Raw item id -> cooked / burnt item id. Success is out of 256 (see successChance). */
export interface CookingRecipe {
  /** Raw fish item id (owned by fishing, referenced by string). */
  rawId: string;
  cookedId: string;
  burntId: string;
  levelRequired: number;
  /** Granted on a successful cook only. */
  xp: number;
  /** Cook success out of 256 at `levelRequired` and at `stopBurnLevel`. */
  successLow: number;
  successHigh: number;
  /** From this level on the item never burns. */
  stopBurnLevel: number;
  /** HP restored when the cooked item is eaten (eating is wired later). */
  heals: number;
  /** Ticks between cooks. */
  ticksPerCook: number;
}

export type CookError = 'levelTooLow' | 'noRawFood' | 'unknownRecipe';

export interface CookInput {
  rawId: string;
  /** Current Cooking level. */
  level: number;
  /** How many of the raw item the player holds. */
  rawCount: number;
  source: CookSource;
}

export interface CookOutcome {
  /** Items to remove from the inventory. */
  consume: { itemId: string; quantity: number };
  /** Item to add (cooked or burnt). */
  produce: { itemId: string; quantity: number };
  /** 0 when burnt. */
  xp: number;
  burnt: boolean;
  message: string;
}

export interface CookingSession {
  /** World object being cooked on (the fire). */
  objectId: string;
  source: CookSource;
  rawId: string;
  /** Ticks left until the next cook. */
  cooldown: number;
}

export interface CookingState {
  session: CookingSession | null;
}

export type CookingStopReason =
  'levelTooLow' | 'noRawFood' | 'unknownRecipe' | 'sourceGone' | 'cancelled';

/** Facts the loop needs from other modules; the integrator implements these. */
export interface CookingEnv {
  level(skill: string): number;
  /** How many of an item the player carries. */
  count(itemId: string): number;
  /** Whether the fire/range is still there and lit. */
  sourceActive(objectId: string): boolean;
}

/** Intents and notifications; the integrator applies grants (inventory add/remove, xp add, chat). */
export type CookingEvent = GameEvent &
  (
    | { type: 'cookingStarted'; objectId: string; rawId: string }
    | {
        type: 'cookingStopped';
        objectId: string;
        rawId: string;
        reason: CookingStopReason;
        /** Only with 'levelTooLow'. */
        requiredLevel?: number;
      }
    /** One per cook attempt; `message` is the chat line. */
    | {
        type: 'itemCooked';
        objectId: string;
        rawId: string;
        producedId: string;
        burnt: boolean;
        message: string;
      }
    | { type: 'itemConsumed'; itemId: string; quantity: number }
    | { type: 'itemGathered'; skill: string; nodeId: string; itemId: string; quantity: number }
    /** Success only. */
    | { type: 'xpGranted'; skill: string; amount: number; source: string }
  );

/** Chat text as data. `{level}` in `stopped.levelTooLow` is replaced. */
export interface CookingMessages {
  /** Per raw item id. */
  cooked: Readonly<Record<string, string>>;
  burnt: Readonly<Record<string, string>>;
  stopped: Readonly<Record<CookingStopReason, string>>;
}
