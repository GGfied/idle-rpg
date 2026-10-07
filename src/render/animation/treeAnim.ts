import type Phaser from 'phaser';
import { ART_SCALE } from '@render/index';
import type { TreeView } from '@render/index';
import { GHOST_DEPTH_EPS, MOTION } from './data';
import { fallVector } from './logic';
import type { FallVector } from './logic';
import type { MotionMode } from './types';

export interface TreeFallStyle {
  leaf?: number;
  trunk?: number;
  radius?: number;
}

export interface TreeAnimOpts {
  mode?: MotionMode;
  /** Tile offset of the tree from the player; the tree falls away from them. Omitted: falls right. */
  awayFrom?: { dx: number; dy: number };
}

/**
 * Tree depleted: show the stump at once and play a temporary crown+trunk that tilts away and
 * fades. Calls treeView.setDepleted(true) itself. Resolves when the effect is gone.
 */
export function animateTreeFall(
  scene: Phaser.Scene,
  treeView: TreeView,
  style: TreeFallStyle = {},
  opts: TreeAnimOpts = {},
): Promise<void> {
  const m = MOTION[opts.mode ?? 'on'];
  const c = treeView.container;
  scene.tweens.killTweensOf(c);
  c.setScale(1).setAlpha(1);
  treeView.setDepleted(true);
  if (m.fallMs <= 0) return Promise.resolve(); // off: instant swap, no ghost
  const v: FallVector = fallVector(opts.awayFrom?.dx ?? 0, opts.awayFrom?.dy ?? 0, {
    slideX: 0,
    slideY: 0,
    tilt: 1,
  });
  const slide = m.fallTiltDeg === 0 ? 0 : 1;
  const ghost = scene.add
    .container(c.x, c.y)
    .setDepth(c.depth + GHOST_DEPTH_EPS)
    .setScale(ART_SCALE);
  const g = scene.add.graphics();
  g.fillStyle(style.trunk ?? treeView.colors.trunk, 1).fillRect(-4, -16, 8, 16);
  g.fillStyle(style.leaf ?? treeView.colors.leaf, 1).fillCircle(0, -26, style.radius ?? 13);
  ghost.add(g);
  return new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: ghost,
      angle: m.fallTiltDeg * v.tilt,
      alpha: 0,
      x: ghost.x + v.slideX * slide,
      y: ghost.y + v.slideY * slide,
      duration: m.fallMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        ghost.destroy();
        resolve();
      },
    });
  });
}

/** Tree respawned: show the full tree and pop it up from the ground. */
export function animateTreeRegrow(
  scene: Phaser.Scene,
  treeView: TreeView,
  opts: TreeAnimOpts = {},
): Promise<void> {
  const m = MOTION[opts.mode ?? 'on'];
  const c = treeView.container;
  scene.tweens.killTweensOf(c);
  treeView.setDepleted(false);
  if (m.regrowMs <= 0) {
    c.setScale(1).setAlpha(1); // off: instant swap
    return Promise.resolve();
  }
  c.setScale(m.regrowFromScale).setAlpha(0.4);
  return new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: c,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: m.regrowMs,
      ease: m.regrowFromScale === 1 ? 'Linear' : 'Back.easeOut',
      onComplete: () => resolve(),
    });
  });
}
