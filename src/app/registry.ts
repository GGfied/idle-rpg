/**
 * The one list of what the game loads: content registries, tick systems, events and save slices.
 * Adding a feature is one entry here.
 */
import type { CollisionGrid, Tile } from '@core/contracts';
import { createToolRegistry } from '@core/equipment';
import type { ToolRegistry } from '@core/equipment';
import {
  createBank,
  deserializeBank,
  deserializeInventory,
  serializeBank,
  serializeInventory,
} from '@core/inventory';
import { createItemRegistry } from '@core/items';
import type { ItemRegistry } from '@core/items';
import { createSaveSchema } from '@core/persistence';
import type { SaveSlice } from '@core/persistence';
import {
  deserializeProgression,
  getLevel,
  serializeProgression,
  type ProgressionEvent,
  type ProgressionState,
} from '@core/progression';
import type { GatherDef, GatherEvent } from '@core/skills';
import type { System } from '@core/engine';
import { err, ok } from '@core/utils';
import type { CombatEvent } from '@features/combat';
import { createPlayerHp, deserializePlayerHp, serializePlayerHp } from '@features/combat';
import { deserializeMovement, serializeMovement } from '@features/movement';
import type { PrayerEvent } from '@features/skills/prayer';
import {
  createPrayerPoints,
  deserializePrayerPoints,
  serializePrayerPoints,
} from '@features/skills/prayer';
import type { MovementEvent } from '@features/movement';
import {
  WOODCUTTING_ITEMS,
  WOODCUTTING_NODES,
  WOODCUTTING_TOOLS,
} from '@features/skills/woodcutting';
import { spawnNpcs } from '@features/npc';
import type { NpcInstance } from '@features/npc';
import {
  NPC_SPAWNS,
  OBJECT_SPAWNS,
  PLAYER_SPAWN,
  TREE_SPAWNS,
  createCollisionGrid,
} from '@features/world';
import type { ObjectSpawn, TreeSpawn } from '@features/world';
import {
  createFacilitySystem,
  createNpcSystem,
  createGatherSystem,
  createMovementSystem,
  hpSystem,
  playTimeSystem,
  prayerSystem,
} from '@app/game/systems';
import type { GameState, MetaState } from '@app/game/types';

/** Every event a system can emit. Add a feature's event union here. */
export type AppEvent = GatherEvent | MovementEvent | ProgressionEvent | CombatEvent | PrayerEvent;

export interface Content {
  items: ItemRegistry;
  tools: ToolRegistry;
  gatherDefs: ReadonlyMap<string, GatherDef>;
  grid: CollisionGrid;
  trees: ReadonlyMap<string, TreeSpawn>;
  objects: ReadonlyMap<string, ObjectSpawn>;
  /** Placed NPCs by spawn id (idle: they never move, so this is content, not state). */
  npcs: ReadonlyMap<string, NpcInstance>;
  /** Counters (booths) people may talk across. */
  isCounter(tile: Tile): boolean;
  spawn: Tile;
}

export const CONTENT: Content = {
  items: createItemRegistry(WOODCUTTING_ITEMS),
  tools: createToolRegistry(WOODCUTTING_TOOLS),
  gatherDefs: new Map(WOODCUTTING_NODES.map((d) => [d.id, d])),
  grid: createCollisionGrid(NPC_SPAWNS),
  trees: new Map(TREE_SPAWNS.map((t) => [t.nodeId, t])),
  objects: new Map(OBJECT_SPAWNS.map((o) => [o.objectId, o])),
  npcs: new Map(spawnNpcs(NPC_SPAWNS).map((n) => [n.spawnId, n])),
  isCounter: (t) => OBJECT_SPAWNS.some((o) => o.x === t.x && o.y === t.y),
  spawn: PLAYER_SPAWN,
};

/** Examine text per gather def id (placeholder until the owners ship examine text for nodes). */
export const NODE_EXAMINE: Readonly<Record<string, string>> = {
  tree: 'A common tree.',
  oak_tree: 'A sturdy oak tree.',
};

/** Tick systems, run in this order every 600 ms. */
export const SYSTEMS: readonly System<GameState, AppEvent>[] = [
  createMovementSystem(CONTENT),
  createGatherSystem(CONTENT),
  createFacilitySystem(CONTENT),
  createNpcSystem(CONTENT),
  playTimeSystem,
  hpSystem,
  prayerSystem,
];

/** `meta` save slice: { playTimeMs } finite and >= 0. */
export const metaSlice: SaveSlice<MetaState> = {
  key: 'meta',
  serialize: (m) => ({ playTimeMs: m.playTimeMs }),
  deserialize(data) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return err('meta: bad shape');
    }
    const value = Object.hasOwn(data, 'playTimeMs')
      ? (data as Record<string, unknown>).playTimeMs
      : undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return err('meta: playTimeMs must be a finite number >= 0');
    }
    return ok({ playTimeMs: value });
  },
};

/** Save schema v3: inventory + progression + movement + meta + bank + hp + prayer
 * (hp/prayer read progression, so they come after it in key order; bank/hp/prayer default when absent). */
export const SAVE_SCHEMA = createSaveSchema({
  inventory: {
    key: 'inventory',
    serialize: serializeInventory,
    deserialize: (d: unknown) => deserializeInventory(d, CONTENT.items),
  },
  progression: {
    key: 'progression',
    serialize: serializeProgression,
    deserialize: deserializeProgression,
  },
  movement: {
    key: 'movement',
    serialize: serializeMovement,
    deserialize: (d: unknown) => deserializeMovement(d, CONTENT.grid, CONTENT.spawn),
  },
  meta: metaSlice,
  bank: {
    key: 'bank',
    serialize: serializeBank,
    deserialize: (d: unknown) => deserializeBank(d, CONTENT.items),
    defaultValue: () => createBank(),
  },
  hp: {
    key: 'hp',
    serialize: serializePlayerHp,
    deserialize: (d, decoded) =>
      deserializePlayerHp(d, getLevel(decoded?.progression as ProgressionState, 'hitpoints')),
    defaultValue: (decoded) =>
      createPlayerHp(getLevel(decoded.progression as ProgressionState, 'hitpoints')),
  },
  prayer: {
    key: 'prayer',
    serialize: serializePrayerPoints,
    deserialize: (d, decoded) =>
      deserializePrayerPoints(d, getLevel(decoded?.progression as ProgressionState, 'prayer')),
    defaultValue: (decoded) =>
      createPrayerPoints(getLevel(decoded.progression as ProgressionState, 'prayer')),
  },
});
