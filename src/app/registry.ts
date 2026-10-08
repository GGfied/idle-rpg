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
import type { GroundItemEvent, ItemRegistry } from '@core/items';
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
import { MINING_ITEMS, MINING_NODES, MINING_TOOLS } from '@features/skills/mining';
import { FISHING_ITEMS, FISHING_TOOLS } from '@features/skills/fishing';
import type { FishingEvent } from '@features/skills/fishing';
import { spawnNpcs } from '@features/npc';
import type { NpcInstance } from '@features/npc';
import {
  PLAYER_SPAWN,
  WORLD_NPC_SPAWNS,
  WORLD_OBJECT_SPAWNS,
  FISHING_SPOTS,
  WORLD_ROCKS,
  WORLD_TREES,
  createWorldCollisionGrid,
} from '@features/world';
import type { FishingSpotSpawn, ObjectSpawn, RockSpawn, TreeSpawn } from '@features/world';
import { createFishingSystem } from '@app/game/fishing';
import { createGroundSystem } from '@app/game/ground';
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
export type AppEvent =
  | GatherEvent
  | FishingEvent
  | MovementEvent
  | ProgressionEvent
  | CombatEvent
  | PrayerEvent
  | GroundItemEvent;

export interface Content {
  items: ItemRegistry;
  tools: ToolRegistry;
  gatherDefs: ReadonlyMap<string, GatherDef>;
  grid: CollisionGrid;
  trees: ReadonlyMap<string, TreeSpawn>;
  /** Mineable rocks by node id (same gather machinery as trees). */
  rocks: ReadonlyMap<string, RockSpawn>;
  /** Fishing spots by id; each hops between its candidate water tiles. */
  fishingSpots: ReadonlyMap<string, FishingSpotSpawn>;
  objects: ReadonlyMap<string, ObjectSpawn>;
  /** Placed NPCs by spawn id (idle: they never move, so this is content, not state). */
  npcs: ReadonlyMap<string, NpcInstance>;
  /** Per-spawn dialogue variables (e.g. { place: 'Fernhaven' }), from the spawn's `dialogueVars`. */
  npcDialogueVars?: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** Counters (booths) people may talk across. */
  isCounter(tile: Tile): boolean;
  spawn: Tile;
}

/** `dialogueVars` on an NPC spawn (added by map/npc); read structurally so either side can land first. */
interface SpawnVars {
  dialogueVars?: Readonly<Record<string, string>>;
}

export const CONTENT: Content = {
  items: createItemRegistry(WOODCUTTING_ITEMS, MINING_ITEMS, FISHING_ITEMS),
  tools: createToolRegistry(WOODCUTTING_TOOLS, MINING_TOOLS, FISHING_TOOLS),
  gatherDefs: new Map([...WOODCUTTING_NODES, ...MINING_NODES].map((d) => [d.id, d])),
  grid: createWorldCollisionGrid(WORLD_NPC_SPAWNS),
  trees: new Map(WORLD_TREES.map((t) => [t.nodeId, t])),
  rocks: new Map(WORLD_ROCKS.map((r) => [r.nodeId, r])),
  fishingSpots: new Map(FISHING_SPOTS.map((f) => [f.spotId, f])),
  objects: new Map(WORLD_OBJECT_SPAWNS.map((o) => [o.objectId, o])),
  npcs: new Map(spawnNpcs(WORLD_NPC_SPAWNS).map((n) => [n.spawnId, n])),
  npcDialogueVars: new Map(
    WORLD_NPC_SPAWNS.flatMap((s: (typeof WORLD_NPC_SPAWNS)[number] & SpawnVars) =>
      s.dialogueVars ? [[s.spawnId, s.dialogueVars] as const] : [],
    ),
  ),
  isCounter: (t) => WORLD_OBJECT_SPAWNS.some((o) => o.x === t.x && o.y === t.y),
  spawn: PLAYER_SPAWN,
};

/** Examine text per node def id (gather defs and fishing spot kinds) (placeholder until the owners ship examine text for nodes). */
export const NODE_EXAMINE: Readonly<Record<string, string>> = {
  tree: 'A common tree.',
  oak_tree: 'A sturdy oak tree.',
  copper_rock: 'A rock containing copper ore.',
  tin_rock: 'A rock containing tin ore.',
  iron_rock: 'A rock containing iron ore.',
  coal_rock: 'A rock streaked with black coal.',
  net_spot: 'Small fish are swimming here.',
  bait_spot: 'Fish are darting about in the deeper water here.',
};

/** Tick systems, run in this order every 600 ms. */
export const SYSTEMS: readonly System<GameState, AppEvent>[] = [
  createMovementSystem(CONTENT),
  createGatherSystem(CONTENT),
  createFishingSystem(CONTENT),
  createFacilitySystem(CONTENT),
  createNpcSystem(CONTENT),
  playTimeSystem,
  hpSystem,
  prayerSystem,
  createGroundSystem(CONTENT),
];

/** `meta` save slice: { playTimeMs } finite and >= 0, optional `grants` (string ids; absent in older saves). */
export const metaSlice: SaveSlice<MetaState> = {
  key: 'meta',
  serialize: (m) =>
    m.grants ? { playTimeMs: m.playTimeMs, grants: m.grants } : { playTimeMs: m.playTimeMs },
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
    const raw = (data as Record<string, unknown>).grants;
    const grants = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string').slice(0, 50)
      : undefined;
    return ok(grants ? { playTimeMs: value, grants } : { playTimeMs: value });
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
