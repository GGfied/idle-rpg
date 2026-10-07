import type { GameState } from '@app/game/types';

/** Run energy is saved when its whole 10% step changes (it moves every tick, so not finer). */
const ENERGY_STEP = 1000;

/**
 * Whether going from `prev` to `next` is progress worth a debounced save: inventory, xp, hit points,
 * run energy (coarse), run toggle, or position. Position counts when a walk ends (the path empties)
 * or the player jumps while standing still, never per step.
 */
export function progressChanged(prev: GameState, next: GameState): boolean {
  if (next.inventory !== prev.inventory || next.progression !== prev.progression) return true;
  if (next.hp.current !== prev.hp.current) return true;
  const a = prev.movement;
  const b = next.movement;
  if (b.running !== a.running) return true;
  if (Math.floor(b.runEnergy / ENERGY_STEP) !== Math.floor(a.runEnergy / ENERGY_STEP)) return true;
  const arrived = a.path.length > 0 && b.path.length === 0;
  const jumped =
    a.path.length === 0 &&
    b.path.length === 0 &&
    (a.position.x !== b.position.x || a.position.y !== b.position.y);
  return arrived || jumped;
}
