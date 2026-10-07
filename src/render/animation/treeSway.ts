import type Phaser from 'phaser';
import type { TreeView } from '@render/index';
import { MOTION } from './data';
import { idUnit, swayAngle } from './logic';
import type { MotionMode } from './types';

/** What the sway rotates: the tree's art (origin at the trunk base) and when it shows a standing tree. */
interface SwayArt {
  rotation: number;
  visible: boolean;
}

interface Entry {
  id: string;
  container: Phaser.GameObjects.Container;
  art: SwayArt;
  phase: number;
  speed: number;
}

export interface TreeSway {
  /** Start swaying a tree view; `id` (the node id) fixes its phase and speed. Re-adding an id replaces it. */
  add(id: string, view: TreeView): void;
  remove(id: string): void;
  /** Once per frame with the scene time in ms. Only visible, standing trees are touched. */
  update(timeMs: number): void;
  count(): number;
}

/** The art child of a tree view. Prefers `view.art` (graphics), else the first child (the standing art). */
function artOf(view: TreeView): SwayArt | undefined {
  const art = (view as { art?: SwayArt }).art;
  return art ?? (view.container.list[0] as unknown as SwayArt | undefined);
}

/**
 * One shared ticker for idle tree sway. Rotates the art child only (never the container), so hit
 * boxes, depth and the chop/fall/regrow effects on the container are untouched. A stump has its
 * art hidden, so it does not sway; off-screen (culled) containers are skipped.
 * `mode` is read each frame so the Animations setting applies at once.
 */
export function createTreeSway(mode: () => MotionMode): TreeSway {
  const entries: Entry[] = [];
  return {
    add(id, view) {
      this.remove(id);
      const art = artOf(view);
      if (!art) return;
      entries.push({
        id,
        container: view.container,
        art,
        phase: idUnit(id),
        speed: idUnit(id + '#'),
      });
    },
    remove(id) {
      const i = entries.findIndex((e) => e.id === id);
      const e = entries[i];
      if (!e) return;
      e.art.rotation = 0;
      const last = entries.pop();
      if (last && last !== e) entries[i] = last;
    },
    update(timeMs) {
      const m = MOTION[mode()];
      const still = m.swayDeg === 0 && m.gustDeg === 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (!e) continue;
        if (!e.container.active) {
          const last = entries.pop();
          if (last && last !== e) entries[i] = last;
          continue;
        }
        if (!e.container.visible) continue;
        if (still || !e.art.visible) {
          if (e.art.rotation !== 0) e.art.rotation = 0;
          continue;
        }
        e.art.rotation = swayAngle(m, timeMs, e.container.x, e.phase, e.speed);
      }
    },
    count: () => entries.length,
  };
}
