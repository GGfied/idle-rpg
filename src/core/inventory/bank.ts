import type { ItemRegistry } from '@core/items';
import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import { addItem, countItem, hasExactKeys, isPlain, itemIds, removeItem, validQty } from './logic';
import { BANK_CAPACITY, MAX_STACK } from './types';
import type { BankState, DepositError, InventoryState, ItemStack, WithdrawError } from './types';

export interface BankMove {
  inv: InventoryState;
  bank: BankState;
}

/** Build a bank from stacks (first-deposit order). Throws on duplicates, invalid quantities or over capacity. */
export function createBank(initial: readonly ItemStack[] = []): BankState {
  if (initial.length > BANK_CAPACITY) throw new Error('Too many bank entries');
  const seen = new Set<string>();
  const items = initial.map((s) => {
    if (!validQty(s.quantity) || seen.has(s.itemId))
      throw new Error(`Invalid bank entry "${s.itemId}"`);
    seen.add(s.itemId);
    return { itemId: s.itemId, quantity: s.quantity };
  });
  return { items };
}

export const bankCount = (bank: BankState, itemId: string): number =>
  bank.items.find((s) => s.itemId === itemId)?.quantity ?? 0;

/** How many of `itemId` the bank can still take (0 when full of distinct ids and the id is new). */
function bankRoom(bank: BankState, itemId: string): number {
  const held = bankCount(bank, itemId);
  if (held > 0) return MAX_STACK - held;
  return bank.items.length < BANK_CAPACITY ? MAX_STACK : 0;
}

function bankAdd(bank: BankState, itemId: string, quantity: number): BankState {
  const i = bank.items.findIndex((s) => s.itemId === itemId);
  if (i < 0) return { items: [...bank.items, { itemId, quantity }] };
  const items = bank.items.slice();
  items[i] = { itemId, quantity: (items[i] as ItemStack).quantity + quantity };
  return { items };
}

function bankTake(bank: BankState, itemId: string, quantity: number): BankState {
  const items = bank.items.flatMap((s) =>
    s.itemId !== itemId
      ? [s]
      : s.quantity === quantity
        ? []
        : [{ itemId, quantity: s.quantity - quantity }],
  );
  return { items };
}

/**
 * Deposit from inventory `slot`. A number moves that many (clamped to what is held); 'all' moves every
 * item of that id in the inventory (OSRS). For non-stackables the clicked slot goes first, then the
 * other slots in order. A stack that would pass MAX_STACK in the bank is clamped to the room left
 * (the rest stays in the inventory); no room at all is 'bankFull'. Nothing changes on error.
 */
export function deposit(
  inv: InventoryState,
  bank: BankState,
  slot: number,
  quantity: number | 'all',
  registry: ItemRegistry,
): Result<BankMove, DepositError> {
  const stack = Number.isInteger(slot) ? inv.slots[slot] : null;
  if (!stack) return err('emptySlot');
  if (quantity !== 'all' && !validQty(quantity)) return err('invalidQuantity');
  const { itemId } = stack;
  const held = countItem(inv, itemId);
  // Stackable numbers are limited to the clicked stack; 'all' and non-stackable numbers use the id total.
  const limit = quantity !== 'all' && registry.get(itemId)?.stackable ? stack.quantity : held;
  const amount = Math.min(quantity === 'all' ? held : quantity, limit, bankRoom(bank, itemId));
  if (amount <= 0) return err('bankFull');
  const slots = inv.slots.slice();
  const fromSlot = Math.min(amount, stack.quantity);
  slots[slot] =
    fromSlot === stack.quantity ? null : { itemId, quantity: stack.quantity - fromSlot };
  const rest = amount - fromSlot;
  const after = rest > 0 ? removeItem({ slots }, itemId, rest) : ok({ slots });
  if (!after.ok) return err('emptySlot'); // unreachable: amount <= held
  return ok({ inv: after.value, bank: bankAdd(bank, itemId, amount) });
}

/**
 * Deposit every item id in the inventory. All-or-nothing per id: an id whose full count does not fit
 * (bank at capacity for a new id, or stack would pass MAX_STACK) is skipped and stays in the inventory.
 * Ok with the inventory untouched when it is empty; 'bankFull' when it holds items but none could move.
 */
export function depositAll(inv: InventoryState, bank: BankState): Result<BankMove, 'bankFull'> {
  let cur = inv;
  let b = bank;
  let moved = false;
  for (const itemId of itemIds(inv)) {
    const n = countItem(cur, itemId);
    if (bankRoom(b, itemId) < n) continue;
    const r = removeItem(cur, itemId, n);
    if (!r.ok) continue;
    cur = r.value;
    b = bankAdd(b, itemId, n);
    moved = true;
  }
  if (!moved && itemIds(inv).length > 0) return err('bankFull');
  return ok({ inv: cur, bank: b });
}

/**
 * Withdraw up to `quantity` ('all' = whole entry) of `itemId`. Takes as many as fit: non-stackables one
 * per free slot, stackables into the existing stack (up to MAX_STACK) or one free slot. `withdrawn` is
 * the amount moved. The bank entry is removed at 0. 'inventoryFull' when none fit.
 */
export function withdraw(
  inv: InventoryState,
  bank: BankState,
  itemId: string,
  quantity: number | 'all',
  registry: ItemRegistry,
): Result<BankMove & { withdrawn: number }, WithdrawError> {
  const held = bankCount(bank, itemId);
  const def = registry.get(itemId);
  if (held === 0 || !def) return err('notInBank');
  if (quantity !== 'all' && !validQty(quantity)) return err('invalidQuantity');
  const want = Math.min(quantity === 'all' ? held : quantity, held);
  const free = inv.slots.filter((s) => s === null).length;
  const inInv = countItem(inv, itemId);
  const fit = def.stackable ? (inInv > 0 ? MAX_STACK - inInv : free > 0 ? MAX_STACK : 0) : free;
  const withdrawn = Math.min(want, fit);
  if (withdrawn <= 0) return err('inventoryFull');
  const added = addItem(inv, registry, itemId, withdrawn);
  if (!added.ok) return err('inventoryFull');
  return ok({ inv: added.value, bank: bankTake(bank, itemId, withdrawn), withdrawn });
}

export function serializeBank(bank: BankState): unknown {
  return { items: bank.items.map((s) => ({ itemId: s.itemId, quantity: s.quantity })) };
}

/** Validate untrusted save data. Builds fresh objects; never spreads the input. */
export function deserializeBank(data: unknown, registry: ItemRegistry): Result<BankState, string> {
  if (!isPlain(data) || !hasExactKeys(data, ['items'])) return err('bank: bad shape');
  const raw = data.items;
  if (!Array.isArray(raw) || raw.length > BANK_CAPACITY) return err('bank: bad item count');
  const seen = new Set<string>();
  const items: ItemStack[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s: unknown = raw[i];
    if (!isPlain(s) || !hasExactKeys(s, ['itemId', 'quantity'])) return err(`bank: bad entry ${i}`);
    const { itemId, quantity } = s;
    if (typeof itemId !== 'string' || !registry.has(itemId))
      return err(`bank: unknown item at ${i}`);
    if (seen.has(itemId)) return err(`bank: duplicate item at ${i}`);
    if (typeof quantity !== 'number' || !validQty(quantity))
      return err(`bank: bad quantity at ${i}`);
    seen.add(itemId);
    items.push({ itemId, quantity });
  }
  return ok({ items });
}
