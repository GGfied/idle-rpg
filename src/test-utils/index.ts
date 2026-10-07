import { createInventory } from '@core/inventory';
import type { InventoryState, ItemStack } from '@core/inventory';
import type { CollisionGrid, Rng, TickContext } from '@core/contracts';
import { createRng } from '@core/engine';
import { checkItemRefs } from '@core/items';
import type { ItemRegistry } from '@core/items';

/** Deterministic rng for tests. */
export const seededRng = (seed = 1): Rng => createRng(seed);

/** A tick context for tests; override the tick number and/or seed. */
export const makeCtx = (tick = 1, seed = 1): TickContext => ({ tick, rng: seededRng(seed) });

/** An rng that returns the given values in order (then repeats the last). For forcing outcomes. */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  const next = (): number => values[Math.min(i++, values.length - 1)] ?? 0;
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    getState: () => i,
  };
}

/** Build a CollisionGrid from ASCII rows: '#' is blocked, any other character is walkable. */
export function gridFromAscii(rows: string[]): CollisionGrid {
  const height = rows.length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  return {
    width,
    height,
    isWalkable: (x, y) =>
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < width &&
      y < height &&
      (rows[y] ?? '')[x] !== undefined &&
      (rows[y] ?? '')[x] !== '#',
  };
}

/** An inventory holding the given stacks in order (slots 0..n-1). */
export const withInventory = (stacks: readonly ItemStack[] = []): InventoryState =>
  createInventory(stacks);

/**
 * Step any `(state, ctx) => { state }` function for `ticks` ticks, numbering ticks from `startTick`.
 * Returns the final state and the next tick number, so a script can continue where it stopped.
 */
export function runTicks<S>(
  state: S,
  stepFn: (s: S, ctx: TickContext) => { state: S },
  ticks: number,
  rng: Rng,
  startTick = 1,
): { state: S; nextTick: number } {
  let s = state;
  let tick = startTick;
  for (let i = 0; i < ticks; i++) s = stepFn(s, { tick: tick++, rng }).state;
  return { state: s, nextTick: tick };
}

/**
 * One generic content-reference check: every id in every named group must be a known item.
 * Returns the list of error strings (empty when all ids resolve).
 */
export function contentRefs(
  registry: ItemRegistry,
  groups: Readonly<Record<string, readonly string[]>>,
): string[] {
  const errors: string[] = [];
  for (const [context, ids] of Object.entries(groups)) {
    const r = checkItemRefs(registry, ids, context);
    if (!r.ok) errors.push(...r.error);
  }
  return errors;
}
