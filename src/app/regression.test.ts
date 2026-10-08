import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem, countItem } from '@core/inventory';
import { CORRUPT_KEY, SAVE_KEY, createMemoryStorage, createSaveManager } from '@core/persistence';
import { TREE_SPAWNS, WORLD } from '@features/world';
import { scriptedRng } from '@test-utils/index';
import { CONTENT, SAVE_SCHEMA } from '@app/registry';
import { bankDeposit, bankDepositAll, interactTree } from '@app/game/actions';
import { fromSave, newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import { BAIT_STACK } from '@app/game/starterKits';
import { BAIT_ITEM_ID } from '@features/skills/fishing';
import { createRuntime } from '@app/runtime';
import type { RuntimeEnv } from '@app/runtime';

const env: RuntimeEnv & { hide(): void } = (() => {
  const hidden: (() => void)[] = [];
  return {
    onHidden: (cb) => {
      hidden.push(cb);
      return () => undefined;
    },
    onVisible: () => () => undefined,
    hide: () => hidden.forEach((cb) => cb()),
  };
})();

/** Raw v2 save as shipped in core/persistence/fixtures (an old save a real player may still have). */
const V2_FIXTURE = Object.values(
  import.meta.glob('/src/core/persistence/fixtures/save-v2.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
)[0] as string;

describe('runtime boot with a bad or old save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['not json', '{{{'],
    ['an array', '[]'],
    ['a future version', JSON.stringify({ version: 999, savedAt: 1, data: {} })],
    ['null slices', JSON.stringify({ version: 3, savedAt: 1, data: { inventory: null } })],
  ])('%s: banner offered, game still ticks, the raw save is never overwritten', (_n, raw) => {
    const storage = createMemoryStorage();
    storage.set(SAVE_KEY, raw);
    const rt = createRuntime(storage, env);
    const stop = rt.start();
    expect(rt.store.getState().banner?.canStartFresh).toBe(true);
    vi.advanceTimersByTime(65_000); // two autosave intervals
    env.hide(); // and a page-hide flush
    expect(storage.get(SAVE_KEY)).toEqual({ ok: true, value: raw });
    expect(storage.get(CORRUPT_KEY)).toEqual({ ok: true, value: raw });
    stop();
  });

  it('"Start fresh" after a bad save lets the new game save again and clears the banner', () => {
    const storage = createMemoryStorage();
    storage.set(SAVE_KEY, '{{{');
    const rt = createRuntime(storage, env);
    const stop = rt.start();
    rt.startFresh();
    expect(rt.store.getState().banner).toBeNull();
    const saved = storage.get(SAVE_KEY);
    expect(saved.ok && saved.value !== null && saved.value !== '{{{').toBe(true);
    stop();
  });

  it('an old v2 save (no hp/prayer) boots with its logs, a welcome line and no banner', () => {
    const storage = createMemoryStorage();
    storage.set(SAVE_KEY, V2_FIXTURE);
    const rt = createRuntime(storage, env);
    const g = rt.store.getState().game;
    expect(rt.store.getState().banner).toBeNull();
    expect(countItem(g.inventory, 'logs')).toBe(14); // total across the 14 separate slots
    expect(g.chat.map((c) => c.text)).toContain('Welcome back.');
    rt.start()();
  });
});

describe('saved position that is no longer walkable', () => {
  it.each([
    ['a tree tile', { x: TREE_SPAWNS[0]!.x, y: TREE_SPAWNS[0]!.y }],
    ['water', { x: WORLD.width - 1, y: 0 }],
  ])('%s falls back to a walkable tile', (_n, position) => {
    const storage = createMemoryStorage();
    const m = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 1 });
    m.load();
    const g = newGame(CONTENT);
    m.save({ ...g, movement: { ...g.movement, position } });
    const loaded = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 2 }).load();
    if (!loaded.ok || !loaded.value) throw new Error('save did not load');
    const back = fromSave(loaded.value, CONTENT).movement.position;
    expect(CONTENT.grid.isWalkable(back.x, back.y)).toBe(true);
  });
});

describe('bank interplay with tools', () => {
  // Decision: until equipping exists, "Deposit inventory" keeps tools so the player can keep chopping.
  it('deposit inventory keeps the axe so the player can keep chopping', () => {
    const g = bankDepositAll(newGame(CONTENT), CONTENT);
    expect(countItem(g.inventory, 'bronze_axe')).toBe(1);
  });

  it('deposit inventory banks everything but tools, and says nothing is wrong when only tools are left', () => {
    const base = newGame(CONTENT);
    const added = addItem(base.inventory, CONTENT.items, 'logs', 3);
    if (!added.ok) throw new Error('inventory full');
    const g = bankDepositAll({ ...base, inventory: added.value }, CONTENT);
    expect(countItem(g.inventory, 'logs')).toBe(0);
    expect(countItem(g.inventory, 'bronze_axe')).toBe(1);
    // Exactly the logs and the starter bait (slot order is not part of the contract).
    expect(g.bank.items).toHaveLength(2);
    expect(g.bank.items).toEqual(
      expect.arrayContaining([
        { itemId: 'logs', quantity: 3 },
        { itemId: BAIT_ITEM_ID, quantity: BAIT_STACK },
      ]),
    );
    const again = bankDepositAll(g, CONTENT);
    expect(again.inventory).toBe(g.inventory);
    expect(again.chat.map((c) => c.text)).not.toContain('Your bank is full.');
  });

  it('after banking the axe (single deposit), clicking a tree gives the no-axe message and no logs', () => {
    const emptied = bankDeposit(newGame(CONTENT), CONTENT, 0, 1);
    let s = interactTree(emptied, CONTENT, TREE_SPAWNS[0]!.nodeId);
    const rng = scriptedRng([0]);
    for (let t = 1; t <= 40; t++) s = step(s, { tick: t, rng }).state;
    expect(countItem(s.inventory, 'logs')).toBe(0);
    expect(s.chat.map((c) => c.text)).toContain('You need an axe to chop this tree.');
  });
});
