/** Ground items as player intents and the tick system that finishes them. */
import { dropGroundItem, groundItemsAt, takeGroundItem, tickGroundItems } from '@core/items';
import type { GroundItemEvent } from '@core/items';
import { addItem, removeSlot } from '@core/inventory';
import type { System } from '@core/engine';
import { setDestination } from '@features/movement';
import type { AppEvent, Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import type { GameState } from '@app/game/types';

export const NO_SPACE = "You don't have enough inventory space.";

const itemName = (content: Content, id: string): string =>
  (content.items.get(id)?.name ?? id).toLowerCase();

/** Drop the whole stack in a slot onto the player's tile. */
export function dropSlot(state: GameState, content: Content, slot: number): GameState {
  const { inv, removed } = removeSlot(state.inventory, slot);
  if (!removed) return state;
  const { x, y } = state.movement.position;
  const r = dropGroundItem(
    state.ground,
    { itemId: removed.itemId, qty: removed.quantity, x, y, tick: state.tick },
    content.items,
  );
  const next = { ...state, inventory: inv, ground: r.state };
  return addChat(next, `You drop the ${itemName(content, removed.itemId)}.`);
}

/** Pick one ground item up if it fits; otherwise it stays where it is. */
function takeNow(
  state: GameState,
  content: Content,
  id: string,
): { state: GameState; events: GroundItemEvent[] } {
  const item = state.ground.items.find((g) => g.id === id);
  if (!item) return { state, events: [] };
  const added = addItem(state.inventory, content.items, item.itemId, item.qty);
  if (!added.ok) return { state: addImportantChat(state, NO_SPACE), events: [] };
  const taken = takeGroundItem(state.ground, id);
  if (!taken.ok) return { state, events: [] };
  const next = { ...state, inventory: added.value, ground: taken.value.state };
  return {
    state: addChat(next, `You pick up the ${itemName(content, item.itemId)}.`),
    events: taken.value.events,
  };
}

/** Walk onto a ground item's tile; the ground system takes it on arrival. */
export function takeGround(
  state: GameState,
  content: Content,
  id: string,
  cancel: (s: GameState) => GameState,
): GameState {
  const item = state.ground.items.find((g) => g.id === id);
  if (!item) return state;
  if (state.pendingGround?.id === id) return state;
  const s = cancel(state);
  const pos = s.movement.position;
  if (pos.x === item.x && pos.y === item.y) return takeNow(s, content, id).state;
  const moved = { ...s, movement: setDestination(s.movement, content.grid, item) };
  const reachable = moved.movement.path.length > 0;
  if (!reachable) return addImportantChat(s, "I can't reach that.");
  return { ...moved, pendingGround: { id } };
}

/** Ground items despawn on a tick timer; a pending take finishes once the player stands on the tile. */
export function createGroundSystem(content: Content): System<GameState, AppEvent> {
  return (input, ctx) => {
    const events: GroundItemEvent[] = [];
    const t = tickGroundItems(input.ground, ctx.tick);
    events.push(...t.events);
    let state: GameState = { ...input, tick: ctx.tick, ground: t.state };
    const p = state.pendingGround;
    if (p !== null && state.movement.path.length === 0) {
      state = { ...state, pendingGround: null };
      const item = state.ground.items.find((g) => g.id === p.id);
      const pos = state.movement.position;
      if (item && groundItemsAt(state.ground, pos.x, pos.y).includes(item)) {
        const r = takeNow(state, content, p.id);
        state = r.state;
        events.push(...r.events);
      }
    }
    return { state, events: events as AppEvent[] };
  };
}
