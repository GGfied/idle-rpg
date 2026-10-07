import type Phaser from 'phaser';
import { ISO } from './iso';

const HALF_H = ISO.tileHeight / 2;

export interface BlockStyle {
  /** Base 0xRRGGBB of the block; faces are shaded from it. */
  color: number;
  /** Block height in px above the ground diamond. */
  height: number;
  /** Paint a dark doorway on this face ('left' = faces down-left, 'right' = faces down-right). */
  door?: 'left' | 'right';
  /** Doorway height in px (default: 72% of the block height). */
  doorHeight?: number;
  /** Extra detail on both faces, painted after the faces and before the doorway (stone joints, planks). */
  paintFaces?: (g: Phaser.GameObjects.Graphics, geom: BlockGeom) => void;
  /** Extra detail painted after the doorway, on the door's face (pilasters, step, sign). */
  paintFront?: (g: Phaser.GameObjects.Graphics, geom: BlockGeom, face: 'left' | 'right') => void;
}

/** Texture-space geometry of a block: width, centre of its ground diamond, wall height. */
export interface BlockGeom {
  w: number;
  cx: number;
  cy: number;
  hh: number;
}

/**
 * Maps (s, v) on a block face to texture px: s runs 0..1 from the face's screen-left to its
 * screen-right edge, v is px above the ground. Text and doors read left to right on both faces.
 */
export function faceMap(face: 'left' | 'right', geom: BlockGeom) {
  return (s: number, v: number) =>
    face === 'left'
      ? { x: s * geom.cx, y: geom.cy + s * HALF_H - v }
      : { x: geom.cx + s * geom.cx, y: geom.cy + (1 - s) * HALF_H - v };
}

/** Multiplies each channel of a 0xRRGGBB colour by `f` (clamped). */
export function shadeColor(color: number, f: number): number {
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)));
  return (c((color >> 16) & 255) << 16) | (c((color >> 8) & 255) << 8) | c(color & 255);
}

/** Image origin Y (0..1) that puts the ground-diamond centre of a block texture on its tile. */
export function blockOriginY(height: number): number {
  return (HALF_H + height) / (ISO.tileHeight + height);
}

/**
 * Generates (once per key) an upright one-tile block texture: left face, right face, lit cap and
 * an optional doorway. Shared by the plain wall block and the building walls.
 */
export function ensureBlockTexture(scene: Phaser.Scene, key: string, style: BlockStyle): void {
  if (scene.textures.exists(key)) return;
  const w = ISO.tileWidth;
  const hh = style.height;
  const cx = w / 2;
  const cy = HALF_H + hh; // ground diamond centre in texture space
  const top = cy - hh;
  const g = scene.make.graphics({}, false);
  g.fillStyle(shadeColor(style.color, 0.8), 1).fillPoints(
    [
      { x: 0, y: top },
      { x: cx, y: top + HALF_H },
      { x: cx, y: cy + HALF_H },
      { x: 0, y: cy },
    ],
    true,
  ); // left face
  g.fillStyle(shadeColor(style.color, 0.62), 1).fillPoints(
    [
      { x: w, y: top },
      { x: cx, y: top + HALF_H },
      { x: cx, y: cy + HALF_H },
      { x: w, y: cy },
    ],
    true,
  ); // right face
  g.fillStyle(shadeColor(style.color, 1.15), 1).fillPoints(
    [
      { x: cx, y: top - HALF_H },
      { x: w, y: top },
      { x: cx, y: top + HALF_H },
      { x: 0, y: top },
    ],
    true,
  ); // cap
  g.lineStyle(1, 0x000000, 0.25).strokePoints(
    [
      { x: 0, y: top },
      { x: cx, y: top - HALF_H },
      { x: w, y: top },
      { x: cx, y: top + HALF_H },
    ],
    true,
  );
  const geom: BlockGeom = { w, cx, cy, hh };
  style.paintFaces?.(g, geom);
  if (style.door) paintDoor(g, style.door, geom, style.doorHeight ?? Math.min(hh * 0.72, hh - 6));
  if (style.door) style.paintFront?.(g, geom, style.door);
  g.generateTexture(key, w, ISO.tileHeight + hh);
  g.destroy();
}

/** Dark doorway on the middle of a face, with a lintel line. */
function paintDoor(
  g: Phaser.GameObjects.Graphics,
  face: 'left' | 'right',
  geom: BlockGeom,
  doorH: number,
): void {
  const m = faceMap(face, geom);
  const quad = [m(0.22, 0), m(0.78, 0), m(0.78, doorH), m(0.22, doorH)];
  g.fillStyle(0x1c1410, 1).fillPoints(quad, true);
  g.lineStyle(2, 0x5a3b22, 1).strokePoints(quad, true);
}
