import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@core/inventory';
import { scriptedRng } from '@test-utils/index';
import { CONTENT } from '@app/registry';
import {
  bankDeposit,
  bankDepositAll,
  bankWithdraw,
  closeBank,
  interactFacility,
  walkTo,
} from '@app/game/actions';
import { applyIntent } from '@app/game/intents';
import { newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';

function withLogsAndBank(): GameState {
  const g = newGame(CONTENT);
  const inv = addItem(g.inventory, CONTENT.items, 'logs', 3);
  if (!inv.ok) throw new Error('inventory full');
  return { ...g, inventory: inv.value, bank: { items: [{ itemId: 'logs', quantity: 5 }] } };
}

const chest = { type: 'openPanel', panel: 'depositPanel' };

describe('deposit chest intents', () => {
  it('depositPanel opens deposit-only, bankPanel opens the full bank', () => {
    const g = newGame(CONTENT);
    expect(g.bankMode).toBe('full');
    const d = applyIntent(g, chest);
    expect([d.bankOpen, d.bankMode]).toEqual([true, 'depositOnly']);
    const b = applyIntent(d, { type: 'openPanel', panel: 'bankPanel' });
    expect([b.bankOpen, b.bankMode]).toEqual([true, 'full']);
  });

  it('refuses withdraw in deposit-only mode with no state change', () => {
    const g = applyIntent(withLogsAndBank(), chest);
    expect(bankWithdraw(g, CONTENT, 'logs', 1)).toBe(g);
    const full = applyIntent(g, { type: 'openPanel', panel: 'bankPanel' });
    expect(countItem(bankWithdraw(full, CONTENT, 'logs', 1).inventory, 'logs')).toBe(4);
  });

  it('deposit and deposit-all still work in deposit-only mode', () => {
    const g = applyIntent(withLogsAndBank(), chest);
    const slot = g.inventory.slots.findIndex((s) => s?.itemId === 'logs');
    const one = bankDeposit(g, CONTENT, slot, 1);
    expect(countItem(one.inventory, 'logs')).toBe(2);
    expect(countItem(bankDepositAll(g, CONTENT).inventory, 'logs')).toBe(0);
  });

  it('closing or walking away resets the mode to full', () => {
    const g = applyIntent(newGame(CONTENT), chest);
    expect(closeBank(g).bankMode).toBe('full');
    expect(walkTo(g, CONTENT, { x: 1, y: 1 }).bankMode).toBe('full');
  });

  it('tapping the deposit chest walks there and opens deposit-only', () => {
    let s = interactFacility(newGame(CONTENT), CONTENT, 'deposit_chest_1');
    expect(s.pendingFacility?.kind).toBe('deposit_chest');
    const rng = scriptedRng([0]);
    for (let t = 1; t <= 300 && !s.bankOpen; t++) s = step(s, { tick: t, rng }).state;
    expect([s.bankOpen, s.bankMode]).toEqual([true, 'depositOnly']);
  });
});
