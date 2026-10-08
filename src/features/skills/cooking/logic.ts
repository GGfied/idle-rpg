import type { TickContext, TickResult } from '@core/contracts';
import { successChance } from '@core/skills';
import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import { COOKING_MESSAGES, COOKING_RECIPES, SKILL, SOURCE_SUCCESS_BONUS } from './data';
import type {
  CookError,
  CookInput,
  CookOutcome,
  CookSource,
  CookingEnv,
  CookingEvent,
  CookingRecipe,
  CookingSession,
  CookingState,
  CookingStopReason,
} from './types';

export const createCookingState = (): CookingState => ({ session: null });

export const getRecipe = (rawId: string): CookingRecipe | undefined =>
  COOKING_RECIPES.find((r) => r.rawId === rawId);

/** HP restored by eating a cooked item, or undefined when it isn't cooked food. */
export const healAmount = (itemId: string): number | undefined =>
  COOKING_RECIPES.find((r) => r.cookedId === itemId)?.heals;

/** The "need level N" chat line for a raw item, or null for an unknown recipe. */
export function levelTooLowMessage(rawId: string): string | null {
  const r = getRecipe(rawId);
  return r
    ? COOKING_MESSAGES.stopped.levelTooLow.replace('{level}', String(r.levelRequired))
    : null;
}

/**
 * Chance (0..1) that a cook succeeds (does not burn). Falls linearly from `levelRequired` to
 * `stopBurnLevel` (certain from there on); a range adds a small bonus.
 */
export function cookSuccessChance(r: CookingRecipe, level: number, source: CookSource): number {
  if (level >= r.stopBurnLevel) return 1;
  const span = Math.max(1, r.stopBurnLevel - r.levelRequired);
  const t = Math.min(1, Math.max(0, level - r.levelRequired) / span);
  const bonus = SOURCE_SUCCESS_BONUS[source];
  const low = Math.min(255, r.successLow + bonus);
  const high = Math.min(255, r.successHigh + bonus);
  // successChance interpolates over levels 1..99, so rescale the span onto that.
  return successChance(1 + t * 98, low, high);
}

/** Cook one raw item: validate, roll the burn, and describe the result. XP only on success. */
export function cookOnce(
  input: CookInput,
  rng: TickContext['rng'],
): Result<CookOutcome, CookError> {
  const r = getRecipe(input.rawId);
  if (!r) return err('unknownRecipe');
  if (input.level < r.levelRequired) return err('levelTooLow');
  if (input.rawCount < 1) return err('noRawFood');
  const burnt = !rng.chance(cookSuccessChance(r, input.level, input.source));
  return ok({
    consume: { itemId: r.rawId, quantity: 1 },
    produce: { itemId: burnt ? r.burntId : r.cookedId, quantity: 1 },
    xp: burnt ? 0 : r.xp,
    burnt,
    message: (burnt ? COOKING_MESSAGES.burnt : COOKING_MESSAGES.cooked)[r.rawId] ?? '',
  });
}

function stopped(
  s: Pick<CookingSession, 'objectId' | 'rawId'>,
  reason: CookingStopReason,
  r?: CookingRecipe,
): CookingEvent {
  const e: CookingEvent = { type: 'cookingStopped', objectId: s.objectId, rawId: s.rawId, reason };
  if (r && reason === 'levelTooLow') e.requiredLevel = r.levelRequired;
  return e;
}

/** Why the player can't cook this right now, or null. */
function blocker(r: CookingRecipe | undefined, env: CookingEnv, rawId: string): CookError | null {
  if (!r) return 'unknownRecipe';
  if (env.level(SKILL) < r.levelRequired) return 'levelTooLow';
  if (env.count(rawId) < 1) return 'noRawFood';
  return null;
}

/** Begin cooking `rawId` on a fire/range object. Fails (state unchanged) on unknown recipe, level or no raw food. */
export function startCooking(
  objectId: string,
  source: CookSource,
  rawId: string,
  env: CookingEnv,
): Result<{ state: CookingState; events: CookingEvent[] }, CookError> {
  const r = getRecipe(rawId);
  const reason = blocker(r, env, rawId);
  if (reason || !r) return err(reason ?? 'unknownRecipe');
  return ok({
    state: { session: { objectId, source, rawId, cooldown: r.ticksPerCook } },
    events: [{ type: 'cookingStarted', objectId, rawId }],
  });
}

/** Stop cooking (player moved, clicked elsewhere, ...). No-op when idle. */
export function stopCooking(state: CookingState): TickResult<CookingState, CookingEvent> {
  if (!state.session) return { state, events: [] };
  return { state: { session: null }, events: [stopped(state.session, 'cancelled')] };
}

/**
 * One game tick of cooking: counts down, then cooks one item every `ticksPerCook` ticks until the
 * raw food is gone, the fire goes out or something blocks. Results come back as events for the
 * integrator to apply (itemConsumed / itemGathered / xpGranted / itemCooked chat line).
 */
export function tickCooking(
  state: CookingState,
  ctx: TickContext,
  env: CookingEnv,
): TickResult<CookingState, CookingEvent> {
  const s = state.session;
  if (!s) return { state, events: [] };
  const r = getRecipe(s.rawId);
  const stop = (reason: CookingStopReason): TickResult<CookingState, CookingEvent> => ({
    state: { session: null },
    events: [stopped(s, reason, r)],
  });
  if (!env.sourceActive(s.objectId)) return stop('sourceGone');
  const reason = blocker(r, env, s.rawId);
  if (reason || !r) return stop(reason ?? 'unknownRecipe');
  if (s.cooldown > 1) return { state: { session: { ...s, cooldown: s.cooldown - 1 } }, events: [] };

  const res = cookOnce(
    { rawId: s.rawId, level: env.level(SKILL), rawCount: env.count(s.rawId), source: s.source },
    ctx.rng,
  );
  if (!res.ok) return stop(res.error);
  const o = res.value;
  const events: CookingEvent[] = [
    { type: 'itemConsumed', itemId: o.consume.itemId, quantity: o.consume.quantity },
    {
      type: 'itemGathered',
      skill: SKILL,
      nodeId: s.objectId,
      itemId: o.produce.itemId,
      quantity: 1,
    },
    {
      type: 'itemCooked',
      objectId: s.objectId,
      rawId: s.rawId,
      producedId: o.produce.itemId,
      burnt: o.burnt,
      message: o.message,
    },
  ];
  if (!o.burnt) events.push({ type: 'xpGranted', skill: SKILL, amount: o.xp, source: s.source });
  const left = env.count(s.rawId) - 1;
  if (left < 1) {
    events.push(stopped(s, 'noRawFood'));
    return { state: { session: null }, events };
  }
  return { state: { session: { ...s, cooldown: r.ticksPerCook } }, events };
}
