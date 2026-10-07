import { describe, expect, it } from 'vitest';
import { createItemRegistry, defineItems } from './index';
import {
  GROUND_ITEM_DESPAWN_TICKS,
  dropGroundItem,
  emptyGroundItems,
  groundItemsAt,
  takeGroundItem,
  tickGroundItems,
} from './index';
import type { GroundItemsState } from './index';

const reg = createItemRegistry(
  defineItems([
    { id: 'logs', name: 'Logs', examine: '.', value: 4, stackable: false },
    { id: 'feather', name: 'Feather', examine: '.', value: 1, stackable: true },
  ]),
);
const drop = (s: GroundItemsState, itemId: string, qty = 1, x = 1, y = 1, tick = 10) =>
  dropGroundItem(s, { itemId, qty, x, y, tick }, reg);

describe('dropGroundItem', () => {
  it('creates an entry with ids from nextId and a despawn tick', () => {
    const r = drop(emptyGroundItems(), 'logs', 1, 2, 3, 10);
    expect(r.item).toEqual({
      id: 'g1',
      itemId: 'logs',
      qty: 1,
      x: 2,
      y: 3,
      spawnTick: 10,
      despawnTick: 10 + GROUND_ITEM_DESPAWN_TICKS,
    });
    expect(r.state.nextId).toBe(2);
    expect(r.events).toEqual([
      { type: 'groundItemDropped', id: 'g1', itemId: 'logs', qty: 1, x: 2, y: 3 },
    ]);
  });

  it('merges stackables on the same tile and refreshes the timer', () => {
    const a = drop(emptyGroundItems(), 'feather', 5, 1, 1, 10).state;
    const b = drop(a, 'feather', 3, 1, 1, 100);
    expect(b.state.items).toHaveLength(1);
    expect(b.item.qty).toBe(8);
    expect(b.state.items[0]?.despawnTick).toBe(100 + GROUND_ITEM_DESPAWN_TICKS);
    expect(b.events[0]).toMatchObject({ qty: 3 });
  });

  it.each([
    ['different tile', 'feather', 2, 1],
    ['different item', 'logs', 1, 1],
  ])('does not merge stackables on %s', (_n, itemId, x, y) => {
    const a = drop(emptyGroundItems(), 'feather', 5, 1, 1).state;
    expect(drop(a, itemId, 1, x, y).state.items).toHaveLength(2);
  });

  it('never merges non-stackables', () => {
    const a = drop(emptyGroundItems(), 'logs').state;
    const b = drop(a, 'logs').state;
    expect(b.items.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it.each([
    ['unknown item', 'nope', 1],
    ['zero qty', 'logs', 0],
    ['fractional qty', 'logs', 1.5],
  ])('throws on %s', (_n, itemId, qty) => {
    expect(() => drop(emptyGroundItems(), itemId, qty)).toThrow();
  });

  it('does not mutate the input state', () => {
    const s = emptyGroundItems();
    drop(s, 'logs');
    expect(s).toEqual({ items: [], nextId: 1 });
  });
});

describe('takeGroundItem', () => {
  it('removes and returns the item with an event', () => {
    const s = drop(emptyGroundItems(), 'logs').state;
    const r = takeGroundItem(s, 'g1');
    expect(r.ok && r.value.item.itemId).toBe('logs');
    expect(r.ok && r.value.state.items).toEqual([]);
    expect(r.ok && r.value.events[0]?.type).toBe('groundItemTaken');
  });

  it('returns notFound for an unknown or already taken id', () => {
    const s = drop(emptyGroundItems(), 'logs').state;
    expect(takeGroundItem(s, 'g9')).toEqual({ ok: false, error: 'notFound' });
    const r = takeGroundItem(s, 'g1');
    if (!r.ok) throw new Error('expected ok');
    expect(takeGroundItem(r.value.state, 'g1')).toEqual({ ok: false, error: 'notFound' });
  });

  it('does not reuse ids after a take', () => {
    let s = drop(emptyGroundItems(), 'logs').state;
    const r = takeGroundItem(s, 'g1');
    if (!r.ok) throw new Error('expected ok');
    s = r.value.state;
    expect(drop(s, 'logs').item.id).toBe('g2');
  });
});

describe('groundItemsAt', () => {
  it('returns only items on that tile; many items stay in drop order', () => {
    let s = emptyGroundItems();
    for (let i = 0; i < 40; i++) s = drop(s, 'logs', 1, 5, 5).state;
    s = drop(s, 'logs', 1, 6, 5).state;
    expect(groundItemsAt(s, 5, 5)).toHaveLength(40);
    expect(groundItemsAt(s, 5, 5)[0]?.id).toBe('g1');
    expect(groundItemsAt(s, 6, 5)).toHaveLength(1);
    expect(groundItemsAt(s, 0, 0)).toEqual([]);
  });
});

describe('tickGroundItems', () => {
  const s = drop(emptyGroundItems(), 'logs', 1, 1, 1, 10).state;
  const at = 10 + GROUND_ITEM_DESPAWN_TICKS;

  it.each([
    ['one tick before', at - 1, 1, 0],
    ['exactly at despawnTick', at, 0, 1],
    ['after despawnTick', at + 5, 0, 1],
  ])('%s', (_n, tick, left, events) => {
    const r = tickGroundItems(s, tick);
    expect(r.state.items).toHaveLength(left);
    expect(r.events).toHaveLength(events);
    if (events) expect(r.events[0]).toMatchObject({ type: 'groundItemDespawned', id: 'g1' });
  });

  it('only despawns expired items and keeps refreshed ones', () => {
    const a = drop(emptyGroundItems(), 'feather', 1, 1, 1, 0).state;
    const b = drop(a, 'feather', 1, 1, 1, 200).state; // refreshed
    const c = drop(b, 'logs', 1, 2, 2, 0).state;
    const r = tickGroundItems(c, GROUND_ITEM_DESPAWN_TICKS);
    expect(r.state.items.map((g) => g.itemId)).toEqual(['feather']);
    expect(r.events).toHaveLength(1);
  });
});
