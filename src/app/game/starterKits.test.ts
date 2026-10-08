import { describe, expect, it } from 'vitest';
import { addItem, bankCount, countItem, createBank, createInventory } from '@core/inventory';
import { decodeSave, encodeSave } from '@core/persistence';
import { CONTENT, SAVE_SCHEMA } from '@app/registry';
import { fromSave, newGame } from '@app/game/newGame';
import { applyStarterKits } from '@app/game/starterKits';
import { playTimeSystem } from '@app/game/systems';
import type { GameState, SavedGame } from '@app/game/types';

/** The user's existing save: only the axe, no mining/fishing kit. */
function oldSave(): SavedGame {
  const g = newGame(CONTENT);
  return {
    ...g,
    inventory: {
      ...createInventory(),
      slots: [{ itemId: 'bronze_axe', quantity: 1 }, ...createInventory().slots.slice(1)],
    },
  };
}

describe('starter kits for existing saves', () => {
  it('an old save gets the pickaxe, net, rod and bait once', () => {
    const g = fromSave(oldSave(), CONTENT);
    expect(countItem(g.inventory, 'bronze_pickaxe')).toBe(1);
    expect(countItem(g.inventory, 'small_fishing_net')).toBe(1);
    expect(countItem(g.inventory, 'fishing_bait')).toBe(500);
    expect(applyStarterKits(g, CONTENT)).toBe(g); // idempotent
  });

  it('survives the real save round trip without a second grant', () => {
    const g = fromSave(oldSave(), CONTENT);
    const back = decodeSave(SAVE_SCHEMA, encodeSave(SAVE_SCHEMA, g, 1));
    if (!back.ok) throw new Error(back.error);
    const again = fromSave(back.value, CONTENT);
    expect(countItem(again.inventory, 'bronze_pickaxe')).toBe(1);
  });

  it('does not re-grant a pickaxe the player banked, or to a trained skill', () => {
    const base = fromSave(oldSave(), CONTENT);
    const banked: GameState = {
      ...oldSave2(),
      bank: createBank([{ itemId: 'bronze_pickaxe', quantity: 1 }]),
    };
    expect(bankCount(banked.bank, 'bronze_pickaxe')).toBe(1);
    expect(countItem(applyStarterKits(banked, CONTENT).inventory, 'bronze_pickaxe')).toBe(0);
    const trained: GameState = {
      ...oldSave2(),
      progression: { xp: { ...base.progression.xp, mining: 500 } },
    };
    expect(countItem(applyStarterKits(trained, CONTENT).inventory, 'bronze_pickaxe')).toBe(0);
  });
});

function oldSave2(): GameState {
  return { ...newGame(CONTENT), ...oldSave() };
}

describe('bait 500 one-time top-up', () => {
  const withBait = (n: number, grants?: string[]): GameState => {
    const g = oldSave2();
    // oldSave2 spreads newGame (500 bait) under the axe-only save: the axe-only inventory wins.
    // The old save already had its (50-bait) kit tools, so only the top-up applies.
    let inv = addItem(g.inventory, CONTENT.items, 'small_fishing_net', 1);
    if (inv.ok && n > 0) inv = addItem(inv.value, CONTENT.items, 'fishing_bait', n);
    if (!inv.ok) throw new Error('inv');
    return { ...g, inventory: inv.value, meta: { ...g.meta, grants } };
  };
  const bait = (g: GameState) => countItem(g.inventory, 'fishing_bait');

  it('a new game gets 500 and is marked', () => {
    const g = newGame(CONTENT);
    expect(bait(g)).toBe(500);
    expect(g.meta.grants).toContain('fishing_bait_500');
  });

  it('an old save holding 50 is topped up to exactly 500, once, across a reload', () => {
    const topped = fromSave(withBait(50), CONTENT);
    expect(bait(topped)).toBe(500);
    const back = decodeSave(SAVE_SCHEMA, encodeSave(SAVE_SCHEMA, topped, 1));
    if (!back.ok) throw new Error(back.error);
    const spent = { ...back.value, inventory: withBait(10).inventory };
    expect(bait(fromSave(spent, CONTENT))).toBe(10); // marker survived, no second top-up
  });

  it('counts bait in the bank and gives nothing to a save holding 600', () => {
    expect(bait(applyStarterKits(withBait(600), CONTENT))).toBe(600);
    const banked = {
      ...withBait(0),
      bank: createBank([{ itemId: 'fishing_bait', quantity: 480 }]),
    };
    expect(bait(applyStarterKits(banked, CONTENT))).toBe(20);
  });

  it('the play-time tick keeps the marker', () => {
    const g = newGame(CONTENT);
    const ctx = {} as Parameters<typeof playTimeSystem>[1];
    expect(playTimeSystem(g, ctx).state.meta.grants).toEqual(g.meta.grants);
  });
});
