import { defineItems } from '@core/items';
import { defineTools } from '@core/equipment';
import type { FishingMessages, SpotDef } from './types';

export const FISHING_ITEMS = defineItems([
  {
    id: 'raw_shrimp',
    name: 'Raw shrimp',
    examine: 'A small, translucent shrimp. Best cooked.',
    value: 5,
    stackable: false,
    icon: 'raw_shrimp',
  },
  {
    id: 'raw_anchovies',
    name: 'Raw anchovies',
    examine: 'Slim, silvery and very salty.',
    value: 12,
    stackable: false,
    icon: 'raw_anchovies',
  },
  {
    id: 'raw_sardine',
    name: 'Raw sardine',
    examine: 'A small oily fish.',
    value: 8,
    stackable: false,
    icon: 'raw_sardine',
  },
  {
    id: 'raw_herring',
    name: 'Raw herring',
    examine: 'A plump silver fish from the cold shallows.',
    value: 15,
    stackable: false,
    icon: 'raw_herring',
  },
  {
    id: 'raw_trout',
    name: 'Raw trout',
    examine: 'A speckled freshwater fish with a firm, pink belly.',
    value: 25,
    stackable: false,
    icon: 'raw_trout',
  },
  {
    id: 'raw_mackerel',
    name: 'Raw mackerel',
    examine: 'A sleek, striped sea fish, heavy for its size.',
    value: 35,
    stackable: false,
    icon: 'raw_mackerel',
  },
  {
    id: 'small_fishing_net',
    name: 'Small fishing net',
    examine: 'A knotted net for catching small fish in the shallows.',
    value: 5,
    stackable: false,
    icon: 'small_fishing_net',
  },
  {
    id: 'fishing_rod',
    name: 'Fishing rod',
    examine: 'A whittled rod with a line and hook. Needs bait.',
    value: 8,
    stackable: false,
    icon: 'fishing_rod',
  },
  {
    id: 'fishing_bait',
    name: 'Fishing bait',
    examine: 'A pinch of wriggling bait.',
    value: 1,
    stackable: true,
    icon: 'fishing_bait',
  },
]);

/** Fishing tools. Both are baseline speed; kinds match `SpotDef` method `toolKind`s. */
export const FISHING_TOOLS = defineTools({
  small_fishing_net: { kind: 'net', skill: 'fishing', levelRequired: 1, ticksSaved: 0 },
  fishing_rod: { kind: 'rod', skill: 'fishing', levelRequired: 1, ticksSaved: 0 },
});

/** The bait item (stackable), referenced by id from the bait method. */
export const BAIT_ITEM_ID = 'fishing_bait';

/**
 * Spot kinds. Ids match the `defId` the world spawns. Success is out of 256 at level 1 / level 99.
 * A fish only enters the roll once the player's level reaches its `requiredLevel`.
 */
export const FISHING_SPOTS: readonly SpotDef[] = [
  {
    id: 'net_spot',
    moveTicksMin: 60,
    moveTicksMax: 120,
    methods: {
      net: {
        toolKind: 'net',
        baseTicks: 4,
        catches: [
          {
            itemId: 'raw_shrimp',
            requiredLevel: 1,
            xp: 10,
            successLow: 72,
            successHigh: 190,
            weight: 3,
          },
          {
            itemId: 'raw_anchovies',
            requiredLevel: 15,
            xp: 36,
            successLow: 40,
            successHigh: 130,
            weight: 1,
          },
          {
            itemId: 'raw_mackerel',
            requiredLevel: 30,
            xp: 62,
            successLow: 32,
            successHigh: 115,
            weight: 1,
          },
        ],
      },
    },
  },
  {
    id: 'bait_spot',
    moveTicksMin: 60,
    moveTicksMax: 120,
    methods: {
      bait: {
        toolKind: 'rod',
        baitItemId: BAIT_ITEM_ID,
        baseTicks: 4,
        catches: [
          {
            itemId: 'raw_sardine',
            requiredLevel: 5,
            xp: 20,
            successLow: 56,
            successHigh: 170,
            weight: 2,
          },
          {
            itemId: 'raw_herring',
            requiredLevel: 10,
            xp: 30,
            successLow: 48,
            successHigh: 150,
            weight: 1,
          },
          {
            itemId: 'raw_trout',
            requiredLevel: 25,
            xp: 36,
            successLow: 40,
            successHigh: 125,
            weight: 1,
          },
        ],
      },
    },
  },
];

/** Suggested inventory for a new game (no bait: the player must find or buy it). */
export const STARTING_ITEMS: readonly { itemId: string; quantity: number }[] = [
  { itemId: 'small_fishing_net', quantity: 1 },
];

export const FISHING_MESSAGES: FishingMessages = {
  started: 'You cast out into the water.',
  attempt: { net: 'You cast out your net.', bait: 'You cast your line.' },
  caught: {
    raw_shrimp: 'You catch some shrimp.',
    raw_anchovies: 'You catch some anchovies.',
    raw_sardine: 'You catch a sardine.',
    raw_herring: 'You catch a herring.',
    raw_trout: 'You catch a trout.',
    raw_mackerel: 'You catch a mackerel.',
  },
  stopped: {
    levelTooLow: 'You need a Fishing level of {level} to fish here.',
    noTool: 'You need the right fishing tool to fish here.',
    noBait: 'You have no bait left.',
    inventoryFull: 'Your inventory is too full to hold any more fish.',
    spotMoved: 'The fish have moved on.',
    cancelled: '',
  },
};
