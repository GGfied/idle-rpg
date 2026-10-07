import { clamp } from '@core/utils';

/**
 * OSRS-style success chance. `low` and `high` are the "out of 256" values at level 1 and level 99;
 * the chance interpolates linearly between them: (1 + floor(low*(99-L)/98 + high*(L-1)/98 + 0.5)) / 256.
 * Returns a probability in [0, 1].
 */
export function successChance(level: number, low: number, high: number): number {
  const lvl = clamp(level, 1, 99);
  const interpolated = Math.floor((low * (99 - lvl)) / 98 + (high * (lvl - 1)) / 98 + 0.5);
  return clamp((1 + interpolated) / 256, 0, 1);
}
