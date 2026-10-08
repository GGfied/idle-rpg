import type { Tile } from '@core/contracts';

/** G grass, . path, ~ water, s sand, # wall, f flowers (decorative, walkable), = wooden floor (walkable), b bridge planks over water (walkable). */
export type TerrainKind =
  'grass' | 'path' | 'water' | 'sand' | 'wall' | 'flowers' | 'floor' | 'bridge';

/** Node definition ids; the woodcutting module defines GatherDefs with exactly these ids. */
export type TreeDefId = 'tree' | 'oak_tree';

export interface TreeSpawn {
  /** Unique node id for this placed tree, e.g. 'tree_1'. */
  readonly nodeId: string;
  readonly defId: TreeDefId;
  readonly x: number;
  readonly y: number;
}

/** Node definition ids; the mining module defines GatherDefs with exactly these ids. */
export type RockDefId = 'copper_rock' | 'tin_rock' | 'iron_rock' | 'coal_rock';

export interface RockSpawn {
  /** Unique node id for this placed rock, e.g. 'quarry_copper_1'. */
  readonly nodeId: string;
  readonly defId: RockDefId;
  readonly x: number;
  readonly y: number;
}

/** A fishing spot: fishing's `defId` plus the water tiles it may hop between (first = start). */
export interface FishingSpotSpawn {
  readonly spotId: string;
  readonly defId: 'net_spot' | 'bait_spot';
  readonly tiles: readonly Tile[];
}

/** Kinds of interactive world objects; the owning module (bank) handles each kind. */
export type ObjectKind = 'bank_chest' | 'bank_booth' | 'deposit_chest';

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
  /** Variables for this NPC's dialogue text, e.g. { place: 'Fernhaven' }. */
  readonly dialogueVars?: Readonly<Record<string, string>>;
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

/** Terrain kind of one tile (see TerrainKind). */
export type TileKind = TerrainKind;

/** Chunks are CHUNK_SIZE (32) x 32 tiles; chunk (cx, cy) covers world tiles cx*32.. and cy*32... */
export interface ChunkDef {
  readonly cx: number;
  readonly cy: number;
  /** CHUNK_SIZE*CHUNK_SIZE tile kinds, row-major: index = ly * CHUNK_SIZE + lx. */
  readonly tiles: readonly TileKind[];
  /** Same layout; 1 = blocked (water, walls, trees, objects). */
  readonly blocked: Uint8Array;
}

/** A placed tree, rock, object or NPC in global tile coordinates; `ref` is the owning module's id. */
export interface Spawn {
  readonly type: 'tree' | 'rock' | 'object' | 'npc';
  /** Unique placement id (nodeId / objectId / spawnId). */
  readonly id: string;
  /** Tree or rock def id, object kind or npc id. */
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  /** NPC wander radius; 0 for everything else. */
  readonly wanderRadius: number;
}

export interface WorldDef {
  readonly widthChunks: number;
  readonly heightChunks: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** The chunk at (cx, cy), or null outside the world. Chunks are built once and cached. */
  chunk(cx: number, cy: number): ChunkDef | null;
  /** True = blocked. Out of bounds (and non-integers) are blocked. */
  collisionAt(tx: number, ty: number): boolean;
  /** Tile kind at a global tile, or undefined out of bounds. */
  terrainAt(tx: number, ty: number): TileKind | undefined;
  readonly areas: readonly AreaZone[];
  readonly spawns: readonly Spawn[];
  readonly locations: Readonly<Record<string, NamedLocation>>;
  /** Walled structures; graphics draws a roof outside and the interior only when the player is inside. */
  readonly buildings: readonly BuildingDef[];
  /** Minimap text labels (regions and facilities). */
  readonly labels: readonly MapLabel[];
}

/** One rectangular ASCII stamp on the world. ' ' is transparent; 'T'/'O' are grass plus a tree/oak. */
export interface MapPatch {
  readonly id: string;
  readonly x0: number;
  readonly y0: number;
  readonly rows: readonly string[];
  /** Prefix for generated tree node ids ('forest' -> 'forest_tree_1'). Omit when trees are explicit. */
  readonly treePrefix?: string;
}

export type BuildingStyle = 'bank' | 'house' | 'hut';

export type RoofKind = 'slate' | 'thatch' | 'tile';

/** A walled building. `rect` is the footprint in global tiles including the walls. */
export interface BuildingDef {
  readonly id: string;
  readonly name: string;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Door tiles; each lies on the rect's edge. */
  readonly doors: readonly Tile[];
  readonly roof: RoofKind;
  /** Facade style graphics draws. */
  readonly style: BuildingStyle;
}

/** A minimap label at a global tile. `icon` is only set on facility labels. */
export interface MapLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'region' | 'facility';
  readonly icon?: 'bank';
}

/** Area-boundary edges for the whole world; bit 1 = right neighbour is another area, bit 2 = bottom neighbour is. */
export interface RegionEdges {
  readonly width: number;
  readonly height: number;
  /** Row-major, `y * width + x`. Tiles on the world's right/bottom edge never have the bit set. */
  readonly edges: Uint8Array;
}
