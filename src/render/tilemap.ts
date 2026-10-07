import type Phaser from 'phaser';
import { bridgeSides, paintBridge, placeRail, railPlacements } from './bridge';
import { blockOriginY, ensureBlockTexture, shadeColor } from './block';
import { LAYERS } from './depth';
import { ISO } from './iso';
import {
  blendEdge,
  edgeTufts,
  SIDE_DELTA,
  SIDE_EDGE,
  type GroundKind,
  type TileSide,
} from './groundTextures';
import { DEFAULT_PALETTE, tileColor, tileNoise, type TilePalette } from './palette';
import { paintWaterTile, type WaterBase } from './waterShade';
import { isoProjection as proj } from './projection';

export interface TileSource {
  width: number;
  height: number;
  kindAt(x: number, y: number): string | undefined;
}

const HALF_W = ISO.tileWidth / 2;
const HALF_H = ISO.tileHeight / 2;
/** Wall block height in px above the ground diamond. */
export const WALL_HEIGHT = 28;
const WALL_TEXTURE = 'iso_wall_block';
const WALL_COLOR = 0x6b6b72;
/** Ground diamonds are drawn this many px larger so neighbours overlap (no antialiasing seams). */
const SEAM = 1;

function diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, grow = 0): void {
  g.fillPoints(
    [
      { x: cx, y: cy - HALF_H - grow },
      { x: cx + HALF_W + grow * 2, y: cy },
      { x: cx, y: cy + HALF_H + grow },
      { x: cx - HALF_W - grow * 2, y: cy },
    ],
    true,
  );
}

/** The plain map wall block, anchored by its ground-diamond centre (see blockOriginY). */
function ensureWallTexture(scene: Phaser.Scene): void {
  ensureBlockTexture(scene, WALL_TEXTURE, { color: WALL_COLOR, height: WALL_HEIGHT });
}

/** A rectangle of tiles in GLOBAL tile coordinates, read through a global `kindAt`. */
export interface TileRegion {
  x0: number;
  y0: number;
  width: number;
  height: number;
  kindAt(x: number, y: number): string | undefined;
}

/** World-pixel box of a region's ground (the RenderTexture placement), padded by `pad` px. */
export function regionBounds(r: TileRegion, pad = 0) {
  const b = proj.worldBounds(r.width, r.height);
  const o = proj.tileToWorld(r.x0, r.y0);
  return {
    x: o.x + b.x - pad,
    y: o.y + b.y - pad,
    width: Math.ceil(b.width) + pad * 2,
    height: Math.ceil(b.height) + pad * 2,
  };
}

/**
 * Where textured ground diamonds go: the caller draws the ground texture of `kind` for tile
 * (tx, ty) with its middle at (cx, cy) in the texture being painted (UNDER everything `g` records).
 */
export type GroundStamp = (
  kind: GroundKind,
  tx: number,
  ty: number,
  cx: number,
  cy: number,
) => void;

const TEXTURED = new Set(['grass', 'flowers', 'path', 'sand', 'water', 'floor']);
const SIDES = Object.keys(SIDE_DELTA) as TileSide[];

/** Soft overgrowth along the edges of `kind` tile (x, y) whose neighbour terrain overhangs it. */
function blendEdges(
  g: Phaser.GameObjects.Graphics,
  kind: string,
  r: TileRegion,
  x: number,
  y: number,
  cx: number,
  cy: number,
): void {
  for (const side of SIDES) {
    const d = SIDE_DELTA[side];
    const n = r.kindAt(x + d.dx, y + d.dy);
    if (n === undefined) continue;
    if (n === 'water' && (kind === 'sand' || kind === 'path')) {
      wetEdge(g, side, cx, cy);
      continue;
    }
    const blend = blendEdge(kind as GroundKind, n as GroundKind);
    if (!blend) continue;
    // soft fringe first (breaks the pixel staircase of the diamond edge), then crisp tufts over it
    const [x0, y0, x1, y1] = SIDE_EDGE[side];
    const fc = blend.colors[1] ?? 0x5c9a44;
    g.lineStyle(5, fc, 0.3).lineBetween(
      cx + x0 * 0.94,
      cy + y0 * 0.94,
      cx + x1 * 0.94,
      cy + y1 * 0.94,
    );
    g.lineStyle(3, fc, 0.5).lineBetween(
      cx + x0 * 0.97,
      cy + y0 * 0.97,
      cx + x1 * 0.97,
      cy + y1 * 0.97,
    );
    for (const t of edgeTufts(x, y, side, blend)) {
      g.lineStyle(1, t.color, t.alpha).lineBetween(
        cx + t.x,
        cy + t.y,
        cx + t.x + t.lean,
        cy + t.y - t.h,
      );
    }
  }
}

/** Damp darker band along a sand/path edge that meets water: a soft shore instead of a hard line. */
function wetEdge(g: Phaser.GameObjects.Graphics, side: TileSide, cx: number, cy: number): void {
  const [x0, y0, x1, y1] = SIDE_EDGE[side];
  for (const [w, k, a] of [
    [9, 0.88, 0.14],
    [6, 0.92, 0.22],
    [3, 0.96, 0.32],
  ] as const)
    g.lineStyle(w, 0x8a7a50, a).lineBetween(cx + x0 * k, cy + y0 * k, cx + x1 * k, cy + y1 * k);
}

/**
 * Paints a region's ground diamonds into `g`, relative to `origin` (the world px of the texture's
 * top-left). Shared by the single-map path and the chunk path. Returns true if any wall was seen.
 */
export function paintGround(
  g: Phaser.GameObjects.Graphics,
  r: TileRegion,
  origin: { x: number; y: number },
  palette: TilePalette = DEFAULT_PALETTE,
  stamp?: GroundStamp,
  water?: WaterBase,
): boolean {
  let anyWall = false;
  for (let y = r.y0; y < r.y0 + r.height; y++) {
    for (let x = r.x0; x < r.x0 + r.width; x++) {
      const kind = r.kindAt(x, y);
      if (kind === undefined) continue;
      const c = proj.tileToWorld(x, y);
      const cx = c.x - origin.x;
      const cy = c.y - origin.y;
      if (kind === 'wall') {
        // Dark footing; the upright block is a separate depth-sorted image.
        g.fillStyle(shadeColor(WALL_COLOR, 0.5), 1);
        diamond(g, cx, cy, SEAM);
        anyWall = true;
        continue;
      }
      if (kind === 'bridge') {
        // Planks over the water: the water diamond shows at the edges that face open water.
        if (stamp && water) {
          paintWaterTile(water, x, y, cx, cy, SEAM);
          stamp('waterdetail', x, y, cx, cy);
        } else if (stamp) stamp('water', x, y, cx, cy);
        const under = stamp ? undefined : tileColor('water', x, y, palette);
        paintBridge(g, x, y, cx, cy, bridgeSides(r.kindAt, x, y), under, SEAM);
        continue;
      }
      if (stamp && TEXTURED.has(kind)) {
        if (kind === 'water' && water) {
          paintWaterTile(water, x, y, cx, cy, SEAM);
          stamp('waterdetail', x, y, cx, cy);
        } else stamp(kind as GroundKind, x, y, cx, cy);
        blendEdges(g, kind, r, x, y, cx, cy);
        if (kind === 'water') foam(g, r.kindAt, x, y, cx, cy);
        continue;
      }
      g.fillStyle(tileColor(kind, x, y, palette), 1);
      diamond(g, cx, cy, SEAM);
      decorate(g, kind, x, y, cx, cy);
      if (kind === 'water') foam(g, r.kindAt, x, y, cx, cy);
    }
  }
  return anyWall;
}

/** Positions a wall block image on tile (x, y), depth-sorted with entities. */
export function placeWall(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image | undefined,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  ensureWallTexture(scene);
  const c = proj.tileToWorld(x, y);
  const out = img ?? scene.add.image(0, 0, WALL_TEXTURE);
  return out
    .setPosition(c.x, c.y)
    .setOrigin(0.5, blockOriginY(WALL_HEIGHT))
    .setDepth(proj.depthFor(x, y))
    .setVisible(true);
}

/**
 * Draws the isometric map. Ground diamonds go once into one RenderTexture (one GameObject);
 * walls are upright blocks, so each is an Image depth-sorted with entities (a
 * player behind a wall is hidden by it). Unknown kinds are magenta, undefined kinds skipped.
 * Destroying the returned texture also destroys the wall images.
 */
export function drawTilemap(
  scene: Phaser.Scene,
  source: TileSource,
  palette: TilePalette = DEFAULT_PALETTE,
): Phaser.GameObjects.RenderTexture {
  const region: TileRegion = {
    x0: 0,
    y0: 0,
    width: source.width,
    height: source.height,
    kindAt: (x, y) => source.kindAt(x, y),
  };
  const b = regionBounds(region);
  const g = scene.make.graphics({}, false);
  const anyWall = paintGround(g, region, b, palette);
  const walls: Phaser.GameObjects.Image[] = [];
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const k = source.kindAt(x, y);
      if (k === 'wall' && anyWall) walls.push(placeWall(scene, undefined, x, y));
      else if (k === 'bridge')
        for (const p of railPlacements(x, y, bridgeSides(region.kindAt, x, y)))
          walls.push(placeRail(scene, undefined, p));
    }
  }
  const rt = scene.add
    .renderTexture(b.x, b.y, b.width, b.height)
    .setOrigin(0, 0)
    .setDepth(LAYERS.GROUND);
  rt.draw(g);
  g.destroy();
  rt.once('destroy', () => walls.forEach((w) => w.destroy()));
  return rt;
}

/** Point in tile space (fractional tile offsets from tile (x,y)'s middle) to RT pixels. */
function at(x: number, y: number, ox: number, oy: number, cx: number, cy: number) {
  const p = proj.tileToWorld(x + ox, y + oy);
  const c = proj.tileToWorld(x, y);
  return { x: cx + (p.x - c.x), y: cy + (p.y - c.y) };
}

const FOAM_SIDES = [
  { dx: 0, dy: -1, a: [-0.38, -0.4], b: [0.38, -0.4] },
  { dx: 0, dy: 1, a: [-0.38, 0.4], b: [0.38, 0.4] },
  { dx: -1, dy: 0, a: [-0.4, -0.38], b: [-0.4, 0.38] },
  { dx: 1, dy: 0, a: [0.4, -0.38], b: [0.4, 0.38] },
] as const;

/** Light foam line just inside a water tile's edges that touch land (not water, bridge or the unknown). */
function foam(
  g: Phaser.GameObjects.Graphics,
  kindAt: (x: number, y: number) => string | undefined,
  x: number,
  y: number,
  cx: number,
  cy: number,
): void {
  for (const f of FOAM_SIDES) {
    const k = kindAt(x + f.dx, y + f.dy);
    if (k === undefined || k === 'water' || k === 'bridge') continue;
    const a = at(x, y, f.a[0], f.a[1], cx, cy);
    const b = at(x, y, f.b[0], f.b[1], cx, cy);
    g.lineStyle(2, 0xffffff, 0.35).lineBetween(a.x, a.y, b.x, b.y);
  }
}

function decorate(
  g: Phaser.GameObjects.Graphics,
  kind: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
): void {
  if (kind === 'floor') {
    // Plank seams run along the tile-x edge direction, with a staggered joint per plank.
    g.lineStyle(1, 0x000000, 0.22);
    for (let i = 1; i < 4; i++) {
      const oy = -0.5 + i / 4;
      const a = at(x, y, -0.5, oy, cx, cy);
      const b2 = at(x, y, 0.5, oy, cx, cy);
      g.lineBetween(a.x, a.y, b2.x, b2.y);
      const jx = -0.4 + tileNoise(x * 4 + i, y) * 0.8;
      const j0 = at(x, y, jx, oy - 0.25, cx, cy);
      const j1 = at(x, y, jx, oy, cx, cy);
      g.lineBetween(j0.x, j0.y, j1.x, j1.y);
    }
  } else if (kind === 'water') {
    const p = at(x, y, tileNoise(x, y) * 0.4 - 0.3, tileNoise(y, x) * 0.4 - 0.2, cx, cy);
    g.fillStyle(0xffffff, 0.18).fillRect(p.x - 5, p.y, 10, 2);
  } else if (kind === 'path' || kind === 'sand') {
    const p = at(x, y, tileNoise(x + 3, y) - 0.5, tileNoise(y + 5, x) - 0.5, cx, cy);
    g.fillStyle(0x000000, 0.1).fillRect(p.x, p.y, 2, 1);
  }
}
