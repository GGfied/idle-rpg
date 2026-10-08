/** Fishing wiring: the player's click intent, the env the module needs, and applying its events. */
import type { TickContext, TickResult } from '@core/contracts';
import type { System } from '@core/engine';
import { bestTool } from '@core/equipment';
import { addItem, canAdd, countItem, itemIds, removeItem } from '@core/inventory';
import { getLevel, isSkillId } from '@core/progression';
import { findPathToAdjacent, isAdjacentTo, setPath } from '@features/movement';
import {
  FISHING_MESSAGES,
  addSpot,
  getMethod,
  minLevel,
  startFishing,
  stopFishing,
  tickFishing,
} from '@features/skills/fishing';
import type { FishingEnv, FishingEvent, FishingStopReason } from '@features/skills/fishing';
import type { AppEvent, Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import { spotTile } from '@app/game/fishingSpots';
import { grantXp } from '@app/game/systems';
import type { GameState } from '@app/game/types';

/** What the fishing loop needs to know, read from the current game state. */
export function fishingEnv(state: GameState, content: Content): FishingEnv {
  const level = (skill: string): number =>
    isSkillId(skill) ? getLevel(state.progression, skill) : 1;
  return {
    level,
    tool: (kind) => {
      const t = bestTool(content.tools, kind, itemIds(state.inventory), level);
      return t ? { ticksSaved: t.def.ticksSaved } : null;
    },
    hasItem: (itemId) => countItem(state.inventory, itemId) > 0,
    canFit: (itemId, qty) => canAdd(state.inventory, content.items, itemId, qty),
  };
}

/** The chat line for a stopped fishing session. '' = say nothing (the player cancelled). */
export function fishingStopLine(reason: FishingStopReason, requiredLevel?: number): string {
  return FISHING_MESSAGES.stopped[reason].replace('{level}', String(requiredLevel ?? 1));
}

/** The fishingStopped event for a cast that could not start (same detail fields as a mid-session stop). */
export function startFailedEvent(
  spotId: string,
  defId: string,
  reason: FishingStopReason,
): FishingEvent {
  const e: FishingEvent = { type: 'fishingStopped', spotId, defId, reason };
  const m = getMethod(defId)?.def;
  if (m && reason === 'levelTooLow') e.requiredLevel = minLevel(m);
  if (m && reason === 'noTool') e.tool = m.toolKind;
  if (m?.baitItemId !== undefined && reason === 'noBait') e.baitItemId = m.baitItemId;
  return e;
}

/** Click on a fishing spot: walk next to it, then the fishing system starts the cast. */
export function interactSpot(state: GameState, content: Content, spotId: string): GameState {
  const spawn = content.fishingSpots.get(spotId);
  if (!spawn) return state;
  if (state.fishing.session?.spotId === spotId || state.pendingFishing?.spotId === spotId)
    return state;
  const s = cancelFishing(state);
  const path = findPathToAdjacent(content.grid, s.movement.position, spotTile(spawn, s.fishing));
  if (path === null)
    return addImportantChat({ ...s, movement: setPath(s.movement, []) }, "I can't reach that.");
  return { ...s, movement: setPath(s.movement, path), pendingFishing: { spotId } };
}

/** Drop the fishing session and the walk to a spot (a new click, or another activity, starts). */
export function cancelFishing(state: GameState): GameState {
  return { ...state, fishing: stopFishing(state.fishing).state, pendingFishing: null };
}

function applyFishingEvent(state: GameState, e: FishingEvent, content: Content, out: AppEvent[]) {
  switch (e.type) {
    case 'fishingStarted':
      return addChat(state, FISHING_MESSAGES.started);
    case 'fishingAttempt':
      return addChat(state, FISHING_MESSAGES.attempt[e.method] ?? '');
    case 'itemGathered': {
      const r = addItem(state.inventory, content.items, e.itemId, e.quantity);
      const next = r.ok ? { ...state, inventory: r.value } : state;
      return addChat(next, FISHING_MESSAGES.caught[e.itemId] ?? '');
    }
    case 'xpGranted':
      return grantXp(state, e.skill, e.amount, out);
    case 'baitConsumed': {
      const r = removeItem(state.inventory, e.itemId, e.quantity);
      return r.ok ? { ...state, inventory: r.value } : state;
    }
    case 'fishingStopped':
      return e.reason === 'cancelled'
        ? state
        : addImportantChat(state, fishingStopLine(e.reason, e.requiredLevel));
    default:
      return state;
  }
}

/** Tracks spots (so they hop), starts fishing on arrival, then runs one fishing tick and applies it. */
export function createFishingSystem(content: Content): System<GameState, AppEvent> {
  return (input: GameState, ctx: TickContext): TickResult<GameState, AppEvent> => {
    let state = input;
    const events: AppEvent[] = [];
    let tracked = state.fishing;
    for (const s of content.fishingSpots.values()) {
      if (tracked.spots[s.spotId]) continue;
      tracked = addSpot(tracked, s.spotId, s.defId, s.tiles.length, ctx, 0);
    }
    state = { ...state, fishing: tracked };
    const out: FishingEvent[] = [];

    const pending = state.pendingFishing;
    if (pending && state.movement.path.length === 0) {
      const spawn = content.fishingSpots.get(pending.spotId);
      state = { ...state, pendingFishing: null };
      if (spawn && isAdjacentTo(state.movement.position, spotTile(spawn, state.fishing))) {
        const r = startFishing(
          state.fishing,
          spawn.spotId,
          spawn.defId,
          fishingEnv(state, content),
        );
        if (r.ok) {
          state = { ...state, fishing: r.value.state };
          out.push(...r.value.events);
        } else {
          out.push(startFailedEvent(spawn.spotId, spawn.defId, r.error));
        }
      }
    }

    const tick = tickFishing(state.fishing, ctx, fishingEnv(state, content));
    state = { ...state, fishing: tick.state };
    out.push(...tick.events);
    for (const e of out) {
      events.push(e);
      state = applyFishingEvent(state, e, content, events);
    }
    return { state, events };
  };
}
