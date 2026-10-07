import Phaser from 'phaser';
import { phaserScaleConfig } from '@platform/viewport';
import { watchViewport } from '@app/scenes/remeasure';
import { WorldScene } from '@app/scenes/WorldScene';
import type { SceneDeps } from '@app/scenes/WorldScene';

export interface GameHandle {
  destroy(): void;
  /** The running world scene (for the DEV-only QA hook). */
  world: WorldScene;
}

/** Create the Phaser game inside `parent`. */
export function createGame(parent: HTMLElement, deps: SceneDeps): GameHandle {
  const world = new WorldScene(deps);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1b2a1c',
    scale: phaserScaleConfig,
    scene: world,
    render: { pixelArt: true, antialias: false },
    disableContextMenu: true,
  });
  // RESIZE mode only hears window resizes; the fluid HUD can change the parent's size without one,
  // and the first layout may settle after boot (fonts, load). Re-measure on each of those.
  const refresh = (): void => {
    try {
      game.scale.refresh();
    } catch {
      // The game may already be destroyed.
    }
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  observer?.observe(parent);
  const raf = requestAnimationFrame(refresh);
  void document.fonts?.ready.then(refresh);
  window.addEventListener('load', refresh);
  // Zoom / display moves change devicePixelRatio and the visual viewport, which the parent's
  // ResizeObserver can miss; re-measure on those too (one rAF per burst).
  const unwatch = watchViewport(window, refresh);
  return {
    destroy: () => {
      unwatch();
      observer?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('load', refresh);
      game.destroy(true);
    },
    world,
  };
}
