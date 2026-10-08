import type { KeepOutSet, KeepRect } from '@render/index';

/** A DOM box in viewport px (a getBoundingClientRect result). */
export interface ClientBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** HUD elements that draw over the canvas and must not hide a nameplate. */
export const KEEP_OUT_SELECTORS = [
  '.topright',
  '.tabs',
  '.area-banner-inner',
  '.chat-toggle',
  '.chatbox',
  '#hud',
] as const;

/** Elements fading below this computed opacity (the area banner between shows) are not obstacles. */
export const MIN_OPACITY = 0.05;

const MIN_SIDE = 4; // px; ignores collapsed or zero-size boxes

/**
 * Canvas-relative keep-out set: each HUD box clipped to the canvas (a sidebar beside the canvas clips to
 * nothing), shifted so the canvas top-left is the origin. Sizes are CSS px, matching the render clamp.
 */
export function keepOutSet(canvas: ClientBox, boxes: readonly ClientBox[]): KeepOutSet {
  const rects: KeepRect[] = [];
  for (const b of boxes) {
    const left = Math.max(b.left, canvas.left) - canvas.left;
    const top = Math.max(b.top, canvas.top) - canvas.top;
    const right = Math.min(b.right, canvas.right) - canvas.left;
    const bottom = Math.min(b.bottom, canvas.bottom) - canvas.top;
    if (right - left < MIN_SIDE || bottom - top < MIN_SIDE) continue;
    rects.push({ left, top, right, bottom });
  }
  return { width: canvas.right - canvas.left, height: canvas.bottom - canvas.top, rects };
}
