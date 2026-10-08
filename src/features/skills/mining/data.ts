import { defineItems } from '@core/items';
import { defineTools } from '@core/equipment';
import type { GatherDef } from '@core/skills';
import type { MiningMessages } from './types';

export const MINING_ITEMS = defineItems([
  {
    id: 'copper_ore',
    name: 'Copper ore',
    examine: 'A lump of reddish copper ore.',
    value: 6,
    stackable: false,
    icon: 'copper_ore',
  },
  {
    id: 'tin_ore',
    name: 'Tin ore',
    examine: 'A dull, silvery lump of tin ore.',
    value: 6,
    stackable: false,
    icon: 'tin_ore',
  },
  {
    id: 'iron_ore',
    name: 'Iron ore',
    examine: 'A heavy, rust-flecked lump of iron ore.',
    value: 18,
    stackable: false,
    icon: 'iron_ore',
  },
  {
    id: 'coal',
    name: 'Coal',
    examine: 'A black, brittle lump that burns hot.',
    value: 30,
    stackable: false,
    icon: 'coal',
  },
  {
    id: 'bronze_pickaxe',
    name: 'Bronze pickaxe',
    examine: 'A basic pickaxe with a dull bronze head.',
    value: 16,
    stackable: false,
    icon: 'bronze_pickaxe',
  },
  {
    id: 'iron_pickaxe',
    name: 'Iron pickaxe',
    examine: 'A sturdy pickaxe; it cracks stone faster than bronze.',
    value: 56,
    stackable: false,
    icon: 'iron_pickaxe',
  },
  {
    id: 'steel_pickaxe',
    name: 'Steel pickaxe',
    examine: 'A keen steel pickaxe that bites deep into rock.',
    value: 150,
    stackable: false,
    icon: 'steel_pickaxe',
  },
]);

/** Pickaxes. Base swing is 4 ticks: bronze 4, iron 3, steel 2. */
export const MINING_TOOLS = defineTools({
  bronze_pickaxe: { kind: 'pickaxe', skill: 'mining', levelRequired: 1, ticksSaved: 0 },
  iron_pickaxe: { kind: 'pickaxe', skill: 'mining', levelRequired: 10, ticksSaved: 1 },
  steel_pickaxe: { kind: 'pickaxe', skill: 'mining', levelRequired: 20, ticksSaved: 2 },
});

/**
 * Rock defs. Ids are the `defId` the world spawns ('copper_rock', 'tin_rock', 'iron_rock', 'coal_rock').
 * Success is out of 256 at level 1 / level 99. Every rock empties after one ore (depleteChance 1).
 */
export const MINING_NODES: readonly GatherDef[] = [
  {
    id: 'copper_rock',
    skill: 'mining',
    requiredLevel: 1,
    xp: 17.5,
    successLow: 72,
    successHigh: 220,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'copper_ore', quantity: 1 } }],
    depleteChance: 1,
    respawnTicks: 6,
    toolKind: 'pickaxe',
  },
  {
    id: 'tin_rock',
    skill: 'mining',
    requiredLevel: 1,
    xp: 17.5,
    successLow: 72,
    successHigh: 220,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'tin_ore', quantity: 1 } }],
    depleteChance: 1,
    respawnTicks: 6,
    toolKind: 'pickaxe',
  },
  {
    id: 'iron_rock',
    skill: 'mining',
    requiredLevel: 15,
    xp: 35,
    successLow: 56,
    successHigh: 180,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'iron_ore', quantity: 1 } }],
    depleteChance: 1,
    respawnTicks: 10,
    toolKind: 'pickaxe',
  },
  {
    id: 'coal_rock',
    skill: 'mining',
    requiredLevel: 30,
    xp: 60,
    successLow: 48,
    successHigh: 150,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'coal', quantity: 1 } }],
    depleteChance: 1,
    respawnTicks: 14,
    toolKind: 'pickaxe',
  },
];

/** Suggested inventory for a new game. */
export const MINING_STARTING_ITEMS: readonly { itemId: string; quantity: number }[] = [
  { itemId: 'bronze_pickaxe', quantity: 1 },
];

export const MINING_MESSAGES: MiningMessages = {
  started: 'You swing your pickaxe at the rock.',
  gathered: {
    copper_ore: 'You mine some copper ore.',
    tin_ore: 'You mine some tin ore.',
    iron_ore: 'You mine some iron ore.',
    coal: 'You mine some coal.',
  },
  stopped: {
    levelTooLow: 'You need a Mining level of {level} to mine this rock.',
    noTool: 'You need a pickaxe to mine this rock.',
    inventoryFull: 'Your inventory is too full to hold any more ore.',
    depleted: 'The rock is empty and you stop mining.',
    cancelled: '',
  },
};
