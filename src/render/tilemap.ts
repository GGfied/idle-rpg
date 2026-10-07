import type Phaser from 'phaser';
import { TILE_SIZE } from './coords';
import { LAYERS } from './depth';
import { DEFAULT_PALETTE, tileColor, tileNoise, type TilePalette } from './palette';

export interface TileSource {
  width: number;
  height: number;
  kindAt(x: number, y: number): string | undefined;
}

/**
 * Draws the whole map once into a single RenderTexture-backed Image (one GameObject).
 * Unknown/undefined kinds are skipped (left transparent) when undefined, magenta when unknown.
 */
export function drawTilemap(
  scene: Phaser.Scene,
  source: TileSource,
  palette: TilePalette = DEFAULT_PALETTE,
): Phaser.GameObjects.RenderTexture {
  const w = source.width * TILE_SIZE;
  const h = source.height * TILE_SIZE;
  const g = scene.make.graphics({}, false);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const kind = source.kindAt(x, y);
      if (kind === undefined) continue;
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      g.fillStyle(tileColor(kind, x, y, palette), 1);
      g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      decorate(g, kind, x, y, px, py);
    }
  }
  const rt = scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(LAYERS.GROUND);
  rt.draw(g);
  g.destroy();
  return rt;
}

function decorate(
  g: Phaser.GameObjects.Graphics,
  kind: string,
  x: number,
  y: number,
  px: number,
  py: number,
): void {
  if (kind === 'flowers') {
    const colors = [0xf2d03b, 0xe8e8f0, 0xd9547a];
    for (let i = 0; i < 3; i++) {
      const n = tileNoise(x * 7 + i, y * 13 + i);
      const m = tileNoise(y * 5 + i, x * 11 + i);
      g.fillStyle(colors[i] ?? 0xffffff, 1);
      g.fillRect(px + 4 + Math.floor(n * 22), py + 4 + Math.floor(m * 22), 3, 3);
    }
  } else if (kind === 'floor') {
    // Four horizontal planks; seams between them, plus a staggered end joint per plank.
    g.fillStyle(0x000000, 0.22);
    for (let i = 1; i < 4; i++) {
      g.fillRect(px, py + i * 8 - 1, TILE_SIZE, 1);
      g.fillRect(px + Math.floor(tileNoise(x * 4 + i, y) * 26) + 3, py + (i - 1) * 8, 1, 7);
    }
    g.fillRect(px + Math.floor(tileNoise(x * 4, y) * 26) + 3, py + 24, 1, 8);
    g.fillStyle(0xffffff, 0.06);
    for (let i = 0; i < 4; i++) g.fillRect(px, py + i * 8, TILE_SIZE, 1);
  } else if (kind === 'wall') {
    g.fillStyle(0x000000, 0.35); // dark top edge: reads as a building seen from above
    g.fillRect(px, py, TILE_SIZE, 3);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
    g.fillRect(px + 15, py, 2, TILE_SIZE - 4);
  } else if (kind === 'water') {
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(px + 4 + Math.floor(tileNoise(x, y) * 12), py + 10, 10, 2);
  }
}
