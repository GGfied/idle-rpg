import type Phaser from 'phaser';
import { LAYERS } from './depth';
import { createChunkCache, type ChunkCache, type ChunkSource, type GetChunk } from './chunkCache';
import { DEFAULT_PALETTE, type TilePalette } from './palette';
import { visibleChunks, type ViewRect } from './chunkVisible';
import { createFlowerSway } from './animation/flowerSway';
import type { MotionMode } from './animation/types';
import { ensureFlowerTextures, flowersForTile, placeFlower, type FlowerSpec } from './flowers';
import {
  ensureGroundTextures,
  getGroundTexture,
  tintFor,
  variantFor,
  type GroundKind,
} from './groundTextures';
import { isoProjection } from './projection';
import { drawTinted, type FrameRect } from './canvasStamp';
import { rendererHasGradients, shoreField } from './waterShade';
import { bridgeSides, placeRail, railPlacements } from './bridge';
import { paintGround, placeWall, regionBounds, type TileRegion } from './tilemap';
import { WORLD_BACKDROP, edgeLayerAlphas, edgeLayerPoly } from './worldEdge';

export interface ChunkRendererOptions {
  widthChunks: number;
  heightChunks: number;
  /** Tiles per chunk side (CHUNK_SIZE = 32). */
  chunkSize: number;
  palette?: TilePalette;
  /** Wall tiles drawn by something else (building renderer): no grey wall block here. Collision is untouched. */
  skipWall?: (tx: number, ty: number) => boolean;
  /**
   * Terrain kind at any GLOBAL tile (e.g. WORLD_DEF.terrainAt). Used only to look at neighbours across
   * chunk borders (edge blending, bridge rails, shore foam); without it chunk-edge tiles treat the
   * neighbouring chunk as unknown and draw no blend there.
   */
  terrainAt?: (tx: number, ty: number) => string | undefined;
  /** Use the procedural ground textures (default true). false = flat palette diamonds. */
  textured?: boolean;
  /**
   * Called once when a flower Image is first created (they are pooled and reused, so not again per
   * placement). `img.getData('flower')` is the FlowerData of its CURRENT placement (tile, variety,
   * stem-base px); sway should rotate/skew around the base (origin is bottom-middle) and reset to 0
   * when the data changes. Pair with `isFlowerActive` to skip pooled-away ones.
   */
  onFlowerCreated?: (img: Phaser.GameObjects.Image) => void;
  /**
   * Current Animations setting for the built-in flower sway (animation's `createFlowerSway`, driven
   * from the scene 'update' event). Default 'on'; pass `() => prefs.visuals.animations` to honour Off/Reduced.
   */
  motion?: () => MotionMode;
}

export interface ChunkRenderer {
  /** Keep the (2*radius+1)^2 chunks around the centre tile drawn; cheap when the centre chunk is unchanged. */
  ensureAround(
    centreTx: number,
    centreTy: number,
    radius: number | undefined,
    getChunk: GetChunk,
  ): void;
  /**
   * Keep ground RenderTextures only for chunks whose iso bounds touch `view` (world px, e.g. camera
   * worldView) grown by `margin` px. Pooled RTs are reused. No-op while the chunk set is unchanged.
   */
  ensureVisible(view: ViewRect, margin: number, getChunk: GetChunk): void;
  invalidate(): void;
  destroyAll(): void;
  /** Debug/test: chunks currently painted. */
  loaded(): number;
  /** Flower Images currently placed (visible chunks only), for sway/animation hooks. */
  flowers(): readonly Phaser.GameObjects.Image[];
  /** Debug/test: chunk RenderTextures ever created. */
  created(): number;
}

interface ChunkRes {
  rt: Phaser.GameObjects.RenderTexture;
  walls: Phaser.GameObjects.Image[];
  rails: Phaser.GameObjects.Image[];
  flowers: Phaser.GameObjects.Image[];
}

/** Ground diamonds overhang their tile by up to 2 px (seam grow); pad so chunk edges stay sealed. */
const PAD = 2;
/** PAD px overhang in tile units (a tile is 64 x 32 px, so 2 px is ~0.06 tile; rounded up). */
const SKIRT_SEAM = 0.05;
const GROUND_HALF_W = 32;
const GROUND_HALF_H = 16;

/**
 * Chunked iso ground: one pooled RenderTexture per loaded chunk (all the same size, so they are
 * repainted in place, never reallocated) plus pooled wall-block Images depth-sorted with entities.
 */
export function createChunkRenderer(
  scene: Phaser.Scene,
  opts: ChunkRendererOptions,
): ChunkRenderer {
  const palette = opts.palette ?? DEFAULT_PALETTE;
  const size = opts.chunkSize;
  const g = scene.make.graphics({}, false);
  const waterG = scene.make.graphics({}, false);
  const queueKinds: GroundKind[] = [];
  const queueXY: number[] = [];
  const wallPool: Phaser.GameObjects.Image[] = [];
  const railPool: Phaser.GameObjects.Image[] = [];
  const flowerPool: Phaser.GameObjects.Image[] = [];
  const active = new Set<Phaser.GameObjects.Image>();
  const specs: FlowerSpec[] = [];
  ensureFlowerTextures(scene);
  const sway = createFlowerSway(() => opts.motion?.() ?? 'on');
  const onSwayUpdate = (time: number) => sway.update(time, scene.cameras.main.worldView);
  scene.events.on('update', onSwayUpdate);
  const textured = opts.textured !== false;
  if (textured) ensureGroundTextures(scene);

  const regionOf = (c: ChunkSource): TileRegion => {
    const x0 = c.cx * size;
    const y0 = c.cy * size;
    return {
      x0,
      y0,
      width: size,
      height: size,
      // Only this chunk's own tiles: outside it is unknown (never a wrapped row of the same array).
      kindAt: (x, y) =>
        x < x0 || y < y0 || x >= x0 + size || y >= y0 + size
          ? opts.terrainAt?.(x, y)
          : c.tiles[(y - y0) * size + (x - x0)],
    };
  };

  const dropWalls = (res: ChunkRes) => {
    for (const w of res.walls) {
      w.setVisible(false);
      wallPool.push(w);
    }
    res.walls.length = 0;
    for (const w of res.rails) {
      w.setVisible(false);
      railPool.push(w);
    }
    res.rails.length = 0;
    for (const f of res.flowers) {
      f.setVisible(false);
      active.delete(f);
      flowerPool.push(f);
    }
    res.flowers.length = 0;
  };

  /** Paint one region's ground (textured or flat) into a pooled RenderTexture; true if any wall was seen. */
  const paintRt = (rt: Phaser.GameObjects.RenderTexture, r: TileRegion): boolean => {
    const b = regionBounds(r, PAD);
    g.clear();
    rt.setPosition(b.x, b.y).setVisible(true).clear();
    let anyWall: boolean;
    if (textured) {
      // Layers, bottom to top: shaded water base, ground texture stamps (queued by paintGround),
      // then the vector layer (tufts, bridge, foam, wet sand).
      waterG.clear();
      queueKinds.length = 0;
      queueXY.length = 0;
      const webgl = rendererHasGradients(scene);
      anyWall = paintGround(
        g,
        r,
        b,
        palette,
        (kind, tx, ty, cx, cy) => {
          queueKinds.push(kind);
          queueXY.push(tx, ty, cx, cy);
        },
        {
          base: waterG,
          field: shoreField(r.kindAt, r.x0, r.y0, size, size),
          gradient: webgl,
        },
      );
      // CANVAS ignores batchDrawFrame's tint: multiply it in by hand (canvasStamp.ts).
      const ctx = webgl ? null : (rt.texture as Phaser.Textures.DynamicTexture).context;
      rt.draw(waterG);
      rt.beginDraw();
      for (let i = 0; i < queueKinds.length; i++) {
        const kind = queueKinds[i]!;
        const tx = queueXY[i * 4]!;
        const ty = queueXY[i * 4 + 1]!;
        const key = getGroundTexture(scene, kind, variantFor(tx, ty, kind));
        const x = queueXY[i * 4 + 2]! - GROUND_HALF_W;
        const y = queueXY[i * 4 + 3]! - GROUND_HALF_H;
        const tint = tintFor(tx, ty, kind);
        if (ctx) {
          const f = scene.textures.getFrame(key);
          drawTinted(
            ctx,
            f.source.image as CanvasImageSource,
            f.canvasData as FrameRect,
            x,
            y,
            tint,
          );
        } else rt.batchDrawFrame(key, undefined, x, y, 1, tint);
      }
      rt.endDraw();
    } else anyWall = paintGround(g, r, b, palette);

    rt.draw(g);
    return anyWall;
  };

  const cache: ChunkCache = createChunkCache<ChunkRes>(opts, {
    create: () => ({
      rt: scene.add
        .renderTexture(0, 0, regionBoundsSize(size).width, regionBoundsSize(size).height)
        .setOrigin(0, 0)
        .setDepth(LAYERS.GROUND),
      walls: [],
      rails: [],
      flowers: [],
    }),
    paint(res, chunk) {
      const r = regionOf(chunk);
      const anyWall = paintRt(res.rt, r);
      dropWalls(res);
      for (let y = r.y0; y < r.y0 + size; y++) {
        for (let x = r.x0; x < r.x0 + size; x++) {
          const k = r.kindAt(x, y);
          if (k === 'wall' && anyWall && !opts.skipWall?.(x, y))
            res.walls.push(placeWall(scene, wallPool.pop(), x, y));
          else if (k === 'flowers')
            for (const f of flowersForTile(x, y, specs)) {
              const reuse = flowerPool.pop();
              const img = placeFlower(scene, reuse, x, y, f);
              if (!reuse) {
                sway.add(img);
                opts.onFlowerCreated?.(img);
              }
              res.flowers.push(img);
              active.add(img);
            }
          else if (k === 'bridge')
            for (const p of railPlacements(x, y, bridgeSides(r.kindAt, x, y)))
              res.rails.push(placeRail(scene, railPool.pop(), p));
        }
      }
    },
    release(res) {
      res.rt.setVisible(false);
      dropWalls(res);
    },
    destroy(res) {
      res.rt.destroy();
      res.walls.forEach((w) => w.destroy());
      res.rails.forEach((w) => w.destroy());
      res.flowers.forEach((w) => w.destroy());
    },
  });

  // World-edge skirt: one extra ring of chunks of REAL ground (edge terrain continued outward), covered
  // by nested backdrop layers so the map fades out instead of ending in a flat stripe (worldEdge.ts).
  const cols = opts.widthChunks * size;
  const rows = opts.heightChunks * size;
  const clampKind = (x: number, y: number): string => {
    const k = opts.terrainAt?.(
      Math.min(cols - 1, Math.max(0, x)),
      Math.min(rows - 1, Math.max(0, y)),
    );
    return k === undefined || k === 'wall' || k === 'flowers'
      ? 'grass'
      : k === 'bridge'
        ? 'water'
        : k;
  };
  const alphas = edgeLayerAlphas();
  const skirt: ChunkCache | undefined = opts.terrainAt
    ? createChunkCache<ChunkRes>(
        { ...opts, widthChunks: opts.widthChunks + 2, heightChunks: opts.heightChunks + 2 },
        {
          create: () => ({
            rt: scene.add
              .renderTexture(0, 0, regionBoundsSize(size).width, regionBoundsSize(size).height)
              .setOrigin(0, 0)
              .setDepth(LAYERS.GROUND),
            walls: [],
            rails: [],
            flowers: [],
          }),
          paint(res, chunk) {
            const x0 = chunk.cx * size;
            const y0 = chunk.cy * size;
            const r: TileRegion = { x0, y0, width: size, height: size, kindAt: clampKind };
            paintRt(res.rt, r);
            const b = regionBounds(r, PAD);
            // grown by the ground's PAD overhang so the overhanging pixels are faded too (else a light hairline
            // shows along the chunk seams where a neighbour's unfaded overhang lands on faded ground)
            const clip = {
              x0: x0 - 0.5 - SKIRT_SEAM,
              y0: y0 - 0.5 - SKIRT_SEAM,
              x1: x0 + size - 0.5 + SKIRT_SEAM,
              y1: y0 + size - 0.5 + SKIRT_SEAM,
            };
            g.clear();
            for (let j = 0; j < alphas.length; j++) {
              const q = edgeLayerPoly(j, cols, rows, clip);
              if (!q || q.length === 0) continue;
              g.fillStyle(WORLD_BACKDROP, alphas[j]!);
              g.fillPoints(
                q.map(([tx, ty]) => {
                  const w = isoProjection.tileToWorld(tx, ty);
                  return { x: w.x - b.x, y: w.y - b.y };
                }),
                true,
              );
            }
            res.rt.draw(g);
          },
          release: (res) => res.rt.setVisible(false),
          destroy: (res) => res.rt.destroy(),
        },
      )
    : undefined;
  const skirtChunk: GetChunk = (i, j) => ({ cx: i - 1, cy: j - 1, size, tiles: [] });

  return {
    ensureAround: (tx, ty, radius, getChunk) => cache.ensureAround(tx, ty, radius ?? 1, getChunk),
    ensureVisible: (view, margin, getChunk) => {
      cache.ensureChunks(visibleChunks(view, opts, margin), getChunk);
      // skirt cache coords are shifted by +1 chunk so they start at 0; interior chunks belong to `cache`
      skirt?.ensureChunks(
        visibleChunks(view, opts, margin, 1)
          .filter(
            (c) => c.cx < 0 || c.cy < 0 || c.cx >= opts.widthChunks || c.cy >= opts.heightChunks,
          )
          .map((c) => ({ cx: c.cx + 1, cy: c.cy + 1 })),
        skirtChunk,
      );
    },
    invalidate: () => {
      cache.invalidate();
      skirt?.invalidate();
    },
    loaded: () => cache.loadedKeys().length,
    flowers: () => [...active],
    created: () => cache.created(),
    destroyAll() {
      scene.events.off('update', onSwayUpdate);
      cache.destroyAll();
      skirt?.destroyAll();
      wallPool.forEach((w) => w.destroy());
      wallPool.length = 0;
      railPool.forEach((w) => w.destroy());
      railPool.length = 0;
      flowerPool.forEach((w) => w.destroy());
      flowerPool.length = 0;
      g.destroy();
      waterG.destroy();
    },
  };
}

function regionBoundsSize(size: number) {
  return regionBounds({ x0: 0, y0: 0, width: size, height: size, kindAt: () => undefined }, PAD);
}
