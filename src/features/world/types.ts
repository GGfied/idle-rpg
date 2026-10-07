import type { Tile } from '@core/contracts';

/** G grass, . path, ~ water, s sand, # wall, f flowers (decorative, walkable), = wooden floor (walkable). */
export type TerrainKind = 'grass' | 'path' | 'water' | 'sand' | 'wall' | 'flowers' | 'floor';

/** Node definition ids; the woodcutting module defines GatherDefs with exactly these ids. */
export type TreeDefId = 'tree' | 'oak_tree';

export interface TreeSpawn {
  /** Unique node id for this placed tree, e.g. 'tree_1'. */
  readonly nodeId: string;
  readonly defId: TreeDefId;
  readonly x: number;
  readonly y: number;
}

/** Kinds of interactive world objects; the owning module (bank) handles each kind. */
export type ObjectKind = 'bank_chest' | 'bank_booth';

export interface ObjectSpawn {
  /** Unique id for this placed object, e.g. 'bank_chest_1'. */
  readonly objectId: string;
  readonly kind: ObjectKind;
  readonly x: number;
  readonly y: number;
}

/** A placed NPC; `npcId` is owned by the npc module (e.g. 'banker'). */
export interface NpcSpawn {
  /** Unique id for this placed NPC, e.g. 'banker_1'. */
  readonly spawnId: string;
  readonly npcId: string;
  readonly x: number;
  readonly y: number;
  /** Tiles the NPC may wander from (x, y); 0 stands still. */
  readonly wanderRadius: number;
}

export interface RegionData {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface NamedLocation {
  readonly id: string;
  readonly name: string;
  readonly tile: Tile;
}

/** Ambient area category; the sound module maps each kind to ambience and music. */
export type AreaKind = 'village' | 'forest' | 'lake' | 'shore' | 'default';

/** What `areaAt` reports for a tile. */
export interface AreaInfo {
  readonly id: string;
  readonly kind: AreaKind;
  readonly name: string;
}

/** A named rectangle in world tile coordinates; x1/y1 are inclusive. */
export interface AreaZone extends AreaInfo {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
