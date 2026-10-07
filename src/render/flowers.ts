import type Phaser from 'phaser';
import { tileNoise } from './palette';
import { isoProjection as proj } from './projection';

export const FLOWER_VARIETIES = ['daisy', 'poppy', 'cornflower', 'buttercup'] as const;
export type FlowerVariety = (typeof FLOWER_VARIETIES)[number];

/** Flowers planted on each `flowers` tile. */
export const FLOWERS_PER_TILE = 3;

export interface FlowerSpec {
  /** Tile-space offset from the tile middle (inside the tile). */
  ox: number;
  oy: number;
  variety: FlowerVariety;
}

/** What `onFlowerCreated` and each flower Image's `getData('flower')` carry. */
export interface FlowerData extends FlowerSpec {
  tx: number;
  ty: number;
  /** World px of the stem base (the Image origin): sway rotates around it. */
  baseX: number;
  baseY: number;
}

const TEX = (v: FlowerVariety) => `iso_flower_${v}`;
const W = 11;
const H = 15;
/** Image origin: the stem base, bottom middle. */
export const FLOWER_ORIGIN = { x: 0.5, y: 1 };

/** Deterministic flower layout of tile (x, y): same tile, same flowers, every time. */
export function flowersForTile(x: number, y: number, out: FlowerSpec[] = []): FlowerSpec[] {
  out.length = 0;
  for (let i = 0; i < FLOWERS_PER_TILE; i++) {
    const v = Math.floor(tileNoise(x * 7 + i * 3, y * 13 + i) * FLOWER_VARIETIES.length);
    out.push({
      ox: (tileNoise(x * 7 + i, y * 13 + i) - 0.5) * 0.7,
      oy: (tileNoise(y * 5 + i, x * 11 + i) - 0.5) * 0.7,
      variety: FLOWER_VARIETIES[v % FLOWER_VARIETIES.length]!,
    });
  }
  return out;
}

const PETALS: Record<FlowerVariety, { petal: number; centre: number; round: boolean }> = {
  daisy: { petal: 0xf4f1ea, centre: 0xf2c230, round: false },
  poppy: { petal: 0xd8322c, centre: 0x2a1a1a, round: true },
  cornflower: { petal: 0x4f78d8, centre: 0x2b3f8c, round: false },
  buttercup: { petal: 0xf5d21f, centre: 0xd89a10, round: true },
};

/** Generates (once per variety) the small pixel-art flower: stem, two leaves, petals. */
export function ensureFlowerTextures(scene: Phaser.Scene): void {
  for (const v of FLOWER_VARIETIES) {
    if (scene.textures.exists(TEX(v))) continue;
    const s = PETALS[v];
    const g = scene.make.graphics({}, false);
    const cx = 5;
    g.fillStyle(0x000000, 0.18).fillRect(cx - 2, H - 1, 5, 1); // ground shadow
    g.fillStyle(0x2f6b2a, 1).fillRect(cx, 5, 1, H - 5); // stem
    g.fillStyle(0x3f8a36, 1)
      .fillRect(cx - 2, 10, 2, 1)
      .fillRect(cx - 3, 9, 1, 1) // left leaf
      .fillRect(cx + 1, 8, 2, 1)
      .fillRect(cx + 3, 7, 1, 1); // right leaf
    g.fillStyle(s.petal, 1);
    if (s.round) g.fillRect(cx - 2, 2, 5, 3).fillRect(cx - 1, 1, 3, 5);
    else
      g.fillRect(cx - 1, 0, 3, 1)
        .fillRect(cx - 3, 2, 7, 3)
        .fillRect(cx - 1, 5, 3, 1)
        .fillRect(cx - 2, 1, 5, 1)
        .fillRect(cx - 2, 5, 1, 0);
    g.fillStyle(s.centre, 1)
      .fillRect(cx - 1, 3, 3, 1)
      .fillRect(cx, 2, 1, 3);
    g.generateTexture(TEX(v), W, H);
    g.destroy();
  }
}

/** Places (or reuses) a flower Image on tile (x, y); depth-sorted with entities by its base. */
export function placeFlower(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image | undefined,
  x: number,
  y: number,
  f: FlowerSpec,
): Phaser.GameObjects.Image {
  const p = proj.tileToWorld(x + f.ox, y + f.oy);
  const bx = Math.round(p.x);
  const by = Math.round(p.y);
  const out = (img ?? scene.add.image(0, 0, TEX(f.variety)))
    .setTexture(TEX(f.variety))
    .setPosition(bx, by)
    .setOrigin(FLOWER_ORIGIN.x, FLOWER_ORIGIN.y)
    .setRotation(0)
    .setDepth(proj.depthFor(x + f.ox, y + f.oy))
    .setVisible(true);
  const data: FlowerData = { ...f, tx: x, ty: y, baseX: bx, baseY: by };
  out.setData('flower', data);
  return out;
}
