export {
  AREA_ZONES,
  DEFAULT_AREA,
  NPC_SPAWNS,
  OBJECT_SPAWNS,
  PLAYER_SPAWN,
  TREE_SPAWNS,
  WORLD,
  namedLocations,
} from './data';
export { areaAt, createCollisionGrid, terrainAt } from './logic';
export type {
  AreaInfo,
  AreaKind,
  AreaZone,
  NamedLocation,
  NpcSpawn,
  ObjectKind,
  ObjectSpawn,
  RegionData,
  TerrainKind,
  TreeDefId,
  TreeSpawn,
} from './types';
