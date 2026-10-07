import type { ItemRegistry } from '@core/items';
import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import { INVENTORY_SIZE, MAX_STACK } from './types';
import type { AddError, InventoryState, ItemStack, RemoveError } from './types';

export const validQty = (q: number): boolean => Number.isSafeInteger(q) && q > 0 && q <= MAX_STACK;

/** Build an inventory, placing each stack in the next free slot in order. Throws if over capacity or invalid. */
export function createInventory(initial: readonly ItemStack[] = []): InventoryState {
  if (initial.length > INVENTORY_SIZE) throw new Error('Too many initial stacks');
  const slots: (ItemStack | null)[] = Array.from({ length: INVENTORY_SIZE }, () => null);
  initial.forEach((s, i) => {
    if (!validQty(s.quantity)) throw new Error(`Invalid quantity for "${s.itemId}"`);
    slots[i] = { itemId: s.itemId, quantity: s.quantity };
  });
  return { slots };
}

export const countItem = (inv: InventoryState, itemId: string): number =>
  inv.slots.reduce((n, s) => (s && s.itemId === itemId ? n + s.quantity : n), 0);

export const hasItem = (inv: InventoryState, itemId: string, quantity = 1): boolean =>
  countItem(inv, itemId) >= quantity;

export const freeSlots = (inv: InventoryState): number =>
  inv.slots.reduce((n, s) => (s === null ? n + 1 : n), 0);

/** Distinct item ids held, in slot order. */
export const itemIds = (inv: InventoryState): string[] => [
  ...new Set(inv.slots.flatMap((s) => (s ? [s.itemId] : []))),
];

function checkAdd(
  inv: InventoryState,
  registry: ItemRegistry,
  itemId: string,
  quantity: number,
): AddError | null {
  const def = registry.get(itemId);
  if (!def) return 'unknownItem';
  if (!validQty(quantity)) return 'invalidQuantity';
  if (!def.stackable) return freeSlots(inv) >= quantity ? null : 'inventoryFull';
  const stack = inv.slots.find((s) => s?.itemId === itemId);
  if (stack) return stack.quantity + quantity <= MAX_STACK ? null : 'inventoryFull';
  return freeSlots(inv) >= 1 ? null : 'inventoryFull';
}

/** Whether `addItem` with the same arguments would succeed. */
export const canAdd = (
  inv: InventoryState,
  registry: ItemRegistry,
  itemId: string,
  quantity = 1,
): boolean => checkAdd(inv, registry, itemId, quantity) === null;

/** All-or-nothing add. A stackable stack never exceeds MAX_STACK (overflow fails as inventoryFull). */
export function addItem(
  inv: InventoryState,
  registry: ItemRegistry,
  itemId: string,
  quantity = 1,
): Result<InventoryState, AddError> {
  const error = checkAdd(inv, registry, itemId, quantity);
  if (error) return err(error);
  const slots = inv.slots.slice();
  if (registry.isStackable(itemId)) {
    const i = slots.findIndex((s) => s?.itemId === itemId);
    if (i >= 0) slots[i] = { itemId, quantity: (slots[i] as ItemStack).quantity + quantity };
    else slots[slots.indexOf(null)] = { itemId, quantity };
  } else {
    for (let n = 0; n < quantity; n++) slots[slots.indexOf(null)] = { itemId, quantity: 1 };
  }
  return ok({ slots });
}

/** All-or-nothing remove, taking from the first slots holding the item. */
export function removeItem(
  inv: InventoryState,
  itemId: string,
  quantity = 1,
): Result<InventoryState, RemoveError> {
  if (!validQty(quantity) || countItem(inv, itemId) < quantity) return err('notEnough');
  let left = quantity;
  const slots = inv.slots.map((s) => {
    if (!s || s.itemId !== itemId || left === 0) return s;
    const take = Math.min(left, s.quantity);
    left -= take;
    return take === s.quantity ? null : { itemId, quantity: s.quantity - take };
  });
  return ok({ slots });
}

/** Empty a slot (drop). `removed` is null when the slot was empty or out of range. */
export function removeSlot(
  inv: InventoryState,
  slot: number,
): { inv: InventoryState; removed: ItemStack | null } {
  const removed = Number.isInteger(slot) ? (inv.slots[slot] ?? null) : null;
  if (!removed) return { inv, removed: null };
  const slots = inv.slots.slice();
  slots[slot] = null;
  return { inv: { slots }, removed: { ...removed } };
}

/** Swap two slots (drag and drop). Invalid or equal indices return the inventory unchanged. */
export function swapSlots(inv: InventoryState, a: number, b: number): InventoryState {
  const okIdx = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < INVENTORY_SIZE;
  if (!okIdx(a) || !okIdx(b) || a === b) return inv;
  const slots = inv.slots.slice();
  slots[a] = inv.slots[a] ?? null;
  slots[b] = inv.slots[b] ?? null;
  [slots[a], slots[b]] = [slots[b] ?? null, slots[a] ?? null];
  return { slots };
}

export const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null);

export const hasExactKeys = (o: object, keys: string[]): boolean => {
  const own = Object.getOwnPropertyNames(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

export function serializeInventory(inv: InventoryState): unknown {
  return { slots: inv.slots.map((s) => (s ? { itemId: s.itemId, quantity: s.quantity } : null)) };
}

/** Validate untrusted save data. Builds fresh objects; never spreads the input. */
export function deserializeInventory(
  data: unknown,
  registry: ItemRegistry,
): Result<InventoryState, string> {
  if (!isPlain(data) || !hasExactKeys(data, ['slots'])) return err('inventory: bad shape');
  const raw = data.slots;
  if (!Array.isArray(raw) || raw.length !== INVENTORY_SIZE) return err('inventory: bad slot count');
  const slots: (ItemStack | null)[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s: unknown = raw[i];
    if (s === null) {
      slots.push(null);
      continue;
    }
    if (!isPlain(s) || !hasExactKeys(s, ['itemId', 'quantity']))
      return err(`inventory: bad slot ${i}`);
    const { itemId, quantity } = s;
    if (typeof itemId !== 'string' || !registry.has(itemId))
      return err(`inventory: unknown item in slot ${i}`);
    if (typeof quantity !== 'number' || !validQty(quantity))
      return err(`inventory: bad quantity in slot ${i}`);
    if (!registry.isStackable(itemId) && quantity !== 1)
      return err(`inventory: non-stackable quantity in slot ${i}`);
    slots.push({ itemId, quantity });
  }
  return ok({ slots });
}
