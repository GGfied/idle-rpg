import type Phaser from 'phaser';
import {
  paintTreePixels,
  TREE_FEET_Y,
  TREE_TEX_H,
  TREE_TEX_W,
  TREE_VARIANTS,
  treeVariantFor,
} from './treeArt';
import type { TreeArtKind, TreeShape } from './treeArt';

export { TREE_VARIANTS, treeVariantFor };

/** Origin y (0-1) that puts the trunk base on the view's feet. */
export const TREE_ORIGIN_Y = TREE_FEET_Y / TREE_TEX_H;

export function treeTextureKey(kind: TreeArtKind, variant: number, stump: boolean): string {
  return `tree_${kind}_${variant}${stump ? '_stump' : ''}`;
}

/** Uploads (once per scene) and returns the texture key for a tree variant. */
export function getTreeTexture(
  scene: Phaser.Scene,
  shape: TreeShape,
  kind: TreeArtKind,
  variant: number,
  stump: boolean,
): string {
  const key = treeTextureKey(kind, variant, stump);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, TREE_TEX_W, TREE_TEX_H);
  if (!tex) return key;
  const ctx = tex.context;
  const img = ctx.createImageData(TREE_TEX_W, TREE_TEX_H);
  img.data.set(paintTreePixels(shape, kind, variant, stump));
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}
