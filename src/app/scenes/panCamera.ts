/** Pure maths for dragging the camera around. Phaser's scroll is the view's top-left before zoom. */

export interface Scroll {
  x: number;
  y: number;
}

export interface PanView {
  /** Camera size in canvas px. */
  width: number;
  height: number;
  zoom: number;
}

/**
 * Drag the world with the pointer: a drag of (dx, dy) canvas px moves the scroll by -dx/zoom,
 * -dy/zoom world px. Not clamped here: the Phaser camera bounds are the one clamp (set by
 * setupCameraFor). Non-finite input leaves the scroll unchanged.
 */
export function panScroll(scroll: Scroll, drag: { dx: number; dy: number }, view: PanView): Scroll {
  if (!(view.zoom > 0) || !Number.isFinite(drag.dx) || !Number.isFinite(drag.dy)) return scroll;
  return { x: scroll.x - drag.dx / view.zoom, y: scroll.y - drag.dy / view.zoom };
}

/** Pixel box of the iso world; the world itself is the diamond inscribed in it. */
export interface WorldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Keep the view CENTRE over the world diamond. Phaser's rectangular camera bounds let the centre
 * leave the diamond near its corners (at min zoom the view then shows no tile at all, ISO-1b), so a
 * centre outside |dx|/hw + |dy|/hh <= 1 is pulled back along the line to the diamond's middle.
 */
export function clampCentreToDiamond(
  scroll: Scroll,
  view: { width: number; height: number },
  box: WorldBox,
): Scroll {
  const hw = box.width / 2;
  const hh = box.height / 2;
  if (!(hw > 0) || !(hh > 0)) return scroll;
  const dx = scroll.x + view.width / 2 - (box.x + hw);
  const dy = scroll.y + view.height / 2 - (box.y + hh);
  const k = Math.abs(dx) / hw + Math.abs(dy) / hh;
  if (!(k > 1)) return scroll;
  return { x: scroll.x - dx + dx / k, y: scroll.y - dy + dy / k };
}
