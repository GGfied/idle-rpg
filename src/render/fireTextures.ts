import type Phaser from 'phaser';
import {
  ASHES_FRAME,
  FIRE_FRAME,
  FLAME_FRAME,
  GLOW_FRAME,
  paintAshesHeap,
  paintFireBase,
  paintFireEmbers,
  paintFireFront,
  paintFireGlow,
  paintLogPile,
  LOG_PILE_BARK,
  LOG_PILE_DEFAULT,
  paintFlameLayer,
} from './fireArt';
import type { FlameLayer } from './fireArt';

/** Unknown log ids share the default pile (and its texture). */
const logPileId = (id: string): string => (id in LOG_PILE_BARK ? id : LOG_PILE_DEFAULT);

export const fireTextureKeys = {
  base: (dying: boolean): string => `fire_base${dying ? '_dying' : ''}`,
  front: (dying: boolean): string => `fire_front${dying ? '_dying' : ''}`,
  flame: (layer: FlameLayer): string => `fire_flame_${layer}`,
  glow: 'fire_glow',
  embers: 'fire_embers',
  ashes: 'ashes_heap',
  logPile: (id: string): string => `logpile_${logPileId(id)}`,
} as const;

function upload(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  paint: () => Uint8ClampedArray,
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const img = tex.context.createImageData(w, h);
  img.data.set(paint());
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/** Uploads (once per scene) a fire texture and returns its key. */
export const getFireBase = (s: Phaser.Scene, dying: boolean): string =>
  upload(s, fireTextureKeys.base(dying), FIRE_FRAME.w, FIRE_FRAME.h, () => paintFireBase(dying));
export const getFireFront = (s: Phaser.Scene, dying: boolean): string =>
  upload(s, fireTextureKeys.front(dying), FIRE_FRAME.w, FIRE_FRAME.h, () => paintFireFront(dying));
export const getFlameTexture = (s: Phaser.Scene, layer: FlameLayer): string =>
  upload(s, fireTextureKeys.flame(layer), FLAME_FRAME.w, FLAME_FRAME.h, () =>
    paintFlameLayer(layer),
  );
export const getFireGlow = (s: Phaser.Scene): string =>
  upload(s, fireTextureKeys.glow, GLOW_FRAME.w, GLOW_FRAME.h, paintFireGlow);
export const getFireEmbers = (s: Phaser.Scene): string =>
  upload(s, fireTextureKeys.embers, FIRE_FRAME.w, FIRE_FRAME.h, paintFireEmbers);
export const getAshesTexture = (s: Phaser.Scene): string =>
  upload(s, fireTextureKeys.ashes, ASHES_FRAME.w, ASHES_FRAME.h, paintAshesHeap);
export const getLogPileTexture = (s: Phaser.Scene, logsId: string): string =>
  upload(s, fireTextureKeys.logPile(logsId), FIRE_FRAME.w, FIRE_FRAME.h, () =>
    paintLogPile(logPileId(logsId)),
  );
