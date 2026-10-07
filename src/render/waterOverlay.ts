import type Phaser from 'phaser';
import {
  collectVisibleWater,
  dashAt,
  dashLength,
  glintAt,
  DASH_COUNT,
  WATER_MOTION,
  type Dash,
  type WaterMotion,
} from './waterModel';
import { LAYERS } from './depth';
import type { Projection } from './projection';

export interface WaterOverlayOptions {
  /** Terrain kind at a GLOBAL tile, or undefined outside the world. */
  kindAt(x: number, y: number): string | undefined;
  /** Current Animations setting; 'off' draws nothing, 'reduced' is slower and fainter. Default 'on'. */
  motion?: () => WaterMotion;
  /** The world-pixel rectangle on screen; defaults to the main camera's worldView. */
  view?: () => { x: number; y: number; width: number; height: number };
}

export interface WaterOverlay {
  /** Debug/test: water tiles shimmered by the last redraw. */
  tiles(): number;
  /** Debug/test: redraws performed. */
  redraws(): number;
  destroy(): void;
}

/**
 * Gentle water animation without touching the baked chunk textures: ONE Graphics layer above the
 * ground that, at ~8 fps (4 fps reduced, nothing when off), redraws a couple of drifting highlight
 * dashes on each water tile in view. Only the visible tiles are visited and capped, the tile list
 * is a reused array, and the layer is cleared and hidden when Animations are off. Self-driven by
 * the scene's 'update' event, so the scene only creates it (and calls destroy on shutdown).
 */
export function createWaterOverlay(
  scene: Phaser.Scene,
  projection: Projection,
  opts: WaterOverlayOptions,
): WaterOverlay {
  const g = scene.add.graphics().setDepth(LAYERS.GROUND_DECOR);
  const tiles: number[] = [];
  const dash: Dash = { ox: 0, oy: 0, a: 0 };
  let clock = 0;
  let sinceDraw = Infinity;
  let drawn = 0;
  let redraws = 0;
  let lastMode: WaterMotion = 'on';

  const draw = (mode: WaterMotion) => {
    const m = WATER_MOTION[mode];
    const view = opts.view?.() ?? scene.cameras.main.worldView;
    collectVisibleWater(view, projection, opts.kindAt, tiles);
    g.clear();
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i]!;
      const y = tiles[i + 1]!;
      for (let d = 0; d < DASH_COUNT; d++) {
        dashAt(x, y, d, clock, m.speed, dash);
        const p = projection.tileToWorld(x + dash.ox, y + dash.oy);
        const len = dashLength(x, y, d);
        g.fillStyle(0xd8eeff, 0.3 * m.alpha * dash.a).fillRect(
          Math.round(p.x - len / 2),
          Math.round(p.y),
          len,
          1,
        );
      }
      glintAt(x, y, clock, m.speed, dash);
      if (dash.a > 0.1) {
        const p = projection.tileToWorld(x + dash.ox, y + dash.oy);
        g.fillStyle(0xffffff, 0.85 * m.alpha * dash.a).fillRect(
          Math.round(p.x) - 1,
          Math.round(p.y),
          3,
          1,
        );
        g.fillStyle(0xffffff, 0.35 * m.alpha * dash.a).fillRect(
          Math.round(p.x),
          Math.round(p.y) - 1,
          1,
          3,
        );
      }
    }
    drawn = tiles.length / 2;
    redraws++;
  };

  const onUpdate = (_time: number, dt: number) => {
    const mode = opts.motion?.() ?? 'on';
    if (mode === 'off') {
      if (lastMode !== 'off') g.clear().setVisible(false);
      lastMode = mode;
      drawn = 0;
      return;
    }
    if (lastMode === 'off') {
      g.setVisible(true);
      sinceDraw = Infinity;
    }
    lastMode = mode;
    clock += dt / 1000;
    sinceDraw += dt;
    if (sinceDraw < 1000 / WATER_MOTION[mode].fps) return;
    sinceDraw = 0;
    draw(mode);
  };
  scene.events.on('update', onUpdate);

  return {
    tiles: () => drawn,
    redraws: () => redraws,
    destroy() {
      scene.events.off('update', onUpdate);
      g.destroy();
    },
  };
}
