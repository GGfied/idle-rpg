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

export interface WorldPx {
  width: number;
  height: number;
}

function clampAxis(value: number, viewPx: number, zoom: number, worldPx: number): number {
  const shown = viewPx / zoom; // world px visible along this axis
  const min = (shown - viewPx) / 2; // Phaser measures scroll so the zoomed view stays centred
  const max = Math.max(min, min + worldPx - shown);
  return Math.min(max, Math.max(min, value));
}

/** Keep a scroll position inside the world (the same clamp Phaser applies to bounded cameras). */
export function clampScroll(scroll: Scroll, view: PanView, world: WorldPx): Scroll {
  return {
    x: clampAxis(scroll.x, view.width, view.zoom, world.width),
    y: clampAxis(scroll.y, view.height, view.zoom, world.height),
  };
}

/**
 * Drag the world with the pointer: a drag of (dx, dy) canvas px moves the scroll by -dx/zoom,
 * -dy/zoom world px, clamped to the world. Non-finite input leaves the scroll unchanged.
 */
export function panScroll(
  scroll: Scroll,
  drag: { dx: number; dy: number },
  view: PanView,
  world: WorldPx,
): Scroll {
  if (!(view.zoom > 0) || !Number.isFinite(drag.dx) || !Number.isFinite(drag.dy)) return scroll;
  return clampScroll(
    { x: scroll.x - drag.dx / view.zoom, y: scroll.y - drag.dy / view.zoom },
    view,
    world,
  );
}
