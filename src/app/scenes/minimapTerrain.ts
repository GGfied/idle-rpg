import type { Tile } from '@core/contracts';
import { buildMinimapWindow, minimapWindowCovers } from '@render/index';
import type { MinimapImage } from '@render/index';
import { WORLD_DEF, regionEdges } from '@features/world';

/** Tiles each side of the centre that one window image holds (96 x 96 tiles, 4 px each: small). */
export const WINDOW_HALF_TILES = 48;

export interface MinimapTerrain {
  image: MinimapImage;
  canvas: HTMLCanvasElement;
}

/**
 * The minimap's terrain: an offscreen image of the world around the player, rebuilt only when the
 * circular view (`viewHalfTiles` around `centre`) is about to leave it. Returns the same object
 * while the window still covers the view.
 */
export function createMinimapTerrain(
  pxPerTile: number,
): (centre: Tile, viewHalfTiles: number) => MinimapTerrain {
  let cached: MinimapTerrain | null = null;
  return (centre, viewHalfTiles) => {
    if (cached && minimapWindowCovers(cached.image, centre, viewHalfTiles)) return cached;
    const image = buildMinimapWindow(
      (x, y) => WORLD_DEF.terrainAt(x, y),
      centre,
      WINDOW_HALF_TILES,
      { pxPerTile, edges: regionEdges() },
    );
    const canvas = cached?.canvas ?? document.createElement('canvas');
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
  };
}
