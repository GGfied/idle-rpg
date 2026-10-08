import { clampWorldMapScale } from '@render/index';
import type { WorldMapView } from '@render/index';

/** Wheel notch -> scale factor (deltaY > 0 zooms out). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-Math.max(-300, Math.min(300, deltaY)) * 0.0015);
}

type Bounds = { width: number; height: number };

/** One axis: world larger than the frame -> centre stays where the frame is filled; else centred. */
function clampAxis(c: number, world: number, frame: number, s: number): number {
  const half = frame / (2 * s);
  return world * s <= frame ? world / 2 : Math.min(world - half, Math.max(half, c));
}

/** Keep the world filling the frame (or centred when smaller), at the view's current zoom. */
export function clampView(view: WorldMapView): WorldMapView {
  const b: Bounds | undefined = view.bounds;
  if (!b) return view;
  const s = view.pxPerTile;
  return {
    ...view,
    centre: {
      x: clampAxis(view.centre.x, b.width, view.w, s),
      y: clampAxis(view.centre.y, b.height, view.h, s),
    },
  };
}

/** Drag by (dx, dy) canvas px: the map follows the finger, so the centre moves the other way. */
export function panView(view: WorldMapView, dx: number, dy: number): WorldMapView {
  const s = view.pxPerTile;
  return clampView({ ...view, centre: { x: view.centre.x - dx / s, y: view.centre.y - dy / s } });
}

/**
 * Multiply the scale by `factor` (clamped: min fits the world, max is the render cap), keeping the
 * tile under canvas px (ax, ay) fixed so wheel/pinch zoom toward the pointer; then clamp the pan.
 */
export function zoomView(
  view: WorldMapView,
  factor: number,
  ax = view.w / 2,
  ay = view.h / 2,
): WorldMapView {
  const before = view.pxPerTile;
  const after = clampWorldMapScale(before * factor, view);
  const tx = view.centre.x + (ax - view.w / 2) / before;
  const ty = view.centre.y + (ay - view.h / 2) / before;
  const centre = { x: tx - (ax - view.w / 2) / after, y: ty - (ay - view.h / 2) / after };
  return clampView({ ...view, pxPerTile: after, centre });
}

/** "Centre on me": same zoom, centred on the player, as far as the clamp allows. */
export function centreOn(view: WorldMapView, tile: { x: number; y: number }): WorldMapView {
  return clampView({ ...view, centre: tile });
}

/** Initial view: the whole world fitted and centred in the frame. */
export function initialView(w: number, h: number, bounds: Bounds): WorldMapView {
  const base: WorldMapView = {
    centre: { x: bounds.width / 2, y: bounds.height / 2 },
    w,
    h,
    pxPerTile: 0,
    bounds,
  };
  return clampView({ ...base, pxPerTile: clampWorldMapScale(0, base) });
}

/** What a key press means for the open overlay. */
export function worldMapKeyIntent(key: string): 'close' | null {
  return key === 'Escape' ? 'close' : null;
}
