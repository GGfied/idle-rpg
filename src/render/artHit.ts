/** The bits of a Phaser Image the pixel hit test reads (kept structural so it is testable without Phaser). */
export interface HitImage {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  displayOriginX: number;
  displayOriginY: number;
  texture: { key: string };
  frame: { name: string | number };
}

export interface HitTextures {
  getPixelAlpha(x: number, y: number, key: string, frame?: string | number): number | null;
}

/**
 * Is the image drawn opaque (alpha > 20) at a world point? Follows the image's own position,
 * rotation (tree sway) and scale inside its container at `(cx, cy)`. Shared by trees and rocks:
 * "what you see wins".
 */
export function opaqueAtImage(
  textures: HitTextures,
  container: { x: number; y: number },
  art: HitImage,
  wx: number,
  wy: number,
): boolean {
  const dx = wx - container.x - art.x;
  const dy = wy - container.y - art.y;
  const c = Math.cos(-art.rotation);
  const s = Math.sin(-art.rotation);
  const lx = (dx * c - dy * s) / art.scaleX + art.displayOriginX;
  const ly = (dx * s + dy * c) / art.scaleY + art.displayOriginY;
  if (lx < 0 || ly < 0 || lx >= art.width || ly >= art.height) return false;
  const a = textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), art.texture.key, art.frame.name);
  return (a ?? 0) > 20;
}
