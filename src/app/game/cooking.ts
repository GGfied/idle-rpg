/** Cooking wiring: the player's intent (Cook on a fire), the env the module needs, applying its events. */
import type { GameEvent, Tile, TickContext, TickResult } from '@core/contracts';
import type { System } from '@core/engine';
import { addItem, countItem, removeItem } from '@core/inventory';
import { getLevel, isSkillId } from '@core/progression';
import { findPathToAdjacent, isAdjacentTo, setPath } from '@features/movement';
import {
  COOKING_MESSAGES,
  getRecipe,
  levelTooLowMessage,
  startCooking,
  stopCooking,
  tickCooking,
} from '@features/skills/cooking';
import type { CookingEnv, CookingEvent } from '@features/skills/cooking';
import type { AppEvent, Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import { grantXp } from '@app/game/systems';
import type { GameState } from '@app/game/types';

/** One per cook attempt; the module's event plus the fire's tile (for vfx and sound). */
export type ItemCookedEvent = GameEvent & {
  type: 'itemCooked';
  objectId: string;
  rawId: string;
  producedId: string;
  burnt: boolean;
  message: string;
  tile: Tile;
};

export const isCookable = (itemId: string): boolean => getRecipe(itemId) !== undefined;

/** The first raw item in the bag that can be cooked, or undefined. */
export function firstCookable(state: GameState): string | undefined {
  return state.inventory.slots.find((s) => s && isCookable(s.itemId))?.itemId;
}

/** What the cooking loop needs to know, read from the current game state. */
export function cookingEnv(state: GameState): CookingEnv {
  return {
    level: (skill) => (isSkillId(skill) ? getLevel(state.progression, skill) : 1),
    count: (itemId) => countItem(state.inventory, itemId),
    sourceActive: (objectId) => state.firemaking.fires.some((f) => f.id === objectId),
  };
}

/** Walk next to a fire, then the cooking system starts cooking `rawId` (default: the first raw item held). */
export function interactCook(
  state: GameState,
  content: Content,
  fireId: string,
  rawId: string | undefined,
  cancel: (s: GameState) => GameState,
): GameState {
  const fire = state.firemaking.fires.find((f) => f.id === fireId);
  if (!fire) return state;
  const raw = rawId ?? firstCookable(state);
  if (state.cooking.session?.objectId === fireId && state.cooking.session.rawId === raw)
    return state;
  if (state.pendingCook?.fireId === fireId && state.pendingCook.rawId === rawId) return state;
  const s = cancel(state);
  if (!raw) return addImportantChat(s, COOKING_MESSAGES.stopped.noRawFood);
  const path = findPathToAdjacent(content.grid, s.movement.position, fire.tile);
  if (path === null)
    return addImportantChat({ ...s, movement: setPath(s.movement, []) }, "I can't reach that.");
  return { ...s, movement: setPath(s.movement, path), pendingCook: { fireId, rawId: raw } };
}

/** Drop the cooking session and the walk to a fire. */
export const cancelCooking = (state: GameState): GameState => ({
  ...state,
  cooking: stopCooking(state.cooking).state,
  pendingCook: null,
});

function applyCookingEvent(
  state: GameState,
  e: CookingEvent,
  out: AppEvent[],
  items: Content['items'],
): GameState {
  switch (e.type) {
    case 'itemConsumed': {
      const r = removeItem(state.inventory, e.itemId, e.quantity);
      return r.ok ? { ...state, inventory: r.value } : state;
    }
    case 'itemGathered': {
      const r = addItem(state.inventory, items, e.itemId, e.quantity);
      return r.ok ? { ...state, inventory: r.value } : state;
    }
    case 'itemCooked':
      return addChat(state, e.message);
    case 'xpGranted':
      return grantXp(state, e.skill, e.amount, out);
    case 'cookingStopped': {
      if (e.reason === 'cancelled') return state;
      const line =
        e.reason === 'levelTooLow'
          ? (levelTooLowMessage(e.rawId) ?? '')
          : COOKING_MESSAGES.stopped[e.reason];
      return addImportantChat(state, line);
    }
    default:
      return state;
  }
}

/** On arrival beside the fire start cooking; then run one cooking tick and apply its events. */
export function createCookingSystem(content: Content): System<GameState, AppEvent> {
  return (input: GameState, ctx: TickContext): TickResult<GameState, AppEvent> => {
    let state = input;
    const out: CookingEvent[] = [];
    const pending = state.pendingCook;
    if (pending && state.movement.path.length === 0) {
      const fire = state.firemaking.fires.find((f) => f.id === pending.fireId);
      state = { ...state, pendingCook: null };
      const raw = pending.rawId ?? firstCookable(state);
      if (fire && raw && isAdjacentTo(state.movement.position, fire.tile)) {
        const r = startCooking(fire.id, 'fire', raw, cookingEnv(state));
        if (r.ok) {
          state = { ...state, cooking: r.value.state };
          out.push(...r.value.events);
        } else {
          out.push({
            type: 'cookingStopped',
            objectId: fire.id,
            rawId: raw,
            reason: r.error,
          });
        }
      }
    }
    const tick = tickCooking(state.cooking, ctx, cookingEnv(state));
    state = { ...state, cooking: tick.state };
    out.push(...tick.events);

    const events: AppEvent[] = [];
    for (const e of out) {
      if (e.type === 'itemCooked') {
        const tile = state.firemaking.fires.find((f) => f.id === e.objectId)?.tile;
        events.push((tile ? { ...e, tile: { ...tile } } : e) as AppEvent);
      } else events.push(e as AppEvent);
      state = applyCookingEvent(state, e, events, content.items);
    }
    return { state, events };
  };
}
