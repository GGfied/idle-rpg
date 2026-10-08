import type { TickContext, TickResult } from '@core/contracts';
import { depleteNode, successChance, tickNode } from '@core/skills';
import { err, ok, rollTable } from '@core/utils';
import type { Result } from '@core/utils';
import { FISHING_MESSAGES, FISHING_SPOTS } from './data';
import type {
  FishCatch,
  FishingEnv,
  FishingEvent,
  FishingMethodDef,
  FishingSession,
  FishingState,
  FishingStopReason,
  SpotDef,
} from './types';

export const SKILL = 'fishing';

export const createFishingState = (): FishingState => ({ session: null, spots: {} });

export const getSpotDef = (id: string): SpotDef | undefined =>
  FISHING_SPOTS.find((d) => d.id === id);

/** The method def of a spot; omit `method` for the spot's default (first) method. */
export function getMethod(
  defId: string,
  method?: string,
): { id: string; def: FishingMethodDef } | undefined {
  const spot = getSpotDef(defId);
  if (!spot) return undefined;
  const id = method ?? Object.keys(spot.methods)[0];
  const def = id === undefined ? undefined : spot.methods[id];
  return id !== undefined && def ? { id, def } : undefined;
}

/** Lowest level that can catch anything with this method. */
export const minLevel = (m: FishingMethodDef): number =>
  Math.min(...m.catches.map((c) => c.requiredLevel));

/** Fish the player's level allows. */
export const eligibleCatches = (m: FishingMethodDef, level: number): FishCatch[] =>
  m.catches.filter((c) => level >= c.requiredLevel);

/** The "need level N" chat line for a spot id (default method), or null for an unknown spot. */
export function levelTooLowMessage(defId: string, method?: string): string | null {
  const m = getMethod(defId, method);
  return m
    ? FISHING_MESSAGES.stopped.levelTooLow.replace('{level}', String(minLevel(m.def)))
    : null;
}

/** Expected XP per tick at a level (balance/tests): sum over fish of P(fish) * P(success) * xp / ticks. */
export function expectedXpPerTick(m: FishingMethodDef, level: number, ticksSaved = 0): number {
  const fish = eligibleCatches(m, level);
  const total = fish.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return 0;
  const perAttempt = fish.reduce(
    (s, c) => s + (c.weight / total) * successChance(level, c.successLow, c.successHigh) * c.xp,
    0,
  );
  return perAttempt / Math.max(1, m.baseTicks - ticksSaved);
}

/** Why the player can't fish this method right now, or null if they can. */
function blocker(m: FishingMethodDef, env: FishingEnv): FishingStopReason | null {
  const level = env.level(SKILL);
  const fish = eligibleCatches(m, level);
  if (fish.length === 0) return 'levelTooLow';
  if (env.tool(m.toolKind) === null) return 'noTool';
  if (m.baitItemId !== undefined && !env.hasItem(m.baitItemId)) return 'noBait';
  if (!fish.some((c) => env.canFit(c.itemId, 1))) return 'inventoryFull';
  return null;
}

function stoppedEvent(
  spotId: string,
  defId: string,
  reason: FishingStopReason,
  m?: FishingMethodDef,
): FishingEvent {
  const e: FishingEvent = { type: 'fishingStopped', spotId, defId, reason };
  if (m && reason === 'levelTooLow') e.requiredLevel = minLevel(m);
  if (m && reason === 'noTool') e.tool = m.toolKind;
  if (m?.baitItemId !== undefined && reason === 'noBait') e.baitItemId = m.baitItemId;
  return e;
}

const attemptTicks = (m: FishingMethodDef, env: FishingEnv): number =>
  Math.max(1, m.baseTicks - (env.tool(m.toolKind)?.ticksSaved ?? 0));

/** Track a spot instance so it moves now and then. `tileCount` = candidate tiles the map gave it. */
export function addSpot(
  state: FishingState,
  spotId: string,
  defId: string,
  tileCount: number,
  ctx: TickContext,
  tile = 0,
): FishingState {
  const def = getSpotDef(defId);
  if (!def) return state;
  const wait = ctx.rng.int(def.moveTicksMin, def.moveTicksMax);
  return {
    ...state,
    spots: {
      ...state.spots,
      [spotId]: { defId, tile, tileCount, moveTimer: depleteNode(ctx.tick, wait) },
    },
  };
}

/** Begin fishing a spot. Fails (without changing state) on unknown spot/method, level, tool or bait. */
export function startFishing(
  state: FishingState,
  spotId: string,
  defId: string,
  env: FishingEnv,
  method?: string,
): Result<{ state: FishingState; events: FishingEvent[] }, FishingStopReason> {
  const m = getMethod(defId, method);
  if (!m) return err('cancelled');
  const reason = blocker(m.def, env);
  if (reason) return err(reason);
  const session: FishingSession = {
    spotId,
    defId,
    method: m.id,
    cooldown: attemptTicks(m.def, env),
  };
  return ok({
    state: { ...state, session },
    events: [{ type: 'fishingStarted', spotId, defId, method: m.id }],
  });
}

/** Stop fishing (player moved, clicked elsewhere, ...). No-op when idle. */
export function stopFishing(state: FishingState): TickResult<FishingState, FishingEvent> {
  if (!state.session) return { state, events: [] };
  const { spotId, defId } = state.session;
  return {
    state: { ...state, session: null },
    events: [stoppedEvent(spotId, defId, 'cancelled')],
  };
}

/** Move every spot whose timer is due to a different tile and restart its timer. */
function moveSpots(state: FishingState, ctx: TickContext): TickResult<FishingState, FishingEvent> {
  const events: FishingEvent[] = [];
  let spots = state.spots;
  let session = state.session;
  for (const [id, spot] of Object.entries(state.spots)) {
    const def = getSpotDef(spot.defId);
    if (!def || !tickNode(spot.moveTimer, ctx.tick).respawned) continue;
    const from = spot.tile;
    const to =
      spot.tileCount > 1 ? (from + 1 + ctx.rng.int(0, spot.tileCount - 2)) % spot.tileCount : from;
    const wait = ctx.rng.int(def.moveTicksMin, def.moveTicksMax);
    if (spots === state.spots) spots = { ...state.spots };
    spots[id] = { ...spot, tile: to, moveTimer: depleteNode(ctx.tick, wait) };
    events.push({ type: 'spotMoved', spotId: id, defId: spot.defId, from, to });
    if (session?.spotId === id) {
      events.push(stoppedEvent(id, session.defId, 'spotMoved'));
      session = null;
    }
  }
  return { state: spots === state.spots ? state : { ...state, spots, session }, events };
}

/**
 * One game tick of fishing. Moves due spots, then (if fishing) counts down and rolls an attempt:
 * pick a fish among those the level allows (rollTable), then roll its success (successChance).
 * A catch comes back as `itemGathered` + `xpGranted` + `baitConsumed` events for the integrator to apply.
 */
export function tickFishing(
  input: FishingState,
  ctx: TickContext,
  env: FishingEnv,
): TickResult<FishingState, FishingEvent> {
  const moved = moveSpots(input, ctx);
  const events: FishingEvent[] = [...moved.events];
  const state = moved.state;
  const session = state.session;
  if (!session) return { state, events };

  const m = getMethod(session.defId, session.method);
  const stop = (reason: FishingStopReason): TickResult<FishingState, FishingEvent> => {
    events.push(stoppedEvent(session.spotId, session.defId, reason, m?.def));
    return { state: { ...state, session: null }, events };
  };
  if (!m) return stop('cancelled');
  const reason = blocker(m.def, env);
  if (reason) return stop(reason);

  if (session.cooldown > 1) {
    return { state: { ...state, session: { ...session, cooldown: session.cooldown - 1 } }, events };
  }

  const next: FishingSession = { ...session, cooldown: attemptTicks(m.def, env) };
  events.push({
    type: 'fishingAttempt',
    spotId: session.spotId,
    defId: session.defId,
    method: m.id,
  });
  const level = env.level(SKILL);
  const fish = rollTable(
    ctx.rng,
    eligibleCatches(m.def, level).map((c) => ({ weight: c.weight, value: c })),
  );
  if (!ctx.rng.chance(successChance(level, fish.successLow, fish.successHigh))) {
    return { state: { ...state, session: next }, events };
  }
  if (!env.canFit(fish.itemId, 1)) return stop('inventoryFull');
  events.push(
    {
      type: 'itemGathered',
      skill: SKILL,
      nodeId: session.spotId,
      itemId: fish.itemId,
      quantity: 1,
    },
    { type: 'xpGranted', skill: SKILL, amount: fish.xp, source: m.id },
  );
  if (m.def.baitItemId !== undefined) {
    events.push({ type: 'baitConsumed', itemId: m.def.baitItemId, quantity: 1 });
  }
  return { state: { ...state, session: next }, events };
}
