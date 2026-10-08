import type { GameEvent, Requirement, Tile } from '@core/contracts';

/** What choosing an option asks the integrator to do. Ids are plain strings owned by other modules. */
export type FacilityIntent =
  { type: 'openPanel'; panel: string } | { type: 'startRecipe'; recipeGroup: string };

/** Where the player may stand to use a facility. `adjacent4` = any walkable 4-adjacent tile. */
export type ReachRule = 'adjacent4';

export interface FacilityOption {
  id: string;
  label: string;
  intent: FacilityIntent;
  /** Locked options stay listed; the integrator shows why and blocks the intent. */
  requires?: Requirement[];
}

export interface FacilityDef {
  kind: string;
  name: string;
  examine: string;
  reach: ReachRule;
  options: FacilityOption[];
}

export type FacilityError = 'unknownFacility' | 'unknownOption';

/** A lightable log type: how long the fire it makes burns. Ids are owned by woodcutting. */
export interface LightableLogDef {
  burnTicks: number;
}

/** A transient fire on the ground. Not saved. */
export interface FireState {
  id: string;
  tile: Tile;
  logsId: string;
  /** The fire is gone once `nowTick >= expiresAtTick`. */
  expiresAtTick: number;
}

export type LightError = 'noTinderbox' | 'notLightable' | 'tileOccupied';

export interface LightInput {
  tile: Tile;
  logsId: string;
  hasTinderbox: boolean;
  /** True when the world grid blocks this tile. */
  tileBlocked: boolean;
  nowTick: number;
  nextId: string;
}

export interface LightOutcome {
  fires: FireState[];
  fire: FireState;
  /** The integrator removes this from the inventory. */
  consumed: { itemId: string; quantity: number };
}

export type FireEvent = GameEvent & {
  type: 'fireBurnedOut';
  fireId: string;
  tile: Tile;
  logsId: string;
};

export interface FireMessages {
  lighting: string;
  lit: string;
  burnedOut: string;
  errors: Record<LightError, string>;
}

/** A ground item to spawn where a fire burned out. */
export interface FireDrop {
  itemId: string;
  quantity: number;
  tile: Tile;
}
