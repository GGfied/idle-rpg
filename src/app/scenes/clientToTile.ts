import type { Tile } from '@core/contracts';
import { isoProjection } from '@render/index';

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The parts of a Phaser camera the conversion needs (zoom is about the viewport centre). */
export interface CameraView {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

export interface MapBounds {
  width: number;
  height: number;
}

/**
 * Pointer position in page (client) px -> map tile, or null outside the map.
 * `rect` is the canvas's displayed box and `canvas` its backing size, so a CSS-scaled canvas
 * still maps correctly: client px -> canvas px -> world px -> iso diamond tile.
 */
export function clientToTile(
  clientX: number,
  clientY: number,
  rect: ClientRect,
  canvas: { width: number; height: number },
  cam: CameraView,
  bounds: MapBounds,
): Tile | null {
  const w = clientToWorld(clientX, clientY, rect, canvas, cam);
  const t = w && isoProjection.pickTile(w.x, w.y, bounds.width, bounds.height);
  return t ? { x: t.tx, y: t.ty } : null;
}

/** Pointer position in page px -> world px (same maths as clientToTile, before tiling). */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: ClientRect,
  canvas: { width: number; height: number },
  cam: CameraView,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || cam.zoom <= 0) return null;
  const cx = ((clientX - rect.left) * canvas.width) / rect.width;
  const cy = ((clientY - rect.top) * canvas.height) / rect.height;
  const wx = cam.scrollX + cam.width / 2 + (cx - cam.width / 2) / cam.zoom;
  const wy = cam.scrollY + cam.height / 2 + (cy - cam.height / 2) / cam.zoom;
  return { x: wx, y: wy };
}
