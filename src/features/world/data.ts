import type { Tile } from '@core/contracts';
import type {
  AreaInfo,
  AreaZone,
  NamedLocation,
  NpcSpawn,
  ObjectSpawn,
  RegionData,
  TerrainKind,
  TreeSpawn,
} from './types';

/** ASCII legend: G grass, . path, ~ water, s sand, # wall, f flowers, = wooden floor. */
export const TERRAIN_LEGEND: Readonly<Record<string, TerrainKind>> = {
  G: 'grass',
  '.': 'path',
  '~': 'water',
  s: 'sand',
  '#': 'wall',
  f: 'flowers',
  '=': 'floor',
};

/** Terrain kinds that block movement. */
export const BLOCKING_TERRAIN: readonly TerrainKind[] = ['water', 'wall'];

export const MAP_ROWS: readonly string[] = [
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#######GGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGGGGGGGGGGGGGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGG#########GGGGGG#GGGGG#GGGs~~~~~',
  'GGGGGGGGG###=#=###GGGGGG###.###GGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGf#=======#.GGfGGGGG.GGfGGGs~~~~~',
  'GGGGGGGGG#=======#.GGGGGGGG.GGGGGGs~~~~~',
  'GGGGGGGGG####.####.GGGGGGGG.GGGGGGs~~~~~',
  'GGGG...............................~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGfGGGGG.GGGfGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGfGfGGGG.GGGGfGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'GGGGGGGGGGGGGGGGGG.GGGGGGGGGGGGGGGs~~~~~',
  'sssssssssssssssssssssssssssssssssss~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

export const WORLD: RegionData = {
  id: 'start_village',
  name: 'Willowbrook Green',
  width: 40,
  height: 30,
};

export const PLAYER_SPAWN: Tile = { x: 18, y: 15 };

const t = (nodeId: string, defId: TreeSpawn['defId'], x: number, y: number): TreeSpawn => ({
  nodeId,
  defId,
  x,
  y,
});

export const TREE_SPAWNS: readonly TreeSpawn[] = [
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
export const OBJECT_SPAWNS: readonly ObjectSpawn[] = [
  { objectId: 'bank_booth_1', kind: 'bank_booth', x: 12, y: 9 },
  { objectId: 'bank_booth_2', kind: 'bank_booth', x: 14, y: 9 },
];

/** NPCs standing on the enclosed staff tiles behind each bank booth (no wandering). */
export const NPC_SPAWNS: readonly NpcSpawn[] = [
  { spawnId: 'banker_1', npcId: 'banker', x: 12, y: 8, wanderRadius: 0 },
  { spawnId: 'banker_2', npcId: 'banker', x: 14, y: 8, wanderRadius: 0 },
];

export const namedLocations: Readonly<Record<string, NamedLocation>> = {
  start_village: { id: 'start_village', name: 'Willowbrook Green', tile: { x: 18, y: 15 } },
  oak_grove: { id: 'oak_grove', name: 'Oak Grove', tile: { x: 24, y: 21 } },
  hut_door: { id: 'hut_door', name: 'Old Hut', tile: { x: 27, y: 9 } },
  bank: { id: 'bank', name: 'Willowbrook Bank', tile: { x: 12, y: 10 } },
  lakeshore: { id: 'lakeshore', name: 'Lakeshore', tile: { x: 34, y: 15 } },
};

/** Fallback for tiles outside every zone. */
export const DEFAULT_AREA: AreaInfo = { id: 'wilds', kind: 'default', name: 'The Wilds' };

/**
 * Area zones in world tile coordinates, inclusive. The first zone containing a tile wins, so list
 * specific zones before broad ones. Rectangles use world coordinates, so a chunked world only
 * appends zones; nothing depends on chunk layout.
 */
export const AREA_ZONES: readonly AreaZone[] = [
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
