import { describe, expect, it } from 'vitest';
import { createItemRegistry } from '@core/items';
import {
  BANK_CAPACITY,
  INVENTORY_SIZE,
  MAX_STACK,
  bankCount,
  countItem,
  createBank,
  createInventory,
  deposit,
  depositAll,
  deserializeBank,
  freeSlots,
  serializeBank,
  withdraw,
} from './index';
import type { BankMove, BankState, InventoryState } from './index';

const def = (id: string, stackable: boolean) => ({
  id,
  name: id,
  examine: id,
  value: 1,
  stackable,
});
const reg = createItemRegistry([def('coins', true), def('logs', true), def('sword', false)]);
const swords = (n: number) => Array.from({ length: n }, () => ({ itemId: 'sword', quantity: 1 }));
const unwrap = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${String(r.error)}`);
  return r.value as T;
};
const totals = (m: { inv: InventoryState; bank: BankState }, id: string) =>
  countItem(m.inv, id) + bankCount(m.bank, id);

describe('createBank', () => {
  it('copies stacks and rejects bad input', () => {
    const s = { itemId: 'coins', quantity: 3 };
    const b = createBank([s]);
    expect(b.items[0]).toEqual(s);
    expect(b.items[0]).not.toBe(s);
    expect(() => createBank([s, s])).toThrow();
    expect(() => createBank([{ itemId: 'coins', quantity: 0 }])).toThrow();
    expect(() =>
      createBank(
        Array.from({ length: BANK_CAPACITY + 1 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })),
      ),
    ).toThrow();
  });
});

describe('deposit', () => {
  it('non-stackable: 1 takes the clicked slot only', () => {
    const inv = createInventory(swords(3));
    const r = unwrap(deposit(inv, createBank(), 1, 1, reg));
    expect(r.inv.slots[1]).toBeNull();
    expect(r.inv.slots[0]).not.toBeNull();
    expect(bankCount(r.bank, 'sword')).toBe(1);
  });
  it("non-stackable: 'all' takes every one in the inventory", () => {
    const inv = createInventory([...swords(3), { itemId: 'logs', quantity: 4 }]);
    const r = unwrap(deposit(inv, createBank(), 2, 'all', reg));
    expect(countItem(r.inv, 'sword')).toBe(0);
    expect(countItem(r.inv, 'logs')).toBe(4);
    expect(bankCount(r.bank, 'sword')).toBe(3);
  });
  it('non-stackable: a number beyond the clicked slot spills to others, clamped to held', () => {
    const inv = createInventory(swords(3));
    const r = unwrap(deposit(inv, createBank(), 2, 10, reg));
    expect(bankCount(r.bank, 'sword')).toBe(3);
    expect(freeSlots(r.inv)).toBe(INVENTORY_SIZE);
  });
  it('stackable: partial, clamped, and all', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: 10 }]);
    const a = unwrap(deposit(inv, createBank(), 0, 4, reg));
    expect(a.inv.slots[0]).toEqual({ itemId: 'coins', quantity: 6 });
    expect(bankCount(a.bank, 'coins')).toBe(4);
    const b = unwrap(deposit(a.inv, a.bank, 0, 99, reg));
    expect(b.inv.slots[0]).toBeNull();
    expect(bankCount(b.bank, 'coins')).toBe(10);
    const c = unwrap(deposit(inv, createBank(), 0, 'all', reg));
    expect(bankCount(c.bank, 'coins')).toBe(10);
  });
  it('errors: empty/out-of-range slot, invalid quantity', () => {
    const inv = createInventory(swords(1));
    for (const slot of [5, -1, 99, 1.5, NaN]) {
      expect(deposit(inv, createBank(), slot, 1, reg)).toEqual({ ok: false, error: 'emptySlot' });
    }
    for (const q of [0, -1, 1.5, NaN, MAX_STACK + 1]) {
      expect(deposit(inv, createBank(), 0, q, reg)).toEqual({
        ok: false,
        error: 'invalidQuantity',
      });
    }
  });
  it('bank full: new id rejected, existing id still stacks', () => {
    const full = createBank(
      Array.from({ length: BANK_CAPACITY }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })),
    );
    const inv = createInventory([{ itemId: 'coins', quantity: 1 }]);
    expect(deposit(inv, full, 0, 1, reg)).toEqual({ ok: false, error: 'bankFull' });
    const withCoins = createBank([...full.items.slice(1), { itemId: 'coins', quantity: 1 }]);
    expect(bankCount(unwrap(deposit(inv, withCoins, 0, 1, reg)).bank, 'coins')).toBe(2);
  });
  it('MAX_STACK overflow clamps, and no room is bankFull', () => {
    const inv = createInventory([{ itemId: 'coins', quantity: 10 }]);
    const nearly = createBank([{ itemId: 'coins', quantity: MAX_STACK - 3 }]);
    const r = unwrap(deposit(inv, nearly, 0, 'all', reg));
    expect(bankCount(r.bank, 'coins')).toBe(MAX_STACK);
    expect(r.inv.slots[0]).toEqual({ itemId: 'coins', quantity: 7 });
    expect(deposit(r.inv, r.bank, 0, 1, reg)).toEqual({ ok: false, error: 'bankFull' });
  });
  it('does not mutate inputs and conserves totals', () => {
    const inv = createInventory([...swords(2), { itemId: 'coins', quantity: 9 }]);
    const bank = createBank([{ itemId: 'coins', quantity: 5 }]);
    const snap = JSON.stringify([inv, bank]);
    const r = unwrap(deposit(inv, bank, 2, 3, reg));
    expect(JSON.stringify([inv, bank])).toBe(snap);
    expect(totals(r, 'coins')).toBe(14);
  });
});

describe('depositAll', () => {
  it('moves every id, keeping first-deposit order', () => {
    const inv = createInventory([
      ...swords(2),
      { itemId: 'coins', quantity: 5 },
      { itemId: 'logs', quantity: 2 },
    ]);
    const r = unwrap(depositAll(inv, createBank([{ itemId: 'logs', quantity: 1 }])));
    expect(freeSlots(r.inv)).toBe(INVENTORY_SIZE);
    expect(r.bank.items.map((s) => s.itemId)).toEqual(['logs', 'sword', 'coins']);
    expect(bankCount(r.bank, 'logs')).toBe(3);
  });
  it('empty inventory is ok and unchanged', () => {
    const inv = createInventory();
    expect(unwrap(depositAll(inv, createBank())).inv).toBe(inv);
  });
  it('skips ids that do not fit; bankFull when nothing moved', () => {
    const inv = createInventory([
      { itemId: 'coins', quantity: 10 },
      { itemId: 'logs', quantity: 1 },
    ]);
    const bank = createBank([{ itemId: 'coins', quantity: MAX_STACK - 5 }]);
    const r = unwrap(depositAll(inv, bank));
    expect(countItem(r.inv, 'coins')).toBe(10);
    expect(bankCount(r.bank, 'logs')).toBe(1);
    expect(depositAll(r.inv, r.bank)).toEqual({ ok: false, error: 'bankFull' });
  });
});

describe('withdraw', () => {
  it('stackable into empty inventory, removing the entry at 0', () => {
    const bank = createBank([{ itemId: 'coins', quantity: 5 }]);
    const r = unwrap(withdraw(createInventory(), bank, 'coins', 'all', reg));
    expect(r.withdrawn).toBe(5);
    expect(r.bank.items).toEqual([]);
    expect(countItem(r.inv, 'coins')).toBe(5);
  });
  it('partial withdraw leaves the remainder', () => {
    const bank = createBank([{ itemId: 'coins', quantity: 5 }]);
    const r = unwrap(withdraw(createInventory(), bank, 'coins', 2, reg));
    expect(bankCount(r.bank, 'coins')).toBe(3);
    const over = unwrap(withdraw(createInventory(), bank, 'coins', 99, reg));
    expect(over.withdrawn).toBe(5);
  });
  it('non-stackable withdraws as many as free slots when nearly full', () => {
    const inv = createInventory(swords(INVENTORY_SIZE - 3).map((s) => ({ ...s, itemId: 'logs' })));
    const bank = createBank([{ itemId: 'sword', quantity: 10 }]);
    const r = unwrap(withdraw(inv, bank, 'sword', 'all', reg));
    expect(r.withdrawn).toBe(3);
    expect(freeSlots(r.inv)).toBe(0);
    expect(bankCount(r.bank, 'sword')).toBe(7);
    expect(totals(r, 'sword')).toBe(10);
  });
  it('stackable merges into a stack when inventory is full; clamps at MAX_STACK', () => {
    const inv = createInventory([
      { itemId: 'coins', quantity: MAX_STACK - 2 },
      ...swords(INVENTORY_SIZE - 1),
    ]);
    const bank = createBank([{ itemId: 'coins', quantity: 10 }]);
    const r = unwrap(withdraw(inv, bank, 'coins', 'all', reg));
    expect(r.withdrawn).toBe(2);
    expect(bankCount(r.bank, 'coins')).toBe(8);
    expect(withdraw(r.inv, r.bank, 'coins', 1, reg)).toEqual({ ok: false, error: 'inventoryFull' });
  });
  it('errors', () => {
    const bank = createBank([{ itemId: 'sword', quantity: 1 }]);
    expect(withdraw(createInventory(), bank, 'logs', 1, reg)).toEqual({
      ok: false,
      error: 'notInBank',
    });
    expect(
      withdraw(createInventory(), createBank([{ itemId: 'ghost', quantity: 1 }]), 'ghost', 1, reg),
    ).toEqual({
      ok: false,
      error: 'notInBank',
    });
    const full = createInventory(swords(INVENTORY_SIZE));
    expect(withdraw(full, bank, 'sword', 1, reg)).toEqual({ ok: false, error: 'inventoryFull' });
    for (const q of [0, -2, 1.5, NaN]) {
      expect(withdraw(createInventory(), bank, 'sword', q, reg)).toEqual({
        ok: false,
        error: 'invalidQuantity',
      });
    }
  });
  it('round trip conserves totals', () => {
    const inv = createInventory([...swords(5), { itemId: 'coins', quantity: 100 }]);
    const dep: BankMove = unwrap(depositAll(inv, createBank()));
    const back = unwrap(withdraw(dep.inv, dep.bank, 'sword', 'all', reg));
    expect(countItem(back.inv, 'sword')).toBe(5);
    expect(totals(back, 'coins')).toBe(100);
  });
});

describe('serializeBank / deserializeBank', () => {
  const bank = createBank([
    { itemId: 'coins', quantity: 7 },
    { itemId: 'sword', quantity: 3 },
  ]);
  it('round trips through JSON', () => {
    const data: unknown = JSON.parse(JSON.stringify(serializeBank(bank)));
    expect(unwrap(deserializeBank(data, reg))).toEqual(bank);
  });
  const bad: [string, unknown][] = [
    ['null', null],
    ['array', []],
    ['missing items', {}],
    ['extra key', { items: [], x: 1 }],
    ['items not array', { items: {} }],
    ['too many', { items: Array.from({ length: BANK_CAPACITY + 1 }, () => ({})) }],
    ['entry null', { items: [null] }],
    ['entry extra key', { items: [{ itemId: 'coins', quantity: 1, y: 1 }] }],
    ['unknown id', { items: [{ itemId: 'ghost', quantity: 1 }] }],
    ['id not string', { items: [{ itemId: 5, quantity: 1 }] }],
    [
      'duplicate',
      {
        items: [
          { itemId: 'coins', quantity: 1 },
          { itemId: 'coins', quantity: 2 },
        ],
      },
    ],
    ['zero qty', { items: [{ itemId: 'coins', quantity: 0 }] }],
    ['negative qty', { items: [{ itemId: 'coins', quantity: -1 }] }],
    ['fraction qty', { items: [{ itemId: 'coins', quantity: 1.5 }] }],
    ['over max', { items: [{ itemId: 'coins', quantity: MAX_STACK + 1 }] }],
    ['string qty', { items: [{ itemId: 'coins', quantity: '1' }] }],
    ['proto key', JSON.parse('{"items":[],"__proto__":{"a":1}}') as unknown],
    [
      'proto entry',
      { items: [JSON.parse('{"itemId":"coins","quantity":1,"__proto__":{}}') as unknown] },
    ],
    [
      'class instance',
      new (class X {
        items = [];
      })(),
    ],
  ];
  it.each(bad)('rejects %s', (_n, data) => {
    expect(deserializeBank(data, reg).ok).toBe(false);
  });
  it('accepts max quantity and does not alias input', () => {
    const data = { items: [{ itemId: 'coins', quantity: MAX_STACK }] };
    const r = unwrap(deserializeBank(data, reg));
    expect(r.items[0]).not.toBe(data.items[0]);
    expect(r.items[0]?.quantity).toBe(MAX_STACK);
  });
});
