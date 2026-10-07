import { describe, expect, it } from 'vitest';
import { createItemRegistry } from '@core/items';
import {
  INVENTORY_SIZE,
  MAX_STACK,
  addItem,
  canAdd,
  countItem,
  createInventory,
  deserializeInventory,
  freeSlots,
  hasItem,
  itemIds,
  removeItem,
  removeSlot,
  serializeInventory,
  swapSlots,
} from './index';
import type { InventoryState, ItemStack } from './index';

const def = (id: string, stackable: boolean) => ({
  id,
  name: id,
  examine: id,
  value: 1,
  stackable,
});
const reg = createItemRegistry([def('coins', true), def('logs', true), def('sword', false)]);
const total = (inv: InventoryState, id: string) => countItem(inv, id);
const full = (): InventoryState =>
  createInventory(Array.from({ length: INVENTORY_SIZE }, () => ({ itemId: 'sword', quantity: 1 })));
const unwrap = <T>(r: { ok: boolean; value?: T }): T => {
  if (!r.ok) throw new Error('expected ok');
  return r.value as T;
};

describe('createInventory', () => {
  it('is 28 empty slots', () => {
    const inv = createInventory();
    expect(inv.slots).toHaveLength(28);
    expect(freeSlots(inv)).toBe(28);
  });
  it('places initial stacks in order and copies them', () => {
    const s: ItemStack = { itemId: 'coins', quantity: 5 };
    const inv = createInventory([s]);
    expect(inv.slots[0]).toEqual(s);
    expect(inv.slots[0]).not.toBe(s);
  });
  it('rejects too many or invalid stacks', () => {
    expect(() => createInventory(Array(29).fill({ itemId: 'sword', quantity: 1 }))).toThrow();
    expect(() => createInventory([{ itemId: 'coins', quantity: 0 }])).toThrow();
  });
});

describe('addItem', () => {
  it('stackable takes one slot and merges', () => {
    let inv = unwrap(addItem(createInventory(), reg, 'coins', 10));
    inv = unwrap(addItem(inv, reg, 'coins', 5));
    expect(freeSlots(inv)).toBe(27);
    expect(total(inv, 'coins')).toBe(15);
  });
  it('non-stackable uses one slot each', () => {
    const inv = unwrap(addItem(createInventory(), reg, 'sword', 3));
    expect(freeSlots(inv)).toBe(25);
    expect(inv.slots.slice(0, 3).every((s) => s?.quantity === 1)).toBe(true);
  });
  it('does not mutate the input', () => {
    const inv = createInventory();
    const snap = JSON.stringify(inv);
    addItem(inv, reg, 'sword', 2);
    expect(JSON.stringify(inv)).toBe(snap);
  });
  it.each([
    ['unknownItem', 'nope', 1],
    ['invalidQuantity', 'coins', 0],
    ['invalidQuantity', 'coins', -1],
    ['invalidQuantity', 'coins', 1.5],
    ['invalidQuantity', 'coins', NaN],
    ['invalidQuantity', 'coins', MAX_STACK + 1],
  ])('fails with %s for %s x%s', (error, id, q) => {
    expect(addItem(createInventory(), reg, id, q)).toEqual({ ok: false, error });
  });
  it('exactly full: last sword fits, next fails', () => {
    const almost = unwrap(addItem(createInventory(), reg, 'sword', 27));
    const f = unwrap(addItem(almost, reg, 'sword'));
    expect(freeSlots(f)).toBe(0);
    expect(addItem(f, reg, 'sword')).toEqual({ ok: false, error: 'inventoryFull' });
  });
  it('non-stackable batch that partially fits fails with nothing changed', () => {
    const inv = unwrap(addItem(createInventory(), reg, 'sword', 26));
    const r = addItem(inv, reg, 'sword', 3);
    expect(r).toEqual({ ok: false, error: 'inventoryFull' });
    expect(freeSlots(inv)).toBe(2);
  });
  it('stackable into a full inventory with an existing stack succeeds', () => {
    const inv = createInventory([
      { itemId: 'coins', quantity: 1 },
      ...Array.from({ length: 27 }, () => ({ itemId: 'sword', quantity: 1 })),
    ]);
    expect(freeSlots(inv)).toBe(0);
    expect(total(unwrap(addItem(inv, reg, 'coins', 99)), 'coins')).toBe(100);
  });
  it('new stackable into a full inventory fails', () => {
    expect(addItem(full(), reg, 'coins')).toEqual({ ok: false, error: 'inventoryFull' });
  });
  it('quantity overflow at max int fails and leaves state', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: MAX_STACK }]);
    expect(addItem(inv, reg, 'coins')).toEqual({ ok: false, error: 'inventoryFull' });
    const ok1 = unwrap(addItem(createInventory(), reg, 'coins', MAX_STACK));
    expect(total(ok1, 'coins')).toBe(MAX_STACK);
  });
});

describe('canAdd', () => {
  it.each([
    [createInventory(), 'sword', 28, true],
    [createInventory(), 'sword', 29, false],
    [createInventory(), 'coins', 1, true],
    [createInventory(), 'nope', 1, false],
    [createInventory(), 'coins', 0, false],
    [full(), 'coins', 1, false],
    [full(), 'sword', 1, false],
  ])('canAdd %# -> %s', (inv, id, q, expected) => {
    expect(canAdd(inv, reg, id, q)).toBe(expected);
  });
  it('agrees with addItem', () => {
    const inv = unwrap(addItem(createInventory(), reg, 'sword', 20));
    for (const q of [1, 8, 9])
      expect(canAdd(inv, reg, 'sword', q)).toBe(addItem(inv, reg, 'sword', q).ok);
  });
});

describe('removeItem', () => {
  it('removes part of a stack', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: 10 }]);
    expect(total(unwrap(removeItem(inv, 'coins', 4)), 'coins')).toBe(6);
  });
  it('empties a slot when the stack is exhausted', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: 10 }]);
    expect(freeSlots(unwrap(removeItem(inv, 'coins', 10)))).toBe(28);
  });
  it('spans several slots for non-stackables and across split stacks', () => {
    const inv = unwrap(addItem(createInventory(), reg, 'sword', 5));
    expect(total(unwrap(removeItem(inv, 'sword', 3)), 'sword')).toBe(2);
    const split = createInventory([
      { itemId: 'logs', quantity: 3 },
      { itemId: 'logs', quantity: 4 },
    ]);
    const r = unwrap(removeItem(split, 'logs', 5));
    expect(total(r, 'logs')).toBe(2);
    expect(r.slots[0]).toBeNull();
  });
  it.each([
    ['too many', 11],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 0.5],
  ])('fails notEnough: %s', (_n, q) => {
    const inv = createInventory([{ itemId: 'coins', quantity: 10 }]);
    expect(removeItem(inv, 'coins', q)).toEqual({ ok: false, error: 'notEnough' });
    expect(total(inv, 'coins')).toBe(10);
  });
  it('fails for an item not held', () => {
    expect(removeItem(createInventory(), 'coins')).toEqual({ ok: false, error: 'notEnough' });
  });
  it('conserves quantity: add then remove returns to start', () => {
    for (const q of [1, 7, 26]) {
      const start = unwrap(addItem(createInventory(), reg, 'sword', 2));
      const after = unwrap(removeItem(unwrap(addItem(start, reg, 'sword', q)), 'sword', q));
      expect(total(after, 'sword')).toBe(total(start, 'sword'));
      expect(freeSlots(after)).toBe(freeSlots(start));
    }
  });
});

describe('removeSlot', () => {
  it('drops a slot and returns the stack', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: 5 }]);
    const r = removeSlot(inv, 0);
    expect(r.removed).toEqual({ itemId: 'coins', quantity: 5 });
    expect(freeSlots(r.inv)).toBe(28);
    expect(inv.slots[0]).not.toBeNull();
  });
  it.each([[5], [-1], [28], [1.5], [NaN]])('slot %s yields nothing', (slot) => {
    const inv = createInventory([{ itemId: 'coins', quantity: 5 }]);
    const r = removeSlot(inv, slot);
    expect(r.removed).toBeNull();
    expect(r.inv).toBe(inv);
  });
});

describe('queries', () => {
  const inv = createInventory([
    { itemId: 'coins', quantity: 5 },
    { itemId: 'sword', quantity: 1 },
    { itemId: 'sword', quantity: 1 },
  ]);
  it('hasItem', () => {
    expect(hasItem(inv, 'coins')).toBe(true);
    expect(hasItem(inv, 'coins', 5)).toBe(true);
    expect(hasItem(inv, 'coins', 6)).toBe(false);
    expect(hasItem(inv, 'logs')).toBe(false);
  });
  it('itemIds is distinct', () => {
    expect(itemIds(inv)).toEqual(['coins', 'sword']);
    expect(itemIds(createInventory())).toEqual([]);
  });
});

describe('swapSlots', () => {
  const inv = createInventory([{ itemId: 'coins', quantity: 5 }]);
  it('swaps with an empty slot and at the edges', () => {
    const r = swapSlots(inv, 0, 27);
    expect(r.slots[27]).toEqual({ itemId: 'coins', quantity: 5 });
    expect(r.slots[0]).toBeNull();
    expect(inv.slots[0]).not.toBeNull();
  });
  it('swaps two stacks', () => {
    const two = createInventory([
      { itemId: 'coins', quantity: 5 },
      { itemId: 'sword', quantity: 1 },
    ]);
    const r = swapSlots(two, 0, 1);
    expect(r.slots[0]?.itemId).toBe('sword');
    expect(r.slots[1]?.itemId).toBe('coins');
  });
  it.each([
    [0, 0],
    [-1, 0],
    [0, 28],
    [0.5, 1],
    [NaN, 1],
  ])('no-op for %s,%s', (a, b) => {
    expect(swapSlots(inv, a, b)).toBe(inv);
  });
});

describe('persistence', () => {
  it('round-trips through JSON', () => {
    const inv = unwrap(
      addItem(unwrap(addItem(createInventory(), reg, 'sword', 2)), reg, 'coins', 9),
    );
    const r = deserializeInventory(JSON.parse(JSON.stringify(serializeInventory(inv))), reg);
    expect(unwrap(r)).toEqual(inv);
  });
  const good = () =>
    JSON.parse(JSON.stringify(serializeInventory(createInventory()))) as {
      slots: unknown[];
    };
  const withSlot = (s: unknown) => {
    const d = good();
    d.slots[3] = s;
    return d;
  };
  it.each([
    ['null', null],
    ['string', 'x'],
    ['array', []],
    ['missing slots', {}],
    ['extra key', { slots: good().slots, extra: 1 }],
    ['slots not array', { slots: {} }],
    ['too short', { slots: good().slots.slice(1) }],
    ['too long', { slots: [...good().slots, null] }],
    ['unknown item', withSlot({ itemId: 'nope', quantity: 1 })],
    ['non-string id', withSlot({ itemId: 5, quantity: 1 })],
    ['zero qty', withSlot({ itemId: 'coins', quantity: 0 })],
    ['negative qty', withSlot({ itemId: 'coins', quantity: -2 })],
    ['fractional qty', withSlot({ itemId: 'coins', quantity: 1.5 })],
    ['string qty', withSlot({ itemId: 'coins', quantity: '5' })],
    ['over max', withSlot({ itemId: 'coins', quantity: MAX_STACK + 1 })],
    ['non-stackable x2', withSlot({ itemId: 'sword', quantity: 2 })],
    ['extra slot key', withSlot({ itemId: 'coins', quantity: 1, x: 1 })],
    ['missing quantity', withSlot({ itemId: 'coins' })],
    ['slot is array', withSlot([])],
    ['slot is number', withSlot(7)],
    ['proto slot key', withSlot(JSON.parse('{"itemId":"coins","quantity":1,"__proto__":{"a":1}}'))],
    ['proto top key', JSON.parse(`{"slots":${JSON.stringify(good().slots)},"__proto__":{"a":1}}`)],
    ['proto id', withSlot({ itemId: '__proto__', quantity: 1 })],
  ])('rejects %s', (_n, data) => {
    expect(deserializeInventory(data, reg).ok).toBe(false);
  });
  it('does not pollute prototypes', () => {
    deserializeInventory(JSON.parse('{"slots":[],"__proto__":{"polluted":1}}'), reg);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('accepts max-quantity stackable', () => {
    expect(deserializeInventory(withSlot({ itemId: 'coins', quantity: MAX_STACK }), reg).ok).toBe(
      true,
    );
  });
});
