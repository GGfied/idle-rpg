import type Phaser from 'phaser';
import { ISO } from './iso';
import { tileNoise } from './palette';

/** Tiles of padding around a region whose terrain is read to shade the shore correctly at its edges. */
export const SHORE_PAD = 4;
const FAR = 9;

const DEEP_A = [30, 84, 160] as const;
const DEEP_B = [44, 112, 184] as const;
const SHALLOW = [112, 196, 196] as const;

/** Water that is open for swimming-depth purposes: water, and a bridge deck over it. Unknown counts as water. */
export function isOpenWater(kind: string | undefined): boolean {
  return kind === undefined || kind === 'water' || kind === 'bridge';
}

export interface ShoreField {
  /** Chamfer distance (tiles) from tile (x, y) to the nearest land tile; 0 on land, FAR when far/unknown. */
  at(x: number, y: number): number;
}

/**
 * Distance-to-land field for the tiles of [x0, x0+w) x [y0, y0+h), padded by SHORE_PAD, by a
 * two-pass chamfer transform (cost ~ (w + 2 pad)^2, once per chunk paint, not per pixel).
 */
export function shoreField(
  kindAt: (x: number, y: number) => string | undefined,
  x0: number,
  y0: number,
  w: number,
  h: number,
): ShoreField {
  const gx = x0 - SHORE_PAD;
  const gy = y0 - SHORE_PAD;
  const gw = w + SHORE_PAD * 2;
  const gh = h + SHORE_PAD * 2;
  const d = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) d[j * gw + i] = isOpenWater(kindAt(gx + i, gy + j)) ? FAR : 0;
  const D = 1.4142;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      let v = d[j * gw + i]!;
      if (i > 0) v = Math.min(v, d[j * gw + i - 1]! + 1);
      if (j > 0) {
        v = Math.min(v, d[(j - 1) * gw + i]! + 1);
        if (i > 0) v = Math.min(v, d[(j - 1) * gw + i - 1]! + D);
        if (i < gw - 1) v = Math.min(v, d[(j - 1) * gw + i + 1]! + D);
      }
      d[j * gw + i] = v;
    }
  for (let j = gh - 1; j >= 0; j--)
    for (let i = gw - 1; i >= 0; i--) {
      let v = d[j * gw + i]!;
      if (i < gw - 1) v = Math.min(v, d[j * gw + i + 1]! + 1);
      if (j < gh - 1) {
        v = Math.min(v, d[(j + 1) * gw + i]! + 1);
        if (i < gw - 1) v = Math.min(v, d[(j + 1) * gw + i + 1]! + D);
        if (i > 0) v = Math.min(v, d[(j + 1) * gw + i - 1]! + D);
      }
      d[j * gw + i] = v;
    }
  return {
    at(x, y) {
      const i = x - gx;
      const j = y - gy;
      return i < 0 || j < 0 || i >= gw || j >= gh ? FAR : d[j * gw + i]!;
    },
  };
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Smooth value noise in [0,1) over world tile coordinates. */
function vnoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = tileNoise(x0 + salt, y0);
  const b = tileNoise(x0 + 1 + salt, y0);
  const c = tileNoise(x0 + salt, y0 + 1);
  const e = tileNoise(x0 + 1 + salt, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Water colour at a tile CORNER (cx, cy are half-integer tile coordinates, e.g. x - 0.5), shared by
 * the four tiles meeting there, so neighbouring tiles agree and no tile grid shows. Shallow
 * turquoise near land, deep blue away from it, with slow world-space noise on the deep colour.
 */
export function waterCornerColor(field: ShoreField, cx: number, cy: number): number {
  const fx = Math.floor(cx);
  const fy = Math.floor(cy);
  const dist =
    (field.at(fx, fy) + field.at(fx + 1, fy) + field.at(fx, fy + 1) + field.at(fx + 1, fy + 1)) / 4;
  const shallow = 1 - smoothstep(0.5, 2.7, dist);
  const n = vnoise(cx / 7, cy / 7, 17) * 0.65 + vnoise(cx / 2.5, cy / 2.5, 31) * 0.35;
  const fine = (tileNoise(Math.round(cx * 2), Math.round(cy * 2)) - 0.5) * 0.06;
  const k = 1 + (vnoise(cx / 3.5, cy / 3.5, 53) - 0.5) * 0.16 + fine;
  const ch = (i: 0 | 1 | 2) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(lerp(lerp(DEEP_A[i], DEEP_B[i], n), SHALLOW[i], shallow * 0.85) * k),
      ),
    );
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}

/** Where the shaded water base goes: a Graphics drawn BEFORE any ground texture stamps, plus the shore field. */
export interface WaterBase {
  base: Phaser.GameObjects.Graphics;
  field: ShoreField;
  /** False under Phaser's CANVAS renderer, which ignores fillGradientStyle and fills black. Default true. */
  gradient?: boolean;
}

/** Phaser.CANVAS (the renderer type constant; render/ imports Phaser as a type only). */
const RENDERER_CANVAS = 1;

/** True when `scene`'s renderer draws fillGradientStyle (WebGL). Unknown renderer (test fakes) = true. */
export function rendererHasGradients(scene: Phaser.Scene): boolean {
  return scene.sys?.game?.renderer?.type !== RENDERER_CANVAS;
}

/** Sub-cells per tile side of the CANVAS fallback (colour steps are 1/FLAT_N of a tile apart). */
const FLAT_N = 4;
/** Overlap of neighbouring flat sub-cells (px) so Canvas antialiasing leaves no hairline seams. */
const FLAT_GROW = 0.6;

const channel = (c: number, sh: number): number => (c >> sh) & 255;

/**
 * CANVAS fallback for the two-triangle gradient: the tile as FLAT_N x FLAT_N tiny diamonds, each one
 * flat colour bilinearly interpolated from the four shared corner colours (u along +x, v along +y in
 * tile space: top = (0,0), right = (1,0), bottom = (1,1), left = (0,1)).
 */
function paintFlatSubCells(
  g: Phaser.GameObjects.Graphics,
  top: number,
  right: number,
  bottom: number,
  left: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): void {
  const n = FLAT_N;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      let col = 0;
      for (const sh of [16, 8, 0]) {
        const k =
          channel(top, sh) * (1 - u) * (1 - v) +
          channel(right, sh) * u * (1 - v) +
          channel(bottom, sh) * u * v +
          channel(left, sh) * (1 - u) * v;
        col = (col << 8) | Math.round(k);
      }
      // Sub-cell centre, half-extents (grown a little).
      const sx = cx + (u - v) * hw;
      const sy = cy - hh + (u + v) * hh;
      const dw = hw / n + FLAT_GROW * 2;
      const dh = hh / n + FLAT_GROW;
      g.fillStyle(col, 1)
        .fillTriangle(sx, sy - dh, sx + dw, sy, sx - dw, sy)
        .fillTriangle(sx - dw, sy, sx + dw, sy, sx, sy + dh);
    }
}

/**
 * One water tile as two vertex-shaded triangles (colours from the shared tile corners), grown by
 * `grow` px like the other ground diamonds so neighbours overlap without seams.
 */
export function paintWaterTile(
  w: WaterBase,
  x: number,
  y: number,
  cx: number,
  cy: number,
  grow: number,
): void {
  const hw = ISO.tileWidth / 2 + grow * 2;
  const hh = ISO.tileHeight / 2 + grow;
  const top = waterCornerColor(w.field, x - 0.5, y - 0.5);
  const right = waterCornerColor(w.field, x + 0.5, y - 0.5);
  const bottom = waterCornerColor(w.field, x + 0.5, y + 0.5);
  const left = waterCornerColor(w.field, x - 0.5, y + 0.5);
  if (w.gradient === false) {
    paintFlatSubCells(w.base, top, right, bottom, left, cx, cy, hw, hh);
    return;
  }
  // vertex order is TL, TR, BL of fillGradientStyle: top/right/left, then left/right/bottom
  w.base
    .fillGradientStyle(top, right, left, left, 1)
    .fillTriangle(cx, cy - hh, cx + hw, cy, cx - hw, cy);
  w.base
    .fillGradientStyle(left, right, bottom, bottom, 1)
    .fillTriangle(cx - hw, cy, cx + hw, cy, cx, cy + hh);
}
