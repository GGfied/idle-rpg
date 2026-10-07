import type Phaser from 'phaser';
import { ISO } from './iso';
import { isoProjection } from './projection';
import { cullToCamera } from './viewCull';
import { getTreeTexture, TREE_ORIGIN_Y, treeVariantFor } from './treeTextures';
import type { TreeShape } from './treeArt';
import { figureRects } from './figureArt';
import type { FigureLook, FigureRect, FigureView } from './figureArt';
import { NPC_LOOKS, PLAYER_LOOK } from './figureLooks';
import type { NpcSpriteKey } from './figureLooks';

export type { NpcSpriteKey };

export type TreeKind = 'tree' | 'oak_tree';
export type ObjectKind = 'bank_chest' | 'bank_booth';

/** Footprint in tiles. Render only declares it; `map` owns the collision grid and must block these tiles. */
export const OBJECT_FOOTPRINTS: Record<ObjectKind, { w: number; h: number; blocking: boolean }> = {
  bank_chest: { w: 1, h: 1, blocking: true },
  bank_booth: { w: 1, h: 1, blocking: true },
};

export interface EntityView {
  readonly container: Phaser.GameObjects.Container;
  /** Place the feet at a WORLD pixel (use `isoProjection.tileToWorld`); sets depth from it. */
  setWorldPosition(x: number, y: number): void;
  destroy(): void;
}

export interface PlayerView extends EntityView {
  /** Flip horizontally to face left (true) or right (false). */
  setFacing(left: boolean): void;
  setName(name: string): void;
  /** Redraw the body as seen from behind (true) or the front. Optional hook for the animator; default front. */
  setBackView?(back: boolean): void;
  /** The body figure (flips with facing, bobbed by the animator). Never contains the nameplate. */
  readonly body: Phaser.GameObjects.Graphics;
}

export type NpcView = PlayerView;

export interface TreeView extends EntityView {
  readonly kind: TreeKind;
  /** Leaf and trunk colours (0xRRGGBB) so effects can match this tree. */
  readonly colors: { leaf: number; trunk: number };
  /** The standing tree's image (rotates around the feet; `treeSway` prefers it). Its texture key is the tree's look. */
  readonly art: Phaser.GameObjects.Image;
  setDepleted(depleted: boolean): void;
}

const TREE_STYLE: Record<TreeKind, { leaf: number; trunk: number; radius: number }> = {
  tree: { leaf: 0x2f7d32, trunk: 0x6b4a2b, radius: 13 },
  oak_tree: { leaf: 0x3f6b24, trunk: 0x5a3b1f, radius: 15 },
};

/**
 * Art is drawn at 1x pixel-art size and scaled up in the world so figures read against the 64x32
 * iso tile. Hit bounds and label offsets use the same factor.
 */
export const ART_SCALE = 1.5;
/** Px below the feet the click box reaches (the shadow / lower diamond). */
const HIT_BELOW_FEET = 8;

/** Canopy circle centre, px above the feet (tile bottom edge). Used by the drawing and the hit bounds. */
const TREE_CANOPY_CENTRE_Y = 26;
/** Bank chest drawn box (px): half width, and height of lid top above the feet. */
const CHEST_HALF_W = 14;
const CHEST_TOP = 22;

/** Bank booth drawn box (px): half width, counter top and sign top above the feet. */
const BOOTH_HALF_W = 15;
const BOOTH_COUNTER_TOP = 18;
const BOOTH_SIGN_TOP = 28;
/** Person figure (player and NPCs): hair top above the feet and half width of the torso. */
const FIGURE_TOP = 31;
const FIGURE_HALF_W = 6;

export type HitKind = TreeKind | ObjectKind | 'npc';

function scaled(up: number, radius: number): { up: number; radius: number } {
  return { up: up * ART_SCALE, radius: radius * ART_SCALE };
}

/**
 * Drawn extent of each view, derived from the same constants the views draw with.
 * `up` = px the drawing reaches above its feet (tile bottom edge); `radius` = half width in px.
 */
export const VIEW_HIT_BOUNDS: Record<HitKind, { up: number; radius: number }> = {
  tree: scaled(TREE_CANOPY_CENTRE_Y + TREE_STYLE.tree.radius, TREE_STYLE.tree.radius),
  oak_tree: scaled(TREE_CANOPY_CENTRE_Y + TREE_STYLE.oak_tree.radius, TREE_STYLE.oak_tree.radius),
  bank_chest: scaled(CHEST_TOP, CHEST_HALF_W),
  bank_booth: scaled(BOOTH_SIGN_TOP, BOOTH_HALF_W),
  npc: scaled(FIGURE_TOP, FIGURE_HALF_W),
};

/**
 * Click rectangle (world px) for a view standing at `tileCentre` (the world pixel of its tile's
 * middle, i.e. its feet): the drawn extent from canopy/top down to just below the feet, at least
 * half a tile wide. Covers trunk and canopy of a tree; the rest of the diamond is a tile pick.
 */
export function hitBoundsFor(
  kind: HitKind,
  tileCentre: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const b = VIEW_HIT_BOUNDS[kind];
  const w = Math.max(b.radius * 2, ISO.tileWidth / 2);
  const h = b.up + HIT_BELOW_FEET;
  return { x: tileCentre.x - w / 2, y: tileCentre.y - b.up, w, h };
}

/**
 * Text is rasterised once to a texture; at resolution 1 it gets smeared when the camera zoom or CSS
 * scale enlarges it. Render at 2x (the DPR cap) so zoom 1-3 and high-DPI screens stay crisp.
 */
const TEXT_RESOLUTION = 2;

/** Horizontal scale for the body figure only; the nameplate is never flipped. */
export function facingScaleX(left: boolean): 1 | -1 {
  return left ? -1 : 1;
}

/** Container origin is the entity's feet (the diamond centre); the figure is drawn above it. */
function makeContainer(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  cullToCamera(scene, c);
  return c;
}

function place(c: Phaser.GameObjects.Container, x: number, y: number): void {
  c.setPosition(x, y);
  const t = isoProjection.worldToTile(x, y);
  c.setDepth(isoProjection.depthFor(t.tx, t.ty));
}

const rectCache = new WeakMap<FigureLook, Partial<Record<FigureView, FigureRect[]>>>();
function rectsFor(look: FigureLook, view: FigureView): FigureRect[] {
  let per = rectCache.get(look);
  if (!per) rectCache.set(look, (per = {}));
  return (per[view] ??= figureRects(look, view));
}

/** Soft contact shadow (three stacked ellipses) then the cached pixel-art rectangles. */
function drawFigure(g: Phaser.GameObjects.Graphics, look: FigureLook, view: FigureView): void {
  g.clear();
  g.fillStyle(0x000000, 0.1).fillEllipse(0, -2, 24, 9.5);
  g.fillStyle(0x000000, 0.12).fillEllipse(0, -2, 18, 7);
  g.fillStyle(0x000000, 0.16).fillEllipse(0, -2, 12, 4.5);
  let color = -1;
  for (const r of rectsFor(look, view)) {
    if (r.color !== color) g.fillStyle((color = r.color), 1);
    g.fillRect(r.x, r.y, r.w, r.h);
  }
}

/** One figure + nameplate builder for the player and every NPC. */
function createFigureView(scene: Phaser.Scene, look: FigureLook, name?: string): PlayerView {
  const container = makeContainer(scene);
  const g = scene.add.graphics();
  drawFigure(g, look, 'front');
  const label = scene.add
    .text(0, -40 * ART_SCALE, name ?? '', {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: TEXT_RESOLUTION,
    })
    .setShadow(0, 1, '#000000', 2, true, true)
    .setOrigin(0.5, 1)
    .setVisible(!!name);
  g.setScale(ART_SCALE);
  container.add([g, label]);
  return {
    container,
    body: g,
    setWorldPosition: (x, y) => place(container, x, y),
    setFacing: (left) => g.setScale(facingScaleX(left) * ART_SCALE, ART_SCALE), // body only, never the label
    setBackView: (back) => drawFigure(g, look, back ? 'back' : 'front'),
    setName: (n) => {
      label.setText(n).setVisible(n.length > 0);
    },
    destroy: () => container.destroy(),
  };
}

export function createPlayerView(scene: Phaser.Scene, name?: string): PlayerView {
  return createFigureView(scene, PLAYER_LOOK, name);
}

/** NPC figure from data (`spriteKey`), distinct outfit per key. Same body/label rules as the player. */
export function createNpcView(
  scene: Phaser.Scene,
  spriteKey: NpcSpriteKey,
  name?: string,
): NpcView {
  return createFigureView(scene, NPC_LOOKS[spriteKey], name);
}

/** Tree art geometry in final px (the world scale is baked into the textures), from the hit-bound constants. */
function treeShape(kind: TreeKind): TreeShape {
  const st = TREE_STYLE[kind];
  return {
    canopyUp: TREE_CANOPY_CENTRE_Y * ART_SCALE,
    canopyRadius: st.radius * ART_SCALE,
    trunkHalf: st.radius > 14 ? 4.5 : 3.5,
    leaf: st.leaf,
    trunk: st.trunk,
  };
}

export function createTreeView(scene: Phaser.Scene, kind: TreeKind): TreeView {
  const s = TREE_STYLE[kind];
  const shape = treeShape(kind);
  const container = makeContainer(scene);
  // Art is baked at final size (texture shown at scale 1); the look is picked per tile in place().
  const img = (stump: boolean): Phaser.GameObjects.Image =>
    scene.add
      .image(0, 0, getTreeTexture(scene, shape, kind, 0, stump))
      .setOrigin(0.5, TREE_ORIGIN_Y);
  const full = img(false);
  const stump = img(true).setVisible(false);
  container.add([full, stump]);
  let variant = 0;
  return {
    container,
    kind,
    art: full,
    colors: { leaf: s.leaf, trunk: s.trunk },
    setWorldPosition: (x, y) => {
      place(container, x, y);
      const t = isoProjection.worldToTile(x, y);
      const v = treeVariantFor(Math.round(t.tx), Math.round(t.ty));
      if (v === variant) return;
      variant = v;
      full.setTexture(getTreeTexture(scene, shape, kind, v, false));
      stump.setTexture(getTreeTexture(scene, shape, kind, v, true));
    },
    setDepleted: (d) => {
      full.setVisible(!d);
      stump.setVisible(d);
    },
    destroy: () => container.destroy(),
  };
}

/** Static world object (bank chest / booth). Same origin and depth rules as trees. */
export function createObjectView(scene: Phaser.Scene, kind: ObjectKind): EntityView {
  const container = makeContainer(scene);
  const g = scene.add.graphics();
  if (kind === 'bank_chest') {
    g.fillStyle(0x000000, 0.25).fillEllipse(0, -2, CHEST_HALF_W * 2, 8);
    g.fillStyle(0x7a4a22, 1).fillRect(-12, -18, 24, 16); // body
    g.fillStyle(0x93602d, 1).fillRect(-12, -CHEST_TOP, 24, 6); // lid
    g.fillStyle(0x5a3216, 1).fillRect(-12, -17, 24, 1); // lid seam
    g.fillStyle(0x9aa0a8, 1).fillRect(-9, -22, 3, 20).fillRect(6, -22, 3, 20); // metal bands
    g.fillStyle(0xe0b84a, 1).fillRect(-2, -19, 4, 5); // lock plate
    g.fillStyle(0x3a2412, 1).fillRect(-1, -17, 2, 2); // keyhole
  }
  if (kind === 'bank_booth') {
    g.fillStyle(0x000000, 0.25).fillEllipse(0, -2, BOOTH_HALF_W * 2, 8);
    g.fillStyle(0x6e4220, 1).fillRect(-BOOTH_HALF_W, -BOOTH_COUNTER_TOP + 4, BOOTH_HALF_W * 2, 14); // front
    g.fillStyle(0x8a5a2b, 1).fillRect(-BOOTH_HALF_W, -BOOTH_COUNTER_TOP, BOOTH_HALF_W * 2, 5); // counter top
    g.fillStyle(0x4a2b12, 1).fillRect(-12, -11, 24, 1).fillRect(-12, -5, 24, 1); // panel seams
    g.fillStyle(0x3a2412, 1).fillRect(-BOOTH_HALF_W, -BOOTH_SIGN_TOP + 4, 3, 10); // sign posts
    g.fillRect(BOOTH_HALF_W - 3, -BOOTH_SIGN_TOP + 4, 3, 10);
    g.fillStyle(0xe0b84a, 1).fillRect(-10, -BOOTH_SIGN_TOP, 20, 7); // gold sign
    g.fillStyle(0x8a6a1a, 1).fillRect(-10, -BOOTH_SIGN_TOP + 6, 20, 1); // sign shade
    g.fillStyle(0x3a2412, 1).fillRect(-1, -BOOTH_SIGN_TOP + 2, 2, 3); // sign mark
  }
  g.setScale(ART_SCALE);
  container.add(g);
  return {
    container,
    setWorldPosition: (x, y) => place(container, x, y),
    destroy: () => container.destroy(),
  };
}
