import type Phaser from 'phaser';
import type { Tile } from '@core/contracts';
import { createNpcView, createObjectView, createTreeView, isoProjection } from '@render/index';
import type { TreeView } from '@render/index';
import { getNpcDef } from '@features/npc';
import type { NpcInstance } from '@features/npc';
import type { ObjectSpawn, TreeSpawn } from '@features/world';
import { diffWindow, groupByChunk, windowKeys } from '@app/scenes/chunkWindow';
import type { ChunkGrid } from '@app/scenes/chunkWindow';

export interface ChunkViewsOptions {
  grid: ChunkGrid;
  /** Chunks around the player that get views (same radius as the ground renderer). */
  radius: number;
  trees: readonly TreeSpawn[];
  objects: readonly ObjectSpawn[];
  npcs: readonly NpcInstance[];
  /** Current stump state of a tree node, read when its view is created. */
  isStump(nodeId: string): boolean;
}

export interface Loaded {
  trees: TreeSpawn[];
  objects: ObjectSpawn[];
  npcs: NpcInstance[];
}

export interface ChunkViews {
  /** Move the window to the chunks around `tile`; returns true when views were created or destroyed. */
  ensureAround(tile: Tile): boolean;
  /** The live view of a tree, or undefined while its chunk is not loaded. */
  tree(nodeId: string): TreeView | undefined;
  /** Spawns whose chunk is loaded (for hit-testing). Same arrays until the window moves. */
  loaded(): Loaded;
  counts(): { chunks: number; trees: number; objects: number; npcs: number };
  destroyAll(): void;
}

interface Chunk {
  trees: Map<string, TreeView>;
  others: { destroy(): void }[];
  spawns: Loaded;
}

/**
 * Entity views per chunk: created only for chunks inside the window and destroyed when it moves on,
 * so a 128x96 world with hundreds of trees keeps a few dozen views alive. Tree node state is not
 * kept here (it lives in game state, keyed by id), so a tree comes back as it should be.
 */
export function createChunkViews(scene: Phaser.Scene, opts: ChunkViewsOptions): ChunkViews {
  const size = opts.grid.chunkSize;
  const trees = groupByChunk(opts.trees, size);
  const objects = groupByChunk(opts.objects, size);
  const npcs = groupByChunk(opts.npcs, size);
  const live = new Map<string, Chunk>();
  let current = new Set<string>();
  let cached: Loaded = { trees: [], objects: [], npcs: [] };

  const place = (v: { setWorldPosition(x: number, y: number): void }, t: Tile): void => {
    const feet = isoProjection.tileToWorld(t.x, t.y);
    v.setWorldPosition(feet.x, feet.y);
  };

  const load = (key: string): void => {
    const chunk: Chunk = {
      trees: new Map(),
      others: [],
      spawns: {
        trees: trees.get(key) ?? [],
        objects: objects.get(key) ?? [],
        npcs: npcs.get(key) ?? [],
      },
    };
    for (const t of chunk.spawns.trees) {
      const v = createTreeView(scene, t.defId);
      place(v, t);
      v.setDepleted(opts.isStump(t.nodeId));
      chunk.trees.set(t.nodeId, v);
    }
    for (const o of chunk.spawns.objects) {
      const v = createObjectView(scene, o.kind);
      place(v, o);
      chunk.others.push(v);
    }
    for (const n of chunk.spawns.npcs) {
      const def = getNpcDef(n.npcId);
      if (!def) continue;
      const v = createNpcView(scene, def.spriteKey, def.name);
      place(v, n);
      chunk.others.push(v);
    }
    live.set(key, chunk);
  };

  const drop = (key: string): void => {
    const c = live.get(key);
    if (!c) return;
    for (const v of c.trees.values()) v.destroy();
    for (const v of c.others) v.destroy();
    live.delete(key);
  };

  return {
    ensureAround(tile) {
      const next = windowKeys(tile, opts.radius, opts.grid);
      const { add, remove } = diffWindow(current, next);
      if (add.length === 0 && remove.length === 0) return false;
      for (const k of remove) drop(k);
      for (const k of add) load(k);
      current = next;
      cached = { trees: [], objects: [], npcs: [] };
      for (const c of live.values()) {
        cached.trees.push(...c.spawns.trees);
        cached.objects.push(...c.spawns.objects);
        cached.npcs.push(...c.spawns.npcs);
      }
      return true;
    },
    tree(nodeId) {
      for (const c of live.values()) {
        const v = c.trees.get(nodeId);
        if (v) return v;
      }
      return undefined;
    },
    loaded: () => cached,
    counts: () => ({
      chunks: live.size,
      trees: cached.trees.length,
      objects: cached.objects.length,
      npcs: cached.npcs.length,
    }),
    destroyAll() {
      for (const k of [...live.keys()]) drop(k);
      current = new Set();
      cached = { trees: [], objects: [], npcs: [] };
    },
  };
}
