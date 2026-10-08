import type Phaser from 'phaser';
import { hash } from './pixelArt';
import { isoProjection } from './projection';
import { makeContainer, place } from './views';
import type { EntityView, NodeKind, RockKind, SpotKind } from './views';
import { rockVariantFor, ROCK_VARIANTS, ROCK_FEET_X, ROCK_FEET_Y } from './rockArt';
import { SPOT_FRAMES } from './spotArt';
import {
  getGlintTexture,
  getRockTexture,
  getSpotTexture,
  glintsOf,
  ROCK_ORIGIN_Y,
} from './nodeTextures';

export const isSpotKind = (k: NodeKind): k is SpotKind => k === 'net_spot' || k === 'bait_spot';

/** Idle timing (ms). Exposed so `animation` can reproduce or replace the built-in loop. */
export const NODE_IDLE = {
  /** One full loop of a fishing spot (24 frames: ripples repeat 4x, bait fish jumps once). */
  spotLoopMs: 3360,
  /** A rock glints once per period, for `glintMs`. */
  glintPeriodMs: 3400,
  glintMs: 600,
} as const;

export interface NodeView extends EntityView {
  readonly kind: NodeKind;
  /** The node's image (rock body / spot water art). Its texture key is its current look. */
  readonly art: Phaser.GameObjects.Image;
  /** Rock: swap to rubble. Spot: the spot has moved on (art hidden); false brings it back. */
  setDepleted(depleted: boolean): void;
  /**
   * Idle animation at a time in ms: spots pick their ripple frame, rocks twinkle one ore vein.
   * Called by the view's own update listener unless created with `{ idle: false }`; `animation`
   * may drive it instead. Cheap and allocation free.
   */
  setIdle(timeMs: number): void;
}

export interface NodeViewOptions {
  /** Self-driven idle loop on the scene's `update` (default true; false for reduced motion). */
  idle?: boolean;
}

export function createNodeView(
  scene: Phaser.Scene,
  kind: NodeKind,
  opts: NodeViewOptions = {},
): NodeView {
  const container = makeContainer(scene);
  let depleted = false;
  let tileHash = 0;
  const spot = isSpotKind(kind);
  const art = scene.add.image(
    0,
    0,
    spot ? getSpotTexture(scene, kind, 0) : getRockTexture(scene, kind, 0, false),
  );
  art.setOrigin(0.5, spot ? 0.5 : ROCK_ORIGIN_Y);
  container.add(art);
  let glint: Phaser.GameObjects.Image | undefined;
  let variant = 0;
  if (!spot) {
    glint = scene.add.image(0, 0, getGlintTexture(scene)).setBlendMode('ADD').setAlpha(0);
    container.add(glint);
  }
  let frame = -1;

  const textureFor = (): string =>
    spot
      ? getSpotTexture(scene, kind, Math.max(frame, 0))
      : getRockTexture(scene, kind as RockKind, variant, depleted);

  const view: NodeView = {
    container,
    kind,
    art,
    setWorldPosition: (x, y) => {
      place(container, x, y);
      const t = isoProjection.worldToTile(x, y);
      const tx = Math.round(t.tx);
      const ty = Math.round(t.ty);
      tileHash = hash(0x91e, tx, ty);
      // a spot is flat water decoration: sort under anything standing on or next to it
      if (spot) container.setDepth(container.depth - 0.5);
      else {
        const v = rockVariantFor(tx, ty) % ROCK_VARIANTS;
        if (v !== variant) {
          variant = v;
          art.setTexture(textureFor());
        }
      }
    },
    setDepleted: (d) => {
      depleted = d;
      if (spot) art.setVisible(!d);
      else {
        art.setTexture(textureFor());
        glint?.setAlpha(0);
      }
    },
    setIdle: (ms) => {
      if (depleted) return;
      if (spot) {
        const f = Math.floor(((ms / NODE_IDLE.spotLoopMs + tileHash) % 1) * SPOT_FRAMES);
        if (f === frame) return;
        frame = f;
        art.setTexture(textureFor());
        return;
      }
      if (!glint) return;
      const t = ms + tileHash * NODE_IDLE.glintPeriodMs;
      const cycle = Math.floor(t / NODE_IDLE.glintPeriodMs);
      const u = (t % NODE_IDLE.glintPeriodMs) / NODE_IDLE.glintMs;
      const spots = glintsOf(art.texture.key);
      if (u >= 1 || spots.length === 0) return void glint.setAlpha(0);
      const p = spots[Math.floor(hash(7, cycle, Math.floor(tileHash * 1e4)) * spots.length)];
      if (!p) return;
      glint.setPosition(p.x - ROCK_FEET_X, p.y - ROCK_FEET_Y);
      glint.setAlpha(Math.sin(Math.PI * u));
    },
    destroy: () => {
      if (onUpdate) scene.events.off('update', onUpdate);
      container.destroy();
    },
  };

  // a rock texture pixel (x, y) sits at (x - ROCK_FEET_X, y - ROCK_FEET_Y) from the feet
  const onUpdate =
    opts.idle === false
      ? undefined
      : (_t: number, _d: number) => {
          if (container.visible) view.setIdle(scene.time.now);
        };
  if (onUpdate) scene.events.on('update', onUpdate);
  return view;
}
