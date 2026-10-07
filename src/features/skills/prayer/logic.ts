import type { TickContext, TickResult } from '@core/contracts';
import { clamp, err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import type { PrayerEvent, PrayerPointsSave, PrayerPointsState } from './types';

const validMax = (max: number): number => (Number.isFinite(max) && max > 0 ? Math.floor(max) : 0);
const validAmount = (n: number): boolean => Number.isFinite(n) && n > 0;

export function createPrayerPoints(max: number): PrayerPointsState {
  return { current: validMax(max) };
}

/** Remove points (floored at 0, capped at max). Bad or non-positive amounts change nothing. */
export function drain(state: PrayerPointsState, amount: number, max: number): PrayerPointsState {
  const m = validMax(max);
  const base = clamp(state.current, 0, m);
  return { current: validAmount(amount) ? clamp(base - amount, 0, m) : base };
}

/** Add points (capped at max). Bad or non-positive amounts change nothing. */
export function restore(state: PrayerPointsState, amount: number, max: number): PrayerPointsState {
  const m = validMax(max);
  const base = clamp(state.current, 0, m);
  return { current: validAmount(amount) ? clamp(base + amount, 0, m) : base };
}

/**
 * No natural regeneration: only clamps to max if the Prayer level dropped.
 * Emits `prayerChanged` only when the value changed.
 */
export function tickPrayer(
  state: PrayerPointsState,
  _ctx: TickContext,
  max: number,
): TickResult<PrayerPointsState, PrayerEvent> {
  const m = validMax(max);
  const current = clamp(state.current, 0, m);
  if (current === state.current) return { state, events: [] };
  return { state: { current }, events: [{ type: 'prayerChanged', current, max: m }] };
}

export const serializePrayerPoints = (state: PrayerPointsState): PrayerPointsSave => ({
  current: state.current,
});

/** Strict: rejects non-objects and non-finite/negative/non-integer `current`; clamps to max. */
export function deserializePrayerPoints(
  data: unknown,
  max: number,
): Result<PrayerPointsState, string> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return err('prayer: save slice must be an object');
  }
  const current = Object.prototype.hasOwnProperty.call(data, 'current')
    ? (data as { current: unknown }).current
    : undefined;
  if (typeof current !== 'number' || !Number.isInteger(current) || current < 0) {
    return err('prayer: current must be a non-negative integer');
  }
  return ok({ current: Math.min(current, validMax(max)) });
}
