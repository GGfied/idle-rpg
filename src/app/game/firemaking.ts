/** Lighting logs into fires: the player's intent, the lighting action, and fires burning out. */
import type { TickContext, TickResult } from '@core/contracts';
import type { GameEvent, Tile } from '@core/contracts';
import type { System } from '@core/engine';
import { addImportantChat, addChat } from '@app/game/chat';
import { countItem, removeItem } from '@core/inventory';
import { dropGroundItem } from '@core/items';
import {
  FIRE_MESSAGES,
  LIGHTABLE_LOGS,
  LIGHT_TICKS,
  STEP_ASIDE,
  TINDERBOX_ID,
  fireAt,
  lightFire,
  tickFires,
} from '@features/facilities';
import { setPath } from '@features/movement';
import type { AppEvent, Content } from '@app/registry';
import type { GameState } from '@app/game/types';

/** Emitted when the player starts lighting (animation / vfx / sound hook). */
export type FireLightStartedEvent = GameEvent & { type: 'fireLightStarted'; tile: Tile };
/** Emitted when the fire catches. */
export type FireLitEvent = GameEvent & {
  type: 'fireLit';
  fireId: string;
  tile: Tile;
  logsId: string;
};

export const isLightable = (itemId: string): boolean => Object.hasOwn(LIGHTABLE_LOGS, itemId);

/** Start lighting the logs in `slot` on the player's tile (needs a tinderbox). */
export function lightLogs(
  state: GameState,
  content: Content,
  slot: number,
  cancel: (s: GameState) => GameState,
): GameState {
  const logsId = state.inventory.slots[slot]?.itemId;
  if (!logsId || !isLightable(logsId))
    return addImportantChat(state, FIRE_MESSAGES.errors.notLightable);
  if (countItem(state.inventory, TINDERBOX_ID) < 1)
    return addImportantChat(state, FIRE_MESSAGES.errors.noTinderbox);
  if (state.firemaking.lighting) return state;
  const s = cancel(state);
  const { x, y } = s.movement.position;
  // Nowhere to step aside to: refuse up front rather than leave the player standing on the new fire.
  if (!stepAsideTile(content, s, { x, y }))
    return addImportantChat(s, FIRE_MESSAGES.errors.tileOccupied);
  const lighting = { logsId, tile: { x, y }, ticksLeft: LIGHT_TICKS, announced: false };
  return addChat({ ...s, firemaking: { ...s.firemaking, lighting } }, FIRE_MESSAGES.lighting);
}

/** Drop the lighting action (a click elsewhere, or the player moved). */
export const cancelLighting = (state: GameState): GameState =>
  state.firemaking.lighting
    ? { ...state, firemaking: { ...state.firemaking, lighting: null } }
    : state;

/** The first STEP_ASIDE neighbour of `from` that is walkable and has no fire. */
export function stepAsideTile(content: Content, state: GameState, from: Tile): Tile | null {
  for (const o of STEP_ASIDE) {
    const t = { x: from.x + o.dx, y: from.y + o.dy };
    if (content.grid.isWalkable(t.x, t.y) && !fireAt(state.firemaking.fires, t)) return t;
  }
  return null;
}

/** The lighting action finished its ticks: try to make the fire. */
function finishLighting(
  input: GameState,
  content: Content,
  tick: number,
  out: AppEvent[],
): GameState {
  const l = input.firemaking.lighting!;
  const fm = { ...input.firemaking, lighting: null };
  let state: GameState = { ...input, firemaking: fm };
  const have = countItem(state.inventory, l.logsId) >= 1;
  const r = lightFire(fm.fires, {
    tile: l.tile,
    logsId: l.logsId,
    hasTinderbox: countItem(state.inventory, TINDERBOX_ID) >= 1,
    tileBlocked: !content.grid.isWalkable(l.tile.x, l.tile.y),
    nowTick: tick,
    nextId: `fire${fm.nextId}`,
  });
  if (!have) return addImportantChat(state, FIRE_MESSAGES.errors.notLightable);
  if (!r.ok) return addImportantChat(state, FIRE_MESSAGES.errors[r.error]);
  // A neighbour got blocked while lighting: nowhere to step off the fire, so refuse (logs untouched).
  if (!stepAsideTile(content, state, l.tile))
    return addImportantChat(state, FIRE_MESSAGES.errors.tileOccupied);
  const removed = removeItem(state.inventory, r.value.consumed.itemId, r.value.consumed.quantity);
  if (!removed.ok) return addImportantChat(state, FIRE_MESSAGES.errors.notLightable);
  const { fire } = r.value;
  state = {
    ...state,
    inventory: removed.value,
    firemaking: { ...fm, fires: r.value.fires, nextId: fm.nextId + 1 },
  };
  out.push({ type: 'fireLit', fireId: fire.id, tile: fire.tile, logsId: fire.logsId } as AppEvent);
  state = addChat(state, FIRE_MESSAGES.lit);
  // Step aside THIS tick (not next): the render trail then walks the player off the flames while the tick plays.
  // Checked free above, and the new fire is on `fire.tile` itself, not a neighbour.
  const aside = stepAsideTile(content, state, fire.tile)!;
  return { ...state, movement: { ...setPath(state.movement, []), position: { ...aside } } };
}

/** Every tick: fires burn out (leaving ashes on the ground), and the lighting action advances. */
export function createFiremakingSystem(content: Content): System<GameState, AppEvent> {
  return (input: GameState, ctx: TickContext): TickResult<GameState, AppEvent> => {
    const events: AppEvent[] = [];
    let state = input;
    const burn = tickFires(state.firemaking.fires, ctx.tick);
    if (burn.events.length > 0) {
      state = { ...state, firemaking: { ...state.firemaking, fires: burn.fires } };
      let ground = state.ground;
      for (const d of burn.drops) {
        const r = dropGroundItem(
          ground,
          { itemId: d.itemId, qty: d.quantity, x: d.tile.x, y: d.tile.y, tick: ctx.tick },
          content.items,
        );
        ground = r.state;
        events.push(...(r.events as AppEvent[]));
      }
      state = { ...state, ground };
      events.push(...burn.events);
      state = addChat(state, FIRE_MESSAGES.burnedOut);
    }

    const l = state.firemaking.lighting;
    if (!l) return { state, events };
    const pos = state.movement.position;
    if (state.movement.path.length > 0 || pos.x !== l.tile.x || pos.y !== l.tile.y)
      return { state: cancelLighting(state), events };
    if (!l.announced) events.push({ type: 'fireLightStarted', tile: { ...l.tile } } as AppEvent);
    const ticksLeft = l.ticksLeft - 1;
    if (ticksLeft > 0)
      return {
        state: {
          ...state,
          firemaking: { ...state.firemaking, lighting: { ...l, announced: true, ticksLeft } },
        },
        events,
      };
    return { state: finishLighting(state, content, ctx.tick, events), events };
  };
}
