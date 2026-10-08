import type Phaser from 'phaser';
import { isoProjection } from './projection';
import {
  ASHES_FRAME,
  FIRE_FRAME,
  FLAME_FRAME,
  FLAME_LAYERS,
  FLAME_ROOT_UP,
  GLOW_FRAME,
} from './fireArt';
import type { FlameLayer } from './fireArt';
import {
  getAshesTexture,
  getFireBase,
  getFireEmbers,
  getFireFront,
  getFireGlow,
  getFlameTexture,
  getLogPileTexture,
} from './fireTextures';
import { hitBoundsFor, makeContainer, place } from './views';
import type { EntityView } from './views';

/** Scale of the flames (and glow) while the fire is in its last ~10% of burn. Animation multiplies its flicker by `intensity`. */
export const FIRE_DYING_INTENSITY = 0.5;
/** Glow alpha at full / dying strength. */
export const FIRE_GLOW_ALPHA = { lit: 1, dying: 0.45 } as const;

/**
 * THE hook for `animation`: every flame layer is an Image whose origin is the flame root, so scaling
 * or rotating it makes the flame grow/sway from its base. `root` holds the three layers and is scaled
 * by `setDying` (do NOT animate `root.scale`; animate the layers and `glow`). Static look: scale 1,
 * rotation 0, alpha 1 (glow alpha is `FIRE_GLOW_ALPHA`).
 */
export interface FireFlameLayers {
  /** Container at the flame root; `setDying` scales it (uniformly, intensity). */
  readonly root: Phaser.GameObjects.Container;
  readonly outer: Phaser.GameObjects.Image;
  readonly inner: Phaser.GameObjects.Image;
  readonly core: Phaser.GameObjects.Image;
  /** Additive ground glow ellipse (scale it / pulse its alpha for light flicker). */
  readonly glow: Phaser.GameObjects.Image;
  /** Additive embers, visible only while dying. */
  readonly embers: Phaser.GameObjects.Image;
  /** outer, inner, core in draw order. */
  readonly layers: readonly Phaser.GameObjects.Image[];
}

/**
 * Structural match of `render/animation/flame.ts` FlameTarget (render code does not import the animation
 * folder): pass it straight to `flicker.add(fireId, view.flameTarget)`.
 */
export interface FireFlameTarget {
  layers: readonly FireFlameTargetLayer[];
  glow: FireFlameTargetLayer;
  host: { active: boolean; visible: boolean };
}
export interface FireFlameTargetLayer {
  node: {
    setScale(x: number, y?: number): unknown;
    setPosition(x: number, y?: number): unknown;
    setAlpha(a: number): unknown;
  };
  baseX: number;
  baseY: number;
  baseScaleX: number;
  baseScaleY: number;
  baseAlpha: number;
}

export interface FireView extends EntityView {
  readonly tile: { x: number; y: number };
  readonly flames: FireFlameLayers;
  /** The logs + soot ring image (swaps to the charred look while dying). */
  /** What the flame flicker drives: layers outer -> core (origin = flame root, bottom centre), the glow, the container as host. `setDying` keeps `glow.baseAlpha` current. */
  readonly flameTarget: FireFlameTarget;
  readonly base: Phaser.GameObjects.Image;
  readonly dying: boolean;
  /** 1 while burning well, `FIRE_DYING_INTENSITY` when dying; multiply flicker amplitudes by it. */
  readonly intensity: number;
  /** Smaller flames, embers, charred logs and a dimmer glow for the last ~10% of burn. Idempotent. */
  setDying(dying: boolean): void;
  /** Pointer hit rectangle in world px (same shape as `hitBoundsFor`). */
  readonly hit: { x: number; y: number; w: number; h: number };
  /** Is a world point inside the hit rectangle? */
  hitTest(wx: number, wy: number): boolean;
}

/**
 * A campfire on tile `tile` (isometric). Draw order, bottom to top: glow (ADD), soot ring + logs,
 * outer / inner / core flames, a front log over the flame roots, embers (ADD, dying only).
 * Static art only: `animation` drives `flames`.
 */
export function createFireView(scene: Phaser.Scene, tile: { x: number; y: number }): FireView {
  const container = makeContainer(scene);
  const glow = scene.add
    .image(0, 0, getFireGlow(scene))
    .setOrigin(0.5, 0.5)
    .setBlendMode('ADD')
    .setAlpha(FIRE_GLOW_ALPHA.lit);
  glow.setDisplaySize(GLOW_FRAME.w, GLOW_FRAME.h);
  const feet = FIRE_FRAME.feetY / FIRE_FRAME.h;
  const base = scene.add
    .image(0, 0, getFireBase(scene, false))
    .setOrigin(FIRE_FRAME.feetX / FIRE_FRAME.w, feet);
  const root = scene.add.container(0, -FLAME_ROOT_UP);
  const flameImg = (l: FlameLayer): Phaser.GameObjects.Image =>
    scene.add
      .image(0, 0, getFlameTexture(scene, l))
      .setOrigin(FLAME_FRAME.rootX / FLAME_FRAME.w, FLAME_FRAME.rootY / FLAME_FRAME.h);
  const [outer, inner, core] = FLAME_LAYERS.map(flameImg) as [
    Phaser.GameObjects.Image,
    Phaser.GameObjects.Image,
    Phaser.GameObjects.Image,
  ];
  root.add([outer, inner, core]);
  const front = scene.add
    .image(0, 0, getFireFront(scene, false))
    .setOrigin(FIRE_FRAME.feetX / FIRE_FRAME.w, feet);
  const embers = scene.add
    .image(0, 0, getFireEmbers(scene))
    .setOrigin(FIRE_FRAME.feetX / FIRE_FRAME.w, feet)
    .setBlendMode('ADD')
    .setVisible(false);
  container.add([glow, base, root, front, embers]);

  let dying = false;
  const target = (node: Phaser.GameObjects.Image, baseAlpha: number): FireFlameTargetLayer => ({
    node,
    baseX: 0,
    baseY: 0,
    baseScaleX: 1,
    baseScaleY: 1,
    baseAlpha,
  });
  const flameTarget: FireFlameTarget = {
    layers: [target(outer, 1), target(inner, 1), target(core, 1)],
    glow: target(glow, FIRE_GLOW_ALPHA.lit),
    host: container,
  };
  const centre = isoProjection.tileToWorld(tile.x, tile.y);
  const view: FireView = {
    container,
    tile,
    flames: { root, outer, inner, core, glow, embers, layers: [outer, inner, core] },
    flameTarget,
    base,
    get dying() {
      return dying;
    },
    get intensity() {
      return dying ? FIRE_DYING_INTENSITY : 1;
    },
    setDying: (d) => {
      if (d === dying) return;
      dying = d;
      root.setScale(d ? FIRE_DYING_INTENSITY : 1);
      flameTarget.glow.baseAlpha = d ? FIRE_GLOW_ALPHA.dying : FIRE_GLOW_ALPHA.lit;
      glow.setAlpha(flameTarget.glow.baseAlpha);
      base.setTexture(getFireBase(scene, d));
      front.setTexture(getFireFront(scene, d));
      embers.setVisible(d);
    },
    hit: hitBoundsFor('fire', centre),
    hitTest: (wx, wy) => {
      const h = view.hit;
      return wx >= h.x && wx < h.x + h.w && wy >= h.y && wy < h.y + h.h;
    },
    setWorldPosition: (x, y) => place(container, x, y),
    destroy: () => container.destroy(),
  };
  view.setWorldPosition(centre.x, centre.y);
  return view;
}

/** The ash heap a burnt-out fire leaves behind: a flat decal on the tile (sorts under anything standing on it). */
export function createAshesView(scene: Phaser.Scene, tile: { x: number; y: number }): EntityView {
  const container = makeContainer(scene);
  container.add(
    scene.add
      .image(0, 0, getAshesTexture(scene))
      .setOrigin(ASHES_FRAME.cx / ASHES_FRAME.w, ASHES_FRAME.cy / ASHES_FRAME.h),
  );
  const v: EntityView = {
    container,
    setWorldPosition: (x, y) => {
      place(container, x, y);
      container.setDepth(container.depth - 0.5);
    },
    destroy: () => container.destroy(),
  };
  const c = isoProjection.tileToWorld(tile.x, tile.y);
  v.setWorldPosition(c.x, c.y);
  return v;
}

/**
 * The unlit log pile shown while the player kneels to light a fire: the fire's own logs, tinted by log
 * type, feet on the tile middle, depth-sorted like the fire. Not interactive (no hit area).
 */
export function createLogPileView(
  scene: Phaser.Scene,
  tile: { x: number; y: number },
  logsId: string,
): EntityView {
  const container = makeContainer(scene);
  container.add(
    scene.add
      .image(0, 0, getLogPileTexture(scene, logsId))
      .setOrigin(FIRE_FRAME.feetX / FIRE_FRAME.w, FIRE_FRAME.feetY / FIRE_FRAME.h),
  );
  const v: EntityView = {
    container,
    setWorldPosition: (x, y) => place(container, x, y),
    destroy: () => container.destroy(),
  };
  const c = isoProjection.tileToWorld(tile.x, tile.y);
  v.setWorldPosition(c.x, c.y);
  return v;
}
