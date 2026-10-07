import type { Tile } from '@core/contracts';
import type {
  AreaInfo,
  AreaZone,
  BuildingDef,
  MapLabel,
  MapPatch,
  NamedLocation,
  NpcSpawn,
  ObjectSpawn,
  RegionData,
  TerrainKind,
  TreeSpawn,
} from './types';
import { FERNHAVEN_ROWS, FERNHAVEN_X0, FERNHAVEN_Y0 } from './areas/fernhaven';
import { FOREST_ROWS, FOREST_X0, FOREST_Y0 } from './areas/forest';
import { LAKE_ROWS, LAKE_X0, LAKE_Y0 } from './areas/lake';
import { VILLAGE_ROWS } from './areas/village';

const t = (nodeId: string, defId: TreeSpawn['defId'], x: number, y: number): TreeSpawn => ({
  nodeId,
  defId,
  x,
  y,
});

export const VILLAGE_TREES: readonly TreeSpawn[] = [
  t('tree_1', 'tree', 15, 18),
  t('tree_2', 'tree', 16, 19),
  t('tree_3', 'tree', 15, 20),
  t('tree_4', 'tree', 14, 21),
  t('tree_5', 'tree', 16, 21),
  t('tree_6', 'tree', 21, 10),
  t('tree_7', 'tree', 23, 10),
  t('tree_8', 'tree', 22, 11),
  t('tree_9', 'tree', 20, 9),
  t('tree_10', 'tree', 6, 12),
  t('tree_11', 'tree', 7, 13),
  t('tree_12', 'tree', 5, 13),
  t('oak_1', 'oak_tree', 22, 21),
  t('oak_2', 'oak_tree', 24, 22),
  t('oak_3', 'oak_tree', 23, 23),
  t('oak_4', 'oak_tree', 26, 20),
];

/** Interactive objects. They block movement; players use them from an adjacent tile. */
export const VILLAGE_OBJECTS: readonly ObjectSpawn[] = [
  { objectId: 'bank_booth_1', kind: 'bank_booth', x: 12, y: 9 },
  { objectId: 'bank_booth_2', kind: 'bank_booth', x: 14, y: 9 },
];

/** NPCs standing on the enclosed staff tiles behind each bank booth (no wandering). */
export const VILLAGE_NPCS: readonly NpcSpawn[] = [
  { spawnId: 'banker_1', npcId: 'banker', x: 12, y: 8, wanderRadius: 0 },
  { spawnId: 'banker_2', npcId: 'banker_f', x: 14, y: 8, wanderRadius: 0 },
];

export const VILLAGE_LOCATIONS: Readonly<Record<string, NamedLocation>> = {
  start_village: { id: 'start_village', name: 'Willowbrook Green', tile: { x: 18, y: 15 } },
  oak_grove: { id: 'oak_grove', name: 'Oak Grove', tile: { x: 24, y: 21 } },
  hut_door: { id: 'hut_door', name: 'Old Hut', tile: { x: 27, y: 9 } },
  bank: { id: 'bank', name: 'Willowbrook Bank', tile: { x: 12, y: 10 } },
  lakeshore: { id: 'lakeshore', name: 'Lakeshore', tile: { x: 34, y: 15 } },
};

/**
 * Area zones in world tile coordinates, inclusive. The first zone containing a tile wins, so list
 * specific zones before broad ones. Rectangles use world coordinates, so a chunked world only
 * appends zones; nothing depends on chunk layout.
 */
export const VILLAGE_AREAS: readonly AreaZone[] = [
  {
    id: 'willowbrook_bank',
    kind: 'village',
    name: 'Willowbrook Bank',
    x0: 10,
    y0: 8,
    x1: 16,
    y1: 13,
  },
  { id: 'willowbrook', kind: 'village', name: 'Willowbrook Green', x0: 12, y0: 3, x1: 30, y1: 17 },
  { id: 'oak_grove', kind: 'forest', name: 'Oak Grove', x0: 12, y0: 18, x1: 28, y1: 24 },
  { id: 'west_copse', kind: 'forest', name: 'West Copse', x0: 3, y0: 10, x1: 9, y1: 15 },
  { id: 'east_lake', kind: 'lake', name: 'Mirror Lake', x0: 34, y0: 0, x1: 39, y1: 24 },
  { id: 'south_shore', kind: 'shore', name: 'Southern Shore', x0: 0, y0: 25, x1: 39, y1: 29 },
];

/** ASCII legend: G grass, . path, ~ water, s sand, # wall, f flowers, = wooden floor, b bridge. T/O = grass + tree/oak. */
export const TERRAIN_LEGEND: Readonly<Record<string, TerrainKind>> = {
  G: 'grass',
  '.': 'path',
  '~': 'water',
  s: 'sand',
  '#': 'wall',
  f: 'flowers',
  '=': 'floor',
  b: 'bridge',
  T: 'grass',
  O: 'grass',
};

/** Legend chars that also place a tree, with the woodcutting node def id. */
export const TREE_CHARS: Readonly<Record<string, 'tree' | 'oak_tree'>> = {
  T: 'tree',
  O: 'oak_tree',
};

/** Terrain kinds that block movement. */
export const BLOCKING_TERRAIN: readonly TerrainKind[] = ['water', 'wall'];

/** Chunk edge length in tiles. */
export const CHUNK_SIZE = 32;

/** World size in chunks (4x3 chunks of 32x32 = 128x96 tiles). */
export const WORLD_CHUNKS = { width: 4, height: 3 } as const;

/** Terrain used where no patch paints. */
export const BASE_TERRAIN_CHAR = 'G';

/** Patches stamped in order; later patches overwrite earlier ones. The village goes last so it is exact. */
export const MAP_PATCHES: readonly MapPatch[] = [
  { id: 'lake', x0: LAKE_X0, y0: LAKE_Y0, rows: LAKE_ROWS, treePrefix: 'shore' },
  { id: 'forest', x0: FOREST_X0, y0: FOREST_Y0, rows: FOREST_ROWS, treePrefix: 'forest' },
  { id: 'fernhaven', x0: FERNHAVEN_X0, y0: FERNHAVEN_Y0, rows: FERNHAVEN_ROWS, treePrefix: 'fern' },
  { id: 'village', x0: 0, y0: 0, rows: VILLAGE_ROWS },
];

/** The original 40x30 village region; legacy consumers still use it. */
export const WORLD: RegionData = {
  id: 'start_village',
  name: 'Willowbrook Green',
  width: 40,
  height: 30,
};

export const PLAYER_SPAWN: Tile = { x: 18, y: 15 };

/** Legacy names: the village's 40x30 rows and its trees, objects and NPCs (original ids). */
export const MAP_ROWS = VILLAGE_ROWS;
export const OBJECT_SPAWNS = VILLAGE_OBJECTS;
export const NPC_SPAWNS = VILLAGE_NPCS;
export const TREE_SPAWNS = VILLAGE_TREES;

/** Interactive objects. They block movement; players use them from an adjacent tile. */
export const WORLD_OBJECT_SPAWNS: readonly ObjectSpawn[] = [
  ...VILLAGE_OBJECTS,
  // Fernhaven bank (building at 90..98, 60..67)
  { objectId: 'bank_booth_3', kind: 'bank_booth', x: 93, y: 62 },
  { objectId: 'bank_booth_4', kind: 'bank_booth', x: 95, y: 62 },
];

/** NPCs standing on the enclosed staff tiles behind each bank booth (no wandering). */
export const WORLD_NPC_SPAWNS: readonly NpcSpawn[] = [
  ...VILLAGE_NPCS,
  {
    spawnId: 'banker_3',
    npcId: 'banker',
    x: 93,
    y: 61,
    wanderRadius: 0,
    dialogueVars: { place: 'Fernhaven' },
  },
  {
    spawnId: 'banker_4',
    npcId: 'banker_f',
    x: 95,
    y: 61,
    wanderRadius: 0,
    dialogueVars: { place: 'Fernhaven' },
  },
];

export const namedLocations: Readonly<Record<string, NamedLocation>> = {
  ...VILLAGE_LOCATIONS,
  causeway: { id: 'causeway', name: 'Lake Causeway', tile: { x: 37, y: 15 } },
  whispering_wood: { id: 'whispering_wood', name: 'Whispering Wood', tile: { x: 48, y: 15 } },
  oak_ridge: { id: 'oak_ridge', name: 'Oak Ridge', tile: { x: 66, y: 10 } },
  greatmere_shore: { id: 'greatmere_shore', name: 'Greatmere Shore', tile: { x: 30, y: 53 } },
  fernhaven: { id: 'fernhaven', name: 'Fernhaven', tile: { x: 102, y: 69 } },
  fernhaven_bank: { id: 'fernhaven_bank', name: 'Fernhaven Bank', tile: { x: 94, y: 68 } },
};

/** Fallback for tiles outside every zone. */
export const DEFAULT_AREA: AreaInfo = { id: 'wilds', kind: 'default', name: 'The Wilds' };

/**
 * Area zones in world tile coordinates, inclusive; the first zone containing a tile wins. The
 * original village zones come first and stay untouched; new zones are appended.
 */
export const AREA_ZONES: readonly AreaZone[] = [
  ...VILLAGE_AREAS,
  { id: 'oak_ridge', kind: 'forest', name: 'Oak Ridge', x0: 62, y0: 0, x1: 79, y1: 25 },
  { id: 'whispering_wood', kind: 'forest', name: 'Whispering Wood', x0: 40, y0: 0, x1: 79, y1: 25 },
  { id: 'greatmere_shore', kind: 'shore', name: 'Greatmere Shore', x0: 0, y0: 52, x1: 79, y1: 55 },
  { id: 'greatmere', kind: 'lake', name: 'Greatmere', x0: 0, y0: 26, x1: 62, y1: 51 },
  {
    id: 'fernhaven_bank',
    kind: 'village',
    name: 'Fernhaven Bank',
    x0: 89,
    y0: 59,
    x1: 99,
    y1: 68,
  },
  { id: 'fernhaven', kind: 'village', name: 'Fernhaven', x0: 82, y0: 55, x1: 114, y1: 75 },
];

/** Walled structures; rects derived from the wall tiles in the ASCII patches (door on the edge). */
export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'willowbrook_bank',
    name: 'Willowbrook Bank',
    rect: { x: 9, y: 7, w: 9, h: 8 },
    doors: [{ x: 13, y: 14 }],
    roof: 'slate',
    style: 'bank',
  },
  {
    id: 'old_hut',
    name: 'Old Hut',
    rect: { x: 24, y: 4, w: 7, h: 5 },
    doors: [{ x: 27, y: 8 }],
    roof: 'thatch',
    style: 'hut',
  },
  {
    id: 'fernhaven_bank',
    name: 'Fernhaven Bank',
    rect: { x: 90, y: 60, w: 9, h: 8 },
    doors: [{ x: 94, y: 67 }],
    roof: 'tile',
    style: 'bank',
  },
];

/** Facility minimap labels (icon 'bank', at the booth group). Region labels are derived in logic.ts. */
export const FACILITY_LABELS: readonly MapLabel[] = [
  { text: 'Willowbrook Bank', x: 13, y: 9, kind: 'facility', icon: 'bank' },
  { text: 'Fernhaven Bank', x: 94, y: 62, kind: 'facility', icon: 'bank' },
];
