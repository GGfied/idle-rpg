import type Phaser from 'phaser';
import type { TreeView } from '@render/index';
import { MOTION } from './data';
import type { MotionMode } from './types';

export interface TreeFallStyle {
  leaf?: number;
  trunk?: number;
  radius?: number;
}

export interface TreeAnimOpts {
  mode?: MotionMode;
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
  const ghost = scene.add.container(c.x, c.y).setDepth(c.depth + 1);
  const g = scene.add.graphics();
  g.fillStyle(style.trunk ?? treeView.colors.trunk, 1).fillRect(-4, -16, 8, 16);
  g.fillStyle(style.leaf ?? treeView.colors.leaf, 1).fillCircle(0, -26, style.radius ?? 13);
  ghost.add(g);
  return new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: ghost,
      angle: m.fallTiltDeg,
      alpha: 0,
      y: ghost.y + (m.fallTiltDeg === 0 ? 0 : 2),
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
