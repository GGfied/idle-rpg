import type Phaser from 'phaser';
import { clampZoom } from './coords';
import type { Projection } from './projection';

/** Per-frame follow smoothing; steady-state lag is v * (1 - L) / L, about 6 px at walking speed. */
export const FOLLOW_LERP = 0.15;

/**
 * Follow `target` with lerp and clamp to the world. Never round the scroll: Phaser floors scrollX
 * every frame and feeds the floored value back into the lerp, so the camera stalls (0 px) and
 * jumps (1 px) while the smoothly interpolated player keeps moving, which reads as judder.
 * startFollow is wrapped so later callers (e.g. re-follow after a drag-pan) get the same policy
 * even when they pass roundPixels = true.
 */
export interface BoundsBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Canvas px a HUD covers on the right / bottom edge (the app measures it from the DOM). */
export interface CoverInsets {
  right: number;
  bottom: number;
}

const baseBounds = new WeakMap<object, BoundsBox>();

/**
 * World bounds grown past the bottom/right edge by the covered canvas px (/ zoom = world px), so the
 * edge tiles can scroll out from under a HUD. No inset (or non-finite/negative) = the base bounds.
 */
export function boundsWithInsets(base: BoundsBox, insets: CoverInsets, zoom: number): BoundsBox {
  const z = zoom > 0 ? zoom : 1;
  const ok = (v: number): number => (Number.isFinite(v) && v > 0 ? v / z : 0);
  return { ...base, width: base.width + ok(insets.right), height: base.height + ok(insets.bottom) };
}

/** Re-apply the camera bounds for the current HUD insets and zoom (call on resize, sheet toggle, zoom). */
export function setCameraInsets(cam: Phaser.Cameras.Scene2D.Camera, insets: CoverInsets): void {
  const base = baseBounds.get(cam);
  if (!base) return;
  const b = boundsWithInsets(base, insets, cam.zoom);
  cam.setBounds(b.x, b.y, b.width, b.height);
}

export function setupCamera(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  worldWidthPx: number,
  worldHeightPx: number,
  originX = 0,
  originY = 0,
): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setBounds(originX, originY, worldWidthPx, worldHeightPx);
  baseBounds.set(cam, { x: originX, y: originY, width: worldWidthPx, height: worldHeightPx });
  const startFollow = cam.startFollow.bind(cam);
  // Phaser's startFollow resets the follow offset to 0 and snaps the scroll to it, so a re-follow
  // (recentre, gather start) without an offset jumped the camera by the HUD inset (~13 px on a phone)
  // before the scene re-applied the offset. Keep the current offset unless the caller passes one.
  // Phaser's startFollow also snaps the scroll straight onto the target, throwing away the lerp lag
  // (~6 px at walking speed), so every re-follow (re-tap mid-walk, gather start) jumped the camera.
  // Same target: only update lerp/offset. New target (or after a drag-pan stopFollow): keep the scroll.
  cam.startFollow = (t, _round, lx, ly, ox, oy) => {
    const lerpX = lx ?? FOLLOW_LERP;
    const lerpY = ly ?? FOLLOW_LERP;
    const offX = ox ?? cam.followOffset?.x ?? 0;
    const offY = oy ?? cam.followOffset?.y ?? 0;
    const same = (cam as unknown as { _follow?: unknown })._follow === t;
    if (same) {
      cam.lerp.set(lerpX, lerpY);
      cam.setFollowOffset(offX, offY);
      return cam;
    }
    const { scrollX, scrollY } = cam;
    startFollow(t, false, lerpX, lerpY, offX, offY);
    if (initialised) {
      cam.scrollX = scrollX;
      cam.scrollY = scrollY;
    }
    return cam;
  };
  let initialised = false;
  cam.startFollow(target);
  initialised = true;
  cam.setRoundPixels(false);
  return cam;
}

export function setCameraZoom(cam: Phaser.Cameras.Scene2D.Camera, zoom: number): number {
  const z = clampZoom(zoom);
  cam.setZoom(z);
  return z;
}

/** setupCamera with bounds taken from the projection (the iso diamond map's pixel box). */
export function setupCameraFor(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  projection: Projection,
  cols: number,
  rows: number,
): Phaser.Cameras.Scene2D.Camera {
  const b = projection.worldBounds(cols, rows);
  return setupCamera(scene, target, b.width, b.height, b.x, b.y);
}
