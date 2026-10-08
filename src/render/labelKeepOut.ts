/**
 * Keep-out zones for entity labels: screen rects the HUD draws over the canvas (orbs, minimap, tab bar,
 * chat button). The app publishes them through `setLabelKeepOuts`; labels read them in the camera
 * 'prerender' clamp. Pure math lives here (no Phaser); the provider is a module-level function so no
 * per-entity wiring is needed.
 */

/** Rect in canvas-relative CSS px (0,0 = canvas top-left). */
export interface KeepRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface KeepOutSet {
  /** Canvas size in CSS px (the rects' coordinate space). */
  width: number;
  height: number;
  rects: readonly KeepRect[];
}

export type KeepOutProvider = () => KeepOutSet | null;

/** Gap kept between a label and a keep-out rect, CSS px. */
export const KEEP_OUT_PAD = 4;
/** Max total sideways shift, CSS px: beyond it the label goes below the blocking rect instead. */
export const MAX_SIDE_SHIFT = 40;
const PASSES = 3;
const TTL_MS = 200;

let provider: KeepOutProvider | null = null;
let cached: KeepOutSet | null = null;
let cachedAt = -Infinity;

/** Register (or clear with null) the HUD keep-out source. Called by the app layer. */
export function setLabelKeepOuts(next: KeepOutProvider | null): void {
  provider = next;
  cached = null;
  cachedAt = -Infinity;
}

/** The current set, re-read from the provider at most every TTL_MS (DOM rect reads are not free). */
export function currentKeepOuts(now: number): KeepOutSet | null {
  if (!provider) return null;
  if (now - cachedAt >= TTL_MS) {
    cached = provider();
    cachedAt = now;
  }
  return cached;
}

export interface Shift {
  dx: number;
  dy: number;
}

/**
 * Minimum translation (CSS px, written into `out`) that moves the box [l,t,r,b] out of every rect.
 * Per overlapped rect the cheapest of left / right / down / up is taken (a min of continuous distances,
 * so the label slides smoothly as the entity moves, no flips). Options that leave the canvas are
 * skipped, as are sideways moves past MAX_SIDE_SHIFT in total (the label goes below instead); if none is valid the label is pushed down. Rects only shift boxes that overlap them.
 */
export function keepOutShift(
  l: number,
  t: number,
  r: number,
  b: number,
  set: KeepOutSet,
  out: Shift,
  pad: number = KEEP_OUT_PAD,
): Shift {
  let dx = 0;
  let dy = 0;
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < set.rects.length; i++) {
      const k = set.rects[i]!;
      const bl = l + dx;
      const bt = t + dy;
      const br = r + dx;
      const bb = b + dy;
      if (br <= k.left - pad || bl >= k.right + pad || bb <= k.top - pad || bt >= k.bottom + pad)
        continue;
      let best = Infinity;
      let mx = 0;
      let my = 0;
      const goLeft = k.left - pad - br;
      if (bl + goLeft >= 0 && -goLeft < best && Math.abs(dx + goLeft) <= MAX_SIDE_SHIFT) {
        best = -goLeft;
        mx = goLeft;
        my = 0;
      }
      const goRight = k.right + pad - bl;
      if (br + goRight <= set.width && goRight < best && Math.abs(dx + goRight) <= MAX_SIDE_SHIFT) {
        best = goRight;
        mx = goRight;
        my = 0;
      }
      const goUp = k.top - pad - bb;
      if (bt + goUp >= 0 && -goUp < best) {
        best = -goUp;
        mx = 0;
        my = goUp;
      }
      const goDown = k.bottom + pad - bt;
      if (goDown < best || best === Infinity) {
        best = goDown;
        mx = 0;
        my = goDown;
      }
      dx += mx;
      dy += my;
      moved = true;
    }
    if (!moved) break;
  }
  out.dx = dx;
  out.dy = dy;
  return out;
}
