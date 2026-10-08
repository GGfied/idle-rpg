import { defineItems } from '@core/items';
import { defineTools } from '@core/equipment';
import type { GatherDef } from '@core/skills';
import type { WoodcuttingMessages } from './types';

export const WOODCUTTING_ITEMS = defineItems([
  {
    id: 'logs',
    name: 'Logs',
    examine: 'A stack of rough-cut timber.',
    value: 4,
    stackable: false,
    icon: 'logs',
  },
  {
    id: 'oak_logs',
    name: 'Oak logs',
    examine: 'Dense, golden-brown oak timber.',
    value: 20,
    stackable: false,
    icon: 'oak_logs',
  },
  {
    id: 'bronze_axe',
    name: 'Bronze axe',
    examine: 'A basic axe with a dull bronze head.',
    value: 16,
    stackable: false,
    icon: 'bronze_axe',
  },
  {
    id: 'iron_axe',
    name: 'Iron axe',
    examine: 'A sturdy axe; it bites deeper than bronze.',
    value: 56,
    stackable: false,
    icon: 'iron_axe',
  },
]);

/** Axes. Bronze is the baseline; iron saves one tick per swing (4 -> 3 on a tree). */
export const WOODCUTTING_TOOLS = defineTools({
  bronze_axe: { kind: 'axe', skill: 'woodcutting', levelRequired: 1, ticksSaved: 0 },
  iron_axe: { kind: 'axe', skill: 'woodcutting', levelRequired: 1, ticksSaved: 1 },
});

/**
 * Tree defs. Ids match the `defId` the world spawns ('tree', 'oak_tree').
 * Success is out of 256 at level 1 / level 99 (OSRS-style interpolation).
 */
export const WOODCUTTING_NODES: readonly GatherDef[] = [
  {
    id: 'tree',
    skill: 'woodcutting',
    requiredLevel: 1,
    xp: 25,
    successLow: 64,
    successHigh: 200,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'logs', quantity: 1 } }],
    depleteChance: 1, // normal trees fall after one log
    respawnTicks: 12,
    toolKind: 'axe',
  },
  {
    id: 'oak_tree',
    skill: 'woodcutting',
    requiredLevel: 15,
    xp: 45,
    successLow: 48,
    successHigh: 150,
    baseTicks: 4,
    yields: [{ weight: 1, value: { itemId: 'oak_logs', quantity: 1 } }],
    depleteChance: 1 / 8,
    respawnTicks: 14,
    toolKind: 'axe',
  },
];

/** Suggested inventory for a new game. */
export const STARTING_ITEMS: readonly { itemId: string; quantity: number }[] = [
  { itemId: 'bronze_axe', quantity: 1 },
];

export const WOODCUTTING_MESSAGES: WoodcuttingMessages = {
  started: 'You swing your axe at the tree.',
  gathered: {
    logs: 'You get some logs.',
    oak_logs: 'You get some oak logs.',
  },
  stopped: {
    levelTooLow: 'You need a Woodcutting level of {level} to chop this tree.',
    noTool: 'You need an axe to chop this tree.',
    inventoryFull: 'Your inventory is too full to hold any more logs.',
    depleted: 'The tree falls and you stop chopping.',
    cancelled: '',
  },
};
