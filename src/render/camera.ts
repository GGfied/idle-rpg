import type Phaser from 'phaser';
import { clampZoom } from './coords';

/** Per-frame follow smoothing; steady-state lag is v * (1 - L) / L, about 6 px at walking speed. */
export const FOLLOW_LERP = 0.15;

/**
 * Follow `target` with lerp and clamp to the world. Never round the scroll: Phaser floors scrollX
 * every frame and feeds the floored value back into the lerp, so the camera stalls (0 px) and
 * jumps (1 px) while the smoothly interpolated player keeps moving, which reads as judder.
 * startFollow is wrapped so later callers (e.g. re-follow after a drag-pan) get the same policy
 * even when they pass roundPixels = true.
 */
export function setupCamera(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  worldWidthPx: number,
  worldHeightPx: number,
): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, worldWidthPx, worldHeightPx);
  const startFollow = cam.startFollow.bind(cam);
  cam.startFollow = (t, _round, lx, ly, ox, oy) =>
    startFollow(t, false, lx ?? FOLLOW_LERP, ly ?? FOLLOW_LERP, ox, oy);
  cam.startFollow(target);
  cam.setRoundPixels(false);
  return cam;
}

export function setCameraZoom(cam: Phaser.Cameras.Scene2D.Camera, zoom: number): number {
  const z = clampZoom(zoom);
  cam.setZoom(z);
  return z;
}
