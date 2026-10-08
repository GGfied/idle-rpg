import { buildMinimapImage } from '@render/index';
import type { MinimapImage } from '@render/index';
import { WORLD_DEF, regionEdges } from '@features/world';

/** Image px per tile of the whole-world terrain image (the painter rescales it). */
export const WORLD_TERRAIN_PX_PER_TILE = 4;

export interface WorldTerrain {
  image: MinimapImage;
  canvas: HTMLCanvasElement;
}

let cached: WorldTerrain | null = null;

/** The whole world as one offscreen canvas, built on first use and kept (terrain never changes). */
export function worldTerrain(): WorldTerrain {
  if (cached) return cached;
  const image = buildMinimapImage(
    {
      width: WORLD_DEF.widthTiles,
      height: WORLD_DEF.heightTiles,
      kindAt: (x, y) => WORLD_DEF.terrainAt(x, y),
    },
    { pxPerTile: WORLD_TERRAIN_PX_PER_TILE, edges: regionEdges() },
  );
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    );
  cached = { image, canvas };
  return cached;
}
