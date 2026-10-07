import type { CollisionGrid, Tile } from '@core/contracts';
import { pointKey } from '@core/utils';
import {
  AREA_ZONES,
  BUILDINGS,
  FACILITY_LABELS,
  BASE_TERRAIN_CHAR,
  BLOCKING_TERRAIN,
  CHUNK_SIZE,
  DEFAULT_AREA,
  TREE_SPAWNS,
  MAP_PATCHES,
  WORLD_NPC_SPAWNS,
  WORLD_OBJECT_SPAWNS,
  TERRAIN_LEGEND,
  TREE_CHARS,
  WORLD,
  WORLD_CHUNKS,
  namedLocations,
} from './data';
import type {
  AreaInfo,
  BuildingDef,
  ChunkDef,
  MapLabel,
  MapPatch,
  RegionEdges,
  Spawn,
  TerrainKind,
  TreeSpawn,
  WorldDef,
} from './types';

const toSpawn = (
  type: Spawn['type'],
  id: string,
  ref: string,
  x: number,
  y: number,
  wanderRadius = 0,
): Spawn => ({ type, id, ref, x, y, wanderRadius });

/** Stamp patches onto a char grid ( ' ' is transparent), remembering each tile's tree-id prefix. */
function compose(width: number, height: number, patches: readonly MapPatch[]) {
  const chars = Array.from({ length: height }, () => Array<string>(width).fill(BASE_TERRAIN_CHAR));
  const prefix = Array.from({ length: height }, () =>
    Array<string | undefined>(width).fill(undefined),
  );
  for (const p of patches) {
    p.rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === ' ') return;
        const x = p.x0 + i;
        const y = p.y0 + j;
        if (y >= height || x >= width) return;
        chars[y]![x] = ch;
        prefix[y]![x] = p.treePrefix;
      });
    });
  }
  return { chars, prefix };
}

/** Builds the world from the ASCII patches and placements. Pure; called once for WORLD_DEF. */
export function buildWorld(): WorldDef {
  const widthTiles = WORLD_CHUNKS.width * CHUNK_SIZE;
  const heightTiles = WORLD_CHUNKS.height * CHUNK_SIZE;
  const { chars, prefix } = compose(widthTiles, heightTiles, MAP_PATCHES);

  const counters: Record<string, number> = {};
  const spawns: Spawn[] = TREE_SPAWNS.map((s) => toSpawn('tree', s.nodeId, s.defId, s.x, s.y));
  for (let y = 0; y < heightTiles; y++) {
    for (let x = 0; x < widthTiles; x++) {
      const def = TREE_CHARS[chars[y]![x]!];
      const pre = prefix[y]![x];
      if (!def || !pre) continue;
      const n = (counters[`${pre}_${def}`] = (counters[`${pre}_${def}`] ?? 0) + 1);
      spawns.push(toSpawn('tree', `${pre}_${def === 'tree' ? 'tree' : 'oak'}_${n}`, def, x, y));
    }
  }
  for (const o of WORLD_OBJECT_SPAWNS) spawns.push(toSpawn('object', o.objectId, o.kind, o.x, o.y));
  for (const n of WORLD_NPC_SPAWNS)
    spawns.push(toSpawn('npc', n.spawnId, n.npcId, n.x, n.y, n.wanderRadius));

  const kinds: TerrainKind[] = chars.flatMap((row) => row.map((c) => TERRAIN_LEGEND[c] ?? 'grass'));
  const blockedAll = new Uint8Array(widthTiles * heightTiles);
  kinds.forEach((k, i) => {
    if (BLOCKING_TERRAIN.includes(k)) blockedAll[i] = 1;
  });
  for (const s of spawns) {
    if (s.type !== 'npc') blockedAll[s.y * widthTiles + s.x] = 1;
  }

  const inBounds = (x: number, y: number) =>
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < widthTiles &&
    y < heightTiles;
  const cache = new Map<number, ChunkDef>();

  return {
    widthChunks: WORLD_CHUNKS.width,
    heightChunks: WORLD_CHUNKS.height,
    widthTiles,
    heightTiles,
    chunk(cx, cy) {
      if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
      if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS.width || cy >= WORLD_CHUNKS.height) return null;
      const key = cy * WORLD_CHUNKS.width + cx;
      let c = cache.get(key);
      if (!c) {
        const tiles: TerrainKind[] = [];
        const blocked = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const i = (cy * CHUNK_SIZE + ly) * widthTiles + cx * CHUNK_SIZE + lx;
            tiles.push(kinds[i]!);
            blocked[ly * CHUNK_SIZE + lx] = blockedAll[i]!;
          }
        }
        c = { cx, cy, tiles, blocked };
        cache.set(key, c);
      }
      return c;
    },
    collisionAt: (x, y) => !inBounds(x, y) || blockedAll[y * widthTiles + x] === 1,
    terrainAt: (x, y) => (inBounds(x, y) ? kinds[y * widthTiles + x] : undefined),
    areas: AREA_ZONES,
    spawns,
    locations: namedLocations,
    buildings: BUILDINGS,
    get labels() {
      return MAP_LABELS;
    },
  };
}

export const WORLD_DEF: WorldDef = buildWorld();

/** Spawns of one type, as a typed view for consumers that want the old per-kind shapes. */
export const WORLD_TREES: readonly TreeSpawn[] = WORLD_DEF.spawns
  .filter((s) => s.type === 'tree')
  .map((s) => ({ nodeId: s.id, defId: s.ref as TreeSpawn['defId'], x: s.x, y: s.y }));

/** Legacy: the village's 40x30 terrain; undefined outside it. Use WORLD_DEF.terrainAt for the world. */
export function terrainAt(x: number, y: number): TerrainKind | undefined {
  if (x < 0 || y < 0 || x >= WORLD.width || y >= WORLD.height) return undefined;
  return WORLD_DEF.terrainAt(x, y);
}

/** Legacy 40x30 village grid. `blockers` adds extra blocked tiles (e.g. other entities). */
export function createCollisionGrid(blockers: readonly Tile[] = []): CollisionGrid {
  return gridOf(WORLD.width, WORLD.height, blockers);
}

/** Whole-world walkability grid (128x96) for movement across chunk borders. */
export function createWorldCollisionGrid(blockers: readonly Tile[] = []): CollisionGrid {
  return gridOf(WORLD_DEF.widthTiles, WORLD_DEF.heightTiles, blockers);
}

function gridOf(width: number, height: number, blockers: readonly Tile[]): CollisionGrid {
  const extra = new Set(blockers.map(pointKey));
  return {
    width,
    height,
    isWalkable(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      return !WORLD_DEF.collisionAt(x, y) && !extra.has(`${x},${y}`);
    },
  };
}

/** The area containing a tile: the first matching zone, else the default area. */
export function areaAt(x: number, y: number): AreaInfo {
  const zone = AREA_ZONES.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  return zone ? { id: zone.id, kind: zone.kind, name: zone.name } : DEFAULT_AREA;
}

/** The building whose footprint (walls included) contains the tile, else null. */
export function buildingAt(tx: number, ty: number): BuildingDef | null {
  return (
    BUILDINGS.find(({ rect: r }) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) ??
    null
  );
}

interface AreaGrid {
  readonly width: number;
  readonly height: number;
  /** Index into `names` (distinct area names) for every tile. */
  readonly cells: Uint16Array;
  readonly names: readonly string[];
  readonly firstId: readonly string[];
}

let areaGridCache: AreaGrid | undefined;

/** Effective area of every tile (first zone wins, DEFAULT_AREA elsewhere), one cell per tile. Zones with the same name are one area. */
function areaGrid(): AreaGrid {
  if (areaGridCache) return areaGridCache;
  const { widthTiles: width, heightTiles: height } = WORLD_DEF;
  const names: string[] = [];
  const firstId: string[] = [];
  const cells = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = areaAt(x, y);
      let n = names.indexOf(a.name);
      if (n < 0) {
        n = names.length;
        names.push(a.name);
        firstId.push(a.id);
      }
      cells[y * width + x] = n;
    }
  }
  areaGridCache = { width, height, cells, names, firstId };
  return areaGridCache;
}

let edgesCache: RegionEdges | undefined;

/** Precomputed boundary bits (see RegionEdges) for cheap minimap drawing. Built once. */
export function regionEdges(): RegionEdges {
  if (edgesCache) return edgesCache;
  const { width, height, cells } = areaGrid();
  const edges = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width && cells[i] !== cells[i + 1]) edges[i] = edges[i]! | 1;
      if (y + 1 < height && cells[i] !== cells[i + width]) edges[i] = edges[i]! | 2;
    }
  }
  edgesCache = { width, height, edges };
  return edgesCache;
}

/** True when the tile's right or bottom neighbour belongs to a different area. False out of bounds and on the world's far edges. */
export function regionBoundaryAt(tx: number, ty: number): boolean {
  const { width, height, edges } = regionEdges();
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
  return edges[ty * width + tx] !== 0;
}

/** Parts smaller than this many tiles get no label. */
export const LABEL_MIN_PART = 40;
/** Parts of one area closer than this (tiles) share the larger part's label. */
export const LABEL_MIN_GAP = 24;

/** Inside a labelled part, any tile farther than this from every label of its area gets another one. */
export const LABEL_COVER = 40;

interface AreaPart {
  readonly size: number;
  readonly x: number;
  readonly y: number;
  /** Every tile index of the part. */
  readonly tiles: readonly number[];
}

/** The 4-connected parts of area `n`; each with its tile nearest the part's centroid (so inside the part). */
function areaParts(grid: AreaGrid, n: number): AreaPart[] {
  const { width, cells } = grid;
  const seen = new Uint8Array(cells.length);
  const parts: AreaPart[] = [];
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] !== n || seen[s]) continue;
    const part = [s];
    seen[s] = 1;
    for (let k = 0; k < part.length; k++) {
      const i = part[k]!;
      const x = i % width;
      const nb = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width];
      for (const j of nb) {
        if (j >= 0 && j < cells.length && cells[j] === n && !seen[j]) {
          seen[j] = 1;
          part.push(j);
        }
      }
    }
    const cx = part.reduce((a, i) => a + (i % width), 0) / part.length;
    const cy = part.reduce((a, i) => a + Math.floor(i / width), 0) / part.length;
    let pick = part[0]!;
    let bestD = Infinity;
    for (const i of part) {
      const d = ((i % width) - cx) ** 2 + (Math.floor(i / width) - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        pick = i;
      }
    }
    parts.push({
      size: part.length,
      x: pick % width,
      y: Math.floor(pick / width),
      tiles: part,
    });
  }
  return parts;
}

/**
 * Minimap labels: one region label per 4-connected part of an area with at least LABEL_MIN_PART
 * tiles, at the part's centroid-nearest tile; of same-area parts closer than LABEL_MIN_GAP only the
 * larger keeps a label; tiles of a kept part farther than LABEL_COVER from every label get one more. Zones sharing a name are one area. Building zones (a bank's interior) are
 * skipped; their facility label covers them.
 */
function deriveLabels(): readonly MapLabel[] {
  const grid = areaGrid();
  const buildingIds = new Set(BUILDINGS.map((b) => b.id));
  const regions: MapLabel[] = [];
  grid.names.forEach((text, n) => {
    if (buildingIds.has(grid.firstId[n]!)) return;
    const kept: AreaPart[] = [];
    const big = areaParts(grid, n)
      .filter((p) => p.size >= LABEL_MIN_PART)
      .sort((a, b) => b.size - a.size);
    for (const p of big) {
      if (kept.every((k) => Math.hypot(k.x - p.x, k.y - p.y) >= LABEL_MIN_GAP)) kept.push(p);
    }
    for (const p of kept) {
      // Cover long or sprawling parts: add labels where nothing is within LABEL_COVER.
      for (const i of p.tiles) {
        const x = i % grid.width;
        const y = Math.floor(i / grid.width);
        if (kept.every((k) => Math.hypot(k.x - x, k.y - y) > LABEL_COVER)) {
          kept.push({ ...p, x, y });
        }
      }
    }
    for (const p of kept) regions.push({ text, x: p.x, y: p.y, kind: 'region' });
  });
  return [...regions, ...FACILITY_LABELS];
}

export const MAP_LABELS: readonly MapLabel[] = deriveLabels();
