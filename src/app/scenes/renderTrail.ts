/** Pure interpolation of the player's drawn position between ticks. No Phaser. */
import type { Tile } from '@core/contracts';
import { lerp } from '@core/utils';

/** Where the player was at the start of the current tick, where it is now, and which tick that is. */
export interface Trail {
  from: Tile;
  to: Tile;
  tick: number;
}

export const startTrail = (at: Tile, tick: number): Trail => ({ from: at, to: at, tick });

/**
 * Feed the store's position and the tick it belongs to. Only a NEW tick moves the trail on, so store
 * changes between ticks (clicks, chat, menus) can never snap the drawn player to its tile.
 */
export function advanceTrail(trail: Trail, position: Tile, tick: number): Trail {
  if (tick === trail.tick) return trail;
  return { from: trail.to, to: { ...position }, tick };
}

/**
 * Advance like `advanceTrail`, but jump straight to `position` (no easing). Used when something
 * appears on the tile the player just left (a fire), so the body is never drawn over it.
 */
export function snapTrail(trail: Trail, position: Tile, tick: number): Trail {
  if (tick === trail.tick && trail.from.x === position.x && trail.from.y === position.y)
    return trail;
  return { from: { ...position }, to: { ...position }, tick };
}

/** Drawn tile-space position `alpha` (0..1) of the way from the previous to the current tile. */
export function renderPosition(trail: Trail, alpha: number): Tile {
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
  return { x: lerp(trail.from.x, trail.to.x, a), y: lerp(trail.from.y, trail.to.y, a) };
}

/** The slice of core/engine's Ticker a frame needs. */
export interface FrameTicker {
  update(nowMs: number): number;
  alpha(): number;
}

/**
 * The tick fraction for THIS frame. Advances the ticker to the frame's own time first, so a tick that
 * is due fires (and the trail moves on) in the same frame that reads alpha. Reading a timer-polled
 * alpha instead repeats a stale value for some frames and jumps for the next (a ~2x step once a tile).
 */
export function frameAlpha(ticker: FrameTicker, nowMs: number): number {
  ticker.update(nowMs);
  return ticker.alpha();
}
