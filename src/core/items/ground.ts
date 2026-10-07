import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import type {
  GroundItem,
  GroundItemEvent,
  GroundItemsState,
  DropGroundItemInput,
  ItemRegistry,
} from './types';

/** Ticks a dropped item stays on the ground (300 x 600 ms = 3 minutes). */
export const GROUND_ITEM_DESPAWN_TICKS = 300;

export const emptyGroundItems = (): GroundItemsState => ({ items: [], nextId: 1 });

/**
 * Drops an item on a tile. Stackables of the same id on the same tile merge into one entry;
 * either way the despawn timer (re)starts at `tick`. Throws on an unknown item id or a
 * non-positive-integer qty (programmer errors).
 */
export function dropGroundItem(
  state: GroundItemsState,
  drop: DropGroundItemInput,
  registry: ItemRegistry,
): { state: GroundItemsState; item: GroundItem; events: GroundItemEvent[] } {
  const def = registry.require(drop.itemId);
  if (!Number.isInteger(drop.qty) || drop.qty <= 0) {
    throw new Error(`Cannot drop ${drop.qty} x "${drop.itemId}" (qty must be an integer > 0)`);
  }
  const despawnTick = drop.tick + GROUND_ITEM_DESPAWN_TICKS;
  const existing = def.stackable
    ? state.items.find((g) => g.itemId === drop.itemId && g.x === drop.x && g.y === drop.y)
    : undefined;

  let item: GroundItem;
  let next: GroundItemsState;
  if (existing) {
    item = { ...existing, qty: existing.qty + drop.qty, spawnTick: drop.tick, despawnTick };
    next = { ...state, items: state.items.map((g) => (g.id === existing.id ? item : g)) };
  } else {
    item = {
      id: `g${state.nextId}`,
      itemId: drop.itemId,
      qty: drop.qty,
      x: drop.x,
      y: drop.y,
      spawnTick: drop.tick,
      despawnTick,
    };
    next = { items: [...state.items, item], nextId: state.nextId + 1 };
  }
  const events: GroundItemEvent[] = [
    {
      type: 'groundItemDropped',
      id: item.id,
      itemId: item.itemId,
      qty: drop.qty,
      x: item.x,
      y: item.y,
    },
  ];
  return { state: next, item, events };
}

/** Removes a ground item and returns it. The caller fits it into the inventory. */
export function takeGroundItem(
  state: GroundItemsState,
  id: string,
): Result<{ state: GroundItemsState; item: GroundItem; events: GroundItemEvent[] }, 'notFound'> {
  const item = state.items.find((g) => g.id === id);
  if (!item) return err('notFound');
  return ok({
    state: { ...state, items: state.items.filter((g) => g.id !== id) },
    item,
    events: [
      {
        type: 'groundItemTaken',
        id: item.id,
        itemId: item.itemId,
        qty: item.qty,
        x: item.x,
        y: item.y,
      },
    ],
  });
}

/** All ground items on one tile, in drop order. */
export const groundItemsAt = (state: GroundItemsState, x: number, y: number): GroundItem[] =>
  state.items.filter((g) => g.x === x && g.y === y);

/** Removes items whose despawn tick has been reached (`tick >= despawnTick`). */
export function tickGroundItems(
  state: GroundItemsState,
  tick: number,
): { state: GroundItemsState; events: GroundItemEvent[] } {
  const gone = state.items.filter((g) => tick >= g.despawnTick);
  if (gone.length === 0) return { state, events: [] };
  return {
    state: { ...state, items: state.items.filter((g) => tick < g.despawnTick) },
    events: gone.map((g) => ({
      type: 'groundItemDespawned' as const,
      id: g.id,
      itemId: g.itemId,
      qty: g.qty,
      x: g.x,
      y: g.y,
    })),
  };
}
