import type Phaser from 'phaser';
import { FLOWER_SWAY, FLOWER_VIEW_MARGIN } from './data';
import { idUnit, swayAngle } from './logic';
import type { MotionMode } from './types';

/** The part of a Phaser Image the sway touches (origin is the stem base). */
interface SwayImage {
  x: number;
  y: number;
  rotation: number;
  visible: boolean;
  active: boolean;
}

/** Camera world rect; Phaser's `camera.worldView` fits. */
export interface SwayView {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

interface Entry {
  img: SwayImage;
  /** Position the phase was derived from; pooled images get a new phase when they move. */
  px: number;
  py: number;
  phase: number;
  speed: number;
}

export interface FlowerSway {
  /** Hook for `createChunkRenderer({ onFlowerCreated })`. */
  add(img: Phaser.GameObjects.Image): void;
  /** Once per frame: scene time in ms and the camera's world view. */
  update(timeMs: number, view: SwayView): void;
  count(): number;
}

/**
 * One shared ticker for flower sway: rotates each flower Image around its stem base (origin
 * bottom-middle). Phase and speed come from the flower's world position, so they are stable per
 * placement. Pooled-away (invisible) and off-screen images are skipped; destroyed ones are pruned.
 * `mode` is read each frame. Allocation-free once an image is registered.
 */
export function createFlowerSway(mode: () => MotionMode): FlowerSway {
  const entries: Entry[] = [];
  return {
    add(img) {
      entries.push({ img, px: NaN, py: NaN, phase: 0, speed: 0 });
    },
    update(timeMs, view) {
      const m = FLOWER_SWAY[mode()];
      const still = m.swayDeg === 0 && m.gustDeg === 0;
      const left = view.x - FLOWER_VIEW_MARGIN;
      const right = view.right + FLOWER_VIEW_MARGIN;
      const top = view.y - FLOWER_VIEW_MARGIN;
      const bottom = view.bottom + FLOWER_VIEW_MARGIN;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (!e) continue;
        const img = e.img;
        if (!img.active) {
          const last = entries.pop();
          if (last && last !== e) entries[i] = last;
          continue;
        }
        if (!img.visible) continue;
        if (still) {
          if (img.rotation !== 0) img.rotation = 0;
          continue;
        }
        const x = img.x;
        const y = img.y;
        if (x < left || x > right || y < top || y > bottom) continue;
        if (x !== e.px || y !== e.py) {
          e.px = x;
          e.py = y;
          const key = `${x},${y}`;
          e.phase = idUnit(key);
          e.speed = idUnit(key + '#');
        }
        img.rotation = swayAngle(m, timeMs, x, e.phase, e.speed);
      }
    },
    count: () => entries.length,
  };
}
