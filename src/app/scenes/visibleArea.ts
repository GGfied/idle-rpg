/** Which part of the canvas the HUD covers, so the camera can centre the player in what's left. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Insets {
  right: number;
  bottom: number;
}

const EDGE = 2; // px tolerance when deciding the HUD spans a whole edge

/**
 * Overlap of the HUD on the canvas as insets. A HUD spanning the full width (phone bottom sheet) covers
 * the bottom; one spanning the full height (landscape side panel) covers the right. A HUD beside the
 * canvas (desktop sidebar) or anything else covers nothing.
 */
export function hudInsets(canvas: Box, hud: Box | null): Insets {
  const none = { right: 0, bottom: 0 };
  if (!hud) return none;
  const spansWidth = hud.left <= canvas.left + EDGE && hud.right >= canvas.right - EDGE;
  const spansHeight = hud.top <= canvas.top + EDGE && hud.bottom >= canvas.bottom - EDGE;
  const h = canvas.bottom - canvas.top;
  const w = canvas.right - canvas.left;
  if (spansWidth && !spansHeight && hud.top > canvas.top) {
    return { right: 0, bottom: Math.min(h, Math.max(0, canvas.bottom - hud.top)) };
  }
  if (spansHeight && !spansWidth && hud.left > canvas.left) {
    return { right: Math.min(w, Math.max(0, canvas.right - hud.left)), bottom: 0 };
  }
  return none;
}

/**
 * Camera follow offset (world px) that puts the target at the centre of the visible area.
 * Phaser centres the camera on `target - offset`, so the camera must sit below/right of the target.
 */
export function followOffset(insets: Insets, zoom: number): { x: number; y: number } {
  const z = zoom > 0 ? zoom : 1;
  return { x: -insets.right / (2 * z), y: -insets.bottom / (2 * z) };
}

/** The HUD box extended upward over a strip stacked directly on top of it (the phone chat strip). */
export function withStackedAbove(hud: Box | null, strip: Box | null): Box | null {
  if (!hud || !strip) return hud;
  const stacked = Math.abs(strip.bottom - hud.top) <= EDGE;
  return stacked ? { ...hud, top: Math.min(hud.top, strip.top) } : hud;
}
