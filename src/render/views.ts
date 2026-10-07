import type Phaser from 'phaser';
import { TILE_SIZE } from './coords';
import { depthFor } from './depth';

export type TreeKind = 'tree' | 'oak_tree';
export type ObjectKind = 'bank_chest' | 'bank_booth';
/** NPC figure art keys (the `spriteKey` on NpcDefs). */
export type NpcSpriteKey = 'banker';

/** Footprint in tiles. Render only declares it; `map` owns the collision grid and must block these tiles. */
export const OBJECT_FOOTPRINTS: Record<ObjectKind, { w: number; h: number; blocking: boolean }> = {
  bank_chest: { w: 1, h: 1, blocking: true },
  bank_booth: { w: 1, h: 1, blocking: true },
};

export interface EntityView {
  readonly container: Phaser.GameObjects.Container;
  setWorldPosition(x: number, y: number): void;
  destroy(): void;
}

export interface PlayerView extends EntityView {
  /** Flip horizontally to face left (true) or right (false). */
  setFacing(left: boolean): void;
  setName(name: string): void;
  /** The body figure (flips with facing, bobbed by the animator). Never contains the nameplate. */
  readonly body: Phaser.GameObjects.Graphics;
}

export type NpcView = PlayerView;

export interface TreeView extends EntityView {
  readonly kind: TreeKind;
  /** Leaf and trunk colours (0xRRGGBB) so effects can match this tree. */
  readonly colors: { leaf: number; trunk: number };
  setDepleted(depleted: boolean): void;
}

const TREE_STYLE: Record<TreeKind, { leaf: number; trunk: number; radius: number }> = {
  tree: { leaf: 0x2f7d32, trunk: 0x6b4a2b, radius: 13 },
  oak_tree: { leaf: 0x3f6b24, trunk: 0x5a3b1f, radius: 15 },
};

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

/**
 * Drawn extent of each view, derived from the same constants the views draw with.
 * `up` = px the drawing reaches above its feet (tile bottom edge); `radius` = half width in px.
 */
export const VIEW_HIT_BOUNDS: Record<HitKind, { up: number; radius: number }> = {
  tree: { up: TREE_CANOPY_CENTRE_Y + TREE_STYLE.tree.radius, radius: TREE_STYLE.tree.radius },
  oak_tree: {
    up: TREE_CANOPY_CENTRE_Y + TREE_STYLE.oak_tree.radius,
    radius: TREE_STYLE.oak_tree.radius,
  },
  bank_chest: { up: CHEST_TOP, radius: CHEST_HALF_W },
  bank_booth: { up: BOOTH_SIGN_TOP, radius: BOOTH_HALF_W },
  npc: { up: FIGURE_TOP, radius: FIGURE_HALF_W },
};

/**
 * Click rectangle (world px) for a view whose tile centre is `tileCentre`: the drawn extent, never
 * smaller than the tile itself.
 */
export function hitBoundsFor(
  kind: HitKind,
  tileCentre: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const b = VIEW_HIT_BOUNDS[kind];
  const w = Math.max(b.radius * 2, TILE_SIZE);
  const h = Math.max(b.up, TILE_SIZE);
  return { x: tileCentre.x - w / 2, y: tileCentre.y + TILE_SIZE / 2 - h, w, h };
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

/** Container origin is the entity's feet (tile centre); the figure is drawn above it. */
function makeContainer(scene: Phaser.Scene): Phaser.GameObjects.Container {
  return scene.add.container(0, 0);
}

function place(c: Phaser.GameObjects.Container, x: number, y: number): void {
  c.setPosition(x, y + TILE_SIZE / 2);
  c.setDepth(depthFor(y / TILE_SIZE));
}

interface FigureStyle {
  torso: number;
  legs: number;
  skin: number;
  hair: number;
  /** Optional gold-style trim: collar and belt colour. */
  trim?: number;
}

const PLAYER_STYLE: FigureStyle = {
  torso: 0x3a4a8c,
  legs: 0x2b2b3a,
  skin: 0xe8b88a,
  hair: 0x5a3b1f,
};
const NPC_STYLES: Record<NpcSpriteKey, FigureStyle> = {
  banker: { torso: 0x1f4d36, legs: 0x1a2a22, skin: 0xe0b08a, hair: 0x9a9a9a, trim: 0xe0b84a },
};

/** One figure + nameplate builder for the player and every NPC. */
function createFigureView(scene: Phaser.Scene, st: FigureStyle, name?: string): PlayerView {
  const container = makeContainer(scene);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillEllipse(0, -2, 20, 8);
  g.fillStyle(st.torso, 1).fillRect(-6, -18, 12, 12); // torso
  g.fillStyle(st.legs, 1).fillRect(-6, -8, 5, 8).fillRect(1, -8, 5, 8); // legs
  if (st.trim !== undefined) {
    g.fillStyle(st.trim, 1).fillRect(-6, -9, 12, 2); // belt
    g.fillStyle(st.trim, 1).fillRect(-2, -18, 4, 3); // collar
  }
  g.fillStyle(st.skin, 1).fillCircle(0, -24, 6); // head
  g.fillStyle(st.hair, 1).fillRect(-6, -FIGURE_TOP, 12, 4); // hair
  g.fillStyle(0x111111, 1).fillRect(1, -25, 2, 2); // eye (shows facing)
  const label = scene.add
    .text(0, -40, name ?? '', {
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
  container.add([g, label]);
  return {
    container,
    body: g,
    setWorldPosition: (x, y) => place(container, x, y),
    setFacing: (left) => g.setScale(facingScaleX(left), 1), // body only, never the label
    setName: (n) => {
      label.setText(n).setVisible(n.length > 0);
    },
    destroy: () => container.destroy(),
  };
}

export function createPlayerView(scene: Phaser.Scene, name?: string): PlayerView {
  return createFigureView(scene, PLAYER_STYLE, name);
}

/** NPC figure from data (`spriteKey`), distinct outfit per key. Same body/label rules as the player. */
export function createNpcView(
  scene: Phaser.Scene,
  spriteKey: NpcSpriteKey,
  name?: string,
): NpcView {
  return createFigureView(scene, NPC_STYLES[spriteKey], name);
}

export function createTreeView(scene: Phaser.Scene, kind: TreeKind): TreeView {
  const s = TREE_STYLE[kind];
  const container = makeContainer(scene);
  const full = scene.add.graphics();
  full.fillStyle(s.trunk, 1).fillRect(-4, -16, 8, 16);
  full.fillStyle(s.leaf, 1).fillCircle(0, -TREE_CANOPY_CENTRE_Y, s.radius);
  full.fillStyle(0xffffff, 0.12).fillCircle(-4, -30, s.radius / 2.5);
  const stump = scene.add.graphics().setVisible(false);
  stump.fillStyle(s.trunk, 1).fillRect(-5, -7, 10, 7);
  stump.fillStyle(0xc9a26b, 1).fillEllipse(0, -7, 10, 4);
  container.add([full, stump]);
  return {
    container,
    kind,
    colors: { leaf: s.leaf, trunk: s.trunk },
    setWorldPosition: (x, y) => place(container, x, y),
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
  container.add(g);
  return {
    container,
    setWorldPosition: (x, y) => place(container, x, y),
    destroy: () => container.destroy(),
  };
}
