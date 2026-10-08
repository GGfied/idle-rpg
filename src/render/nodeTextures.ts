import type Phaser from 'phaser';
import { paintRockPixels, ROCK_FEET_Y, ROCK_TEX_H, ROCK_TEX_W } from './rockArt';
import type { RockArtKind, RockPixels } from './rockArt';
import { paintSpotPixels, SPOT_TEX_H, SPOT_TEX_W } from './spotArt';
import type { SpotArtKind } from './spotArt';

/** Origin y (0-1) that puts a rock's base on the view's feet. */
export const ROCK_ORIGIN_Y = ROCK_FEET_Y / ROCK_TEX_H;

export const rockTextureKey = (kind: RockArtKind, variant: number, depleted: boolean): string =>
  `rock_${kind}_${variant}${depleted ? '_rubble' : ''}`;
export const spotTextureKey = (kind: SpotArtKind, frame: number): string => `spot_${kind}_${frame}`;
export const GLINT_KEY = 'node_glint';

const glintCache = new Map<string, RockPixels['glints']>();

function upload(scene: Phaser.Scene, key: string, w: number, h: number, data: Uint8ClampedArray) {
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const img = tex.context.createImageData(w, h);
  img.data.set(data);
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
}

/** Uploads (once per scene) a rock/rubble texture; returns its key. */
export function getRockTexture(
  scene: Phaser.Scene,
  kind: RockArtKind,
  variant: number,
  depleted: boolean,
): string {
  const key = rockTextureKey(kind, variant, depleted);
  if (scene.textures.exists(key)) return key;
  const px = paintRockPixels(kind, variant, depleted);
  glintCache.set(key, px.glints);
  upload(scene, key, ROCK_TEX_W, ROCK_TEX_H, px.data);
  return key;
}

/** Glint pixels (texture space) of a rock texture made by `getRockTexture`. */
export const glintsOf = (key: string): RockPixels['glints'] => glintCache.get(key) ?? [];

export function getSpotTexture(scene: Phaser.Scene, kind: SpotArtKind, frame: number): string {
  const key = spotTextureKey(kind, frame);
  if (!scene.textures.exists(key))
    upload(scene, key, SPOT_TEX_W, SPOT_TEX_H, paintSpotPixels(kind, frame));
  return key;
}

/** A small 7x7 four-point sparkle, shared by every rock. */
export function getGlintTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(GLINT_KEY)) return GLINT_KEY;
  const d = new Uint8ClampedArray(7 * 7 * 4);
  const set = (x: number, y: number, a: number): void => {
    d.set([255, 250, 225, a], (y * 7 + x) * 4);
  };
  for (let i = 0; i < 7; i++) {
    const a = i === 3 ? 255 : 255 - Math.abs(i - 3) * 70;
    set(i, 3, a);
    set(3, i, a);
  }
  upload(scene, GLINT_KEY, 7, 7, d);
  return GLINT_KEY;
}
