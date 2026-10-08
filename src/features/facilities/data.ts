import { defineItems } from '@core/items';
import type { FacilityDef, FireMessages, LightableLogDef } from './types';

export const FACILITIES: FacilityDef[] = [
  {
    kind: 'bank_booth',
    name: 'Bank booth',
    examine: 'A sturdy booth where the banker keeps your belongings safe.',
    reach: 'adjacent4',
    options: [{ id: 'bank', label: 'Bank', intent: { type: 'openPanel', panel: 'bankPanel' } }],
  },
  {
    kind: 'bank_chest',
    name: 'Bank chest',
    examine: 'An iron-bound chest that stores your items.',
    reach: 'adjacent4',
    options: [{ id: 'use', label: 'Use', intent: { type: 'openPanel', panel: 'bankPanel' } }],
  },
  {
    kind: 'deposit_chest',
    name: 'Deposit chest',
    examine: 'A slotted chest that accepts deposits. Nothing comes back out.',
    reach: 'adjacent4',
    options: [
      { id: 'deposit', label: 'Deposit', intent: { type: 'openPanel', panel: 'depositPanel' } },
    ],
  },
  {
    kind: 'fire',
    name: 'Fire',
    examine: 'A crackling fire. It will burn out in time.',
    reach: 'adjacent4',
    options: [
      { id: 'cook', label: 'Cook', intent: { type: 'startRecipe', recipeGroup: 'cooking' } },
    ],
  },
];

export const FACILITY_ITEMS = defineItems([
  {
    id: 'tinderbox',
    name: 'Tinderbox',
    examine: 'A small box with flint and steel. Good for lighting logs.',
    value: 1,
    stackable: false,
    icon: 'tinderbox',
  },
  {
    id: 'ashes',
    name: 'Ashes',
    examine: 'A pile of cold ash left by a burnt-out fire.',
    value: 0,
    stackable: true,
    icon: 'ashes',
  },
]);

/** Left on the ground where a fire burns out. */
export const ASHES_ID = 'ashes';

export const TINDERBOX_ID = 'tinderbox';

/** Ticks the player spends lighting (no success roll: firemaking is not a skill). */
export const LIGHT_TICKS = 3;

/** Lightable log ids (owned by woodcutting) and how long their fire burns (600 ms ticks). */
export const LIGHTABLE_LOGS: Readonly<Record<string, LightableLogDef>> = {
  logs: { burnTicks: 100 },
  oak_logs: { burnTicks: 150 },
};

/** Tile offsets (dx, dy) the player steps to off the fire tile, tried in order: west, east, south, north. */
export const STEP_ASIDE: readonly { dx: number; dy: number }[] = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export const FIRE_MESSAGES: FireMessages = {
  lighting: 'You attempt to light the logs.',
  lit: 'The fire catches and the logs begin to burn.',
  burnedOut: 'The fire burns out.',
  errors: {
    noTinderbox: 'You need a tinderbox to light a fire.',
    notLightable: "You can't light those.",
    tileOccupied: "You can't light a fire here.",
  },
};
