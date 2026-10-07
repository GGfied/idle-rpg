import type { TickContext } from '@core/contracts';
import { clamp, err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import { HP_BOOST_CAP, HP_REGEN_INTERVAL_TICKS } from './data';
import type { CombatEvent, PlayerHpState } from './types';

const validAmount = (n: number): boolean => typeof n === 'number' && !Number.isNaN(n) && n >= 1;

export const createPlayerHp = (maxHp: number): PlayerHpState => ({
  current: maxHp,
  regenTicks: 0,
});

export const isDead = (state: PlayerHpState): boolean => state.current <= 0;

/** Remove whole HP, floored at 0. Non-positive/NaN amounts are ignored. Boosted HP is kept if still above max. */
export function damage(state: PlayerHpState, amount: number, maxHp: number): PlayerHpState {
  if (!validAmount(amount)) return state;
  const next = clamp(state.current - Math.floor(amount), 0, Math.max(maxHp, state.current));
  return { ...state, current: next };
}

/** Add whole HP, capped at max (never reduces an over-max value). Non-positive/NaN amounts are ignored. */
export function heal(state: PlayerHpState, amount: number, maxHp: number): PlayerHpState {
  if (!validAmount(amount) || state.current >= maxHp) return state;
  return { ...state, current: Math.min(maxHp, state.current + Math.floor(amount)) };
}

/** Natural regen (+1 per 100 ticks below max) and decay (-1 per 100 ticks above max). */
export function tickPlayerHp(
  state: PlayerHpState,
  _ctx: TickContext,
  maxHp: number,
): { state: PlayerHpState; events: CombatEvent[] } {
  if (state.current === maxHp || state.current <= 0) {
    // The dead do not regenerate; at max the timer rests.
    const same = state.regenTicks === 0 ? state : { ...state, regenTicks: 0 };
    return { state: same, events: [] };
  }
  const regenTicks = state.regenTicks + 1;
  if (regenTicks < HP_REGEN_INTERVAL_TICKS) return { state: { ...state, regenTicks }, events: [] };
  const current = state.current + (state.current < maxHp ? 1 : -1);
  return {
    state: { current, regenTicks: 0 },
    events: [{ type: 'hpChanged', current, max: maxHp }],
  };
}

/** Only `current` is saved; the regen timer restarts on load. */
export const serializePlayerHp = (state: PlayerHpState): unknown => ({ current: state.current });

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null);

/** Validate untrusted save data. Builds a fresh object; never spreads the input. */
export function deserializePlayerHp(data: unknown, maxHp: number): Result<PlayerHpState, string> {
  if (!isPlain(data)) return err('playerHp: bad shape');
  const keys = Object.getOwnPropertyNames(data);
  if (keys.length !== 1 || !Object.hasOwn(data, 'current')) return err('playerHp: bad shape');
  const current = data.current;
  if (typeof current !== 'number' || !Number.isInteger(current) || current < 0)
    return err('playerHp: bad current');
  if (current > maxHp + HP_BOOST_CAP) return err('playerHp: current too high');
  return ok({ current: Math.min(current, maxHp), regenTicks: 0 });
}
