import type Phaser from 'phaser';
import { shadeColor } from './block';
import { ISO } from './iso';
import { tileNoise } from './palette';
import { isoProjection as proj } from './projection';

/** Which neighbours of a bridge tile are open water (the sides that get railings and show water). */
export interface BridgeSides {
  /** Tile x-1 (screen: up-left edge). */
  xMinus: boolean;
  /** Tile x+1 (screen: down-right edge). */
  xPlus: boolean;
  /** Tile y-1 (screen: up-right edge). */
  yMinus: boolean;
  /** Tile y+1 (screen: down-left edge). */
  yPlus: boolean;
}

export const BRIDGE_RAIL_HEIGHT = 11;
const RAIL_KEY = 'iso_bridge_rail';
const HALF_W = ISO.tileWidth / 2;
const HALF_H = ISO.tileHeight / 2;
const DECK = 0x8a5f33;
const WATER_INSET = 0.12;
const PLANKS = 4;

export function bridgeSides(
  kindAt: (x: number, y: number) => string | undefined,
  x: number,
  y: number,
): BridgeSides {
  return {
    xMinus: kindAt(x - 1, y) === 'water',
    xPlus: kindAt(x + 1, y) === 'water',
    yMinus: kindAt(x, y - 1) === 'water',
    yPlus: kindAt(x, y + 1) === 'water',
  };
}

/** The bridge runs along tile-y when only its x sides are water; otherwise along tile-x (the default). */
export function bridgeRunsAlongY(s: BridgeSides): boolean {
  return (s.xMinus || s.xPlus) && !(s.yMinus || s.yPlus);
}

/** Tile-space deck rectangle, pulled in from each water side so water shows under the edges. */
export function bridgeDeckRect(s: BridgeSides) {
  return {
    x0: -0.5 + (s.xMinus ? WATER_INSET : 0),
    x1: 0.5 - (s.xPlus ? WATER_INSET : 0),
    y0: -0.5 + (s.yMinus ? WATER_INSET : 0),
    y1: 0.5 - (s.yPlus ? WATER_INSET : 0),
  };
}

/**
 * Paints a bridge tile into `g` at tile (x, y) whose middle is (cx, cy): the water diamond under it
 * (`water` colour; omit when a water texture is already stamped under it), then wooden planks across the deck with darker gaps and a plank edge. Planks lie
 * across the direction of travel.
 */
export function paintBridge(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  cx: number,
  cy: number,
  s: BridgeSides,
  water: number | undefined,
  grow: number,
): void {
  const pt = (ox: number, oy: number) => {
    const p = proj.tileToWorld(x + ox, y + oy);
    const c = proj.tileToWorld(x, y);
    return { x: cx + (p.x - c.x), y: cy + (p.y - c.y) };
  };
  if (water !== undefined)
    g.fillStyle(water, 1).fillPoints(
      [
        { x: cx, y: cy - HALF_H - grow },
        { x: cx + HALF_W + grow * 2, y: cy },
        { x: cx, y: cy + HALF_H + grow },
        { x: cx - HALF_W - grow * 2, y: cy },
      ],
      true,
    );
  const r = bridgeDeckRect(s);
  const alongY = bridgeRunsAlongY(s);
  const lo = alongY ? r.y0 : r.x0;
  const hi = alongY ? r.y1 : r.x1;
  const step = (hi - lo) / PLANKS;
  const quad = (a0: number, a1: number) =>
    alongY
      ? [pt(r.x0, a0), pt(r.x1, a0), pt(r.x1, a1), pt(r.x0, a1)]
      : [pt(a0, r.y0), pt(a1, r.y0), pt(a1, r.y1), pt(a0, r.y1)];
  for (let i = 0; i < PLANKS; i++) {
    const tone = 0.9 + tileNoise(x * 5 + i, y * 3 + i) * 0.24;
    g.fillStyle(shadeColor(DECK, tone), 1).fillPoints(
      quad(lo + step * i, lo + step * (i + 1)),
      true,
    );
  }
  // dark gaps between planks (and a shadow line along the water-side edges)
  g.lineStyle(1, 0x2a1a0c, 0.7);
  for (let i = 1; i < PLANKS; i++) {
    const a = quad(lo + step * i, lo + step * i);
    g.lineBetween(a[0]!.x, a[0]!.y, a[1]!.x, a[1]!.y);
  }
  const all = quad(lo, hi);
  g.lineStyle(1, 0x2a1a0c, 0.45).strokePoints(all, true);
}

/** Generates (once) the low railing texture for ONE tile edge sloping down-right; flip it for the other slope. */
export function ensureRailTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(RAIL_KEY)) return RAIL_KEY;
  const h = BRIDGE_RAIL_HEIGHT;
  const w = HALF_W + 4;
  const g = scene.make.graphics({}, false);
  const x0 = 2;
  const x1 = 2 + HALF_W;
  const y0 = h + 1; // ground edge start (left end)
  const y1 = y0 + HALF_H; // right end, lower on screen
  // shadow on the deck
  g.lineStyle(2, 0x000000, 0.25).lineBetween(x0, y0 + 1, x1, y1 + 1);
  // posts at both ends, a lower and an upper rail between them
  const wood = shadeColor(DECK, 1.15);
  const dark = shadeColor(DECK, 0.6);
  for (const [px, py] of [
    [x0 + 1, y0],
    [x1 - 1, y1],
  ] as const) {
    g.fillStyle(dark, 1).fillRect(px - 1, py - h, 3, h + 1);
    g.fillStyle(wood, 1).fillRect(px - 1, py - h, 2, h);
  }
  g.lineStyle(2, wood, 1).lineBetween(x0 + 1, y0 - h + 1, x1 - 1, y1 - h + 1);
  g.lineStyle(1, dark, 1).lineBetween(x0 + 1, y0 - h / 2, x1 - 1, y1 - h / 2);
  g.generateTexture(RAIL_KEY, w, y1 + 3);
  g.destroy();
  return RAIL_KEY;
}

export interface RailPlacement {
  x: number;
  y: number;
  /** World-pixel anchor (edge midpoint). */
  wx: number;
  wy: number;
  flipX: boolean;
  /** Same depth space as entities: far edges sort behind a player on the tile, near edges in front. */
  depth: number;
}

/** Railings for one bridge tile: one per water-facing side. */
export function railPlacements(x: number, y: number, s: BridgeSides): RailPlacement[] {
  const out: RailPlacement[] = [];
  const add = (ox: number, oy: number, flipX: boolean) => {
    const p = proj.tileToWorld(x + ox, y + oy);
    out.push({ x, y, wx: p.x, wy: p.y, flipX, depth: proj.depthFor(x + ox * 0.9, y + oy * 0.9) });
  };
  if (s.yMinus) add(0, -0.5, false);
  if (s.yPlus) add(0, 0.5, false);
  if (s.xMinus) add(-0.5, 0, true);
  if (s.xPlus) add(0.5, 0, true);
  return out;
}

/** Image origin of the rail texture: the edge midpoint sits on the placement point. */
export function railOrigin(): { x: number; y: number } {
  const h = BRIDGE_RAIL_HEIGHT;
  const w = HALF_W + 4;
  return { x: (2 + HALF_W / 2) / w, y: (h + 1 + HALF_H / 2) / (h + 1 + HALF_H + 3) };
}

export function placeRail(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image | undefined,
  p: RailPlacement,
): Phaser.GameObjects.Image {
  const key = ensureRailTexture(scene);
  const o = railOrigin();
  return (img ?? scene.add.image(0, 0, key))
    .setPosition(p.wx, p.wy)
    .setOrigin(o.x, o.y)
    .setFlipX(p.flipX)
    .setDepth(p.depth)
    .setVisible(true);
}
