import { describe, expect, it } from 'vitest';
import { addItem } from '@core/inventory';
import { CONTENT } from '@app/registry';
import { dropSlot, swapInventorySlots, takeGroundItem } from '@app/game/actions';
import { NO_SPACE } from '@app/game/ground';
import { newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import { seededRng } from '@test-utils/index';
import type { GameState } from '@app/game/types';

const run = (g: GameState, n: number, from = 1): GameState => {
  let s = g;
  for (let i = 0; i < n; i++) s = step(s, { tick: from + i, rng: seededRng(1) }).state;
  return s;
};

describe('ground items', () => {
  it('drop puts the stack on the player tile, take walks back and picks it up', () => {
    const g0 = newGame(CONTENT);
    const item = g0.inventory.slots[0]!.itemId;
    const dropped = dropSlot(g0, CONTENT, 0);
    expect(dropped.inventory.slots[0]).toBeNull();
    expect(dropped.ground.items).toHaveLength(1);
    expect(dropped.ground.items[0]).toMatchObject({ itemId: item, ...g0.movement.position });
    const took = takeGroundItem(dropped, CONTENT, dropped.ground.items[0]!.id);
    expect(took.ground.items).toHaveLength(0);
    expect(took.inventory.slots.some((s) => s?.itemId === item)).toBe(true);
  });

  it('walks to a distant item and takes it on arrival', () => {
    const g0 = dropSlot(newGame(CONTENT), CONTENT, 0);
    const p = g0.movement.position;
    let g = { ...g0, movement: { ...g0.movement, position: { x: p.x + 3, y: p.y } } };
    g = takeGroundItem(g, CONTENT, g.ground.items[0]!.id);
    expect(g.pendingGround).not.toBeNull();
    g = run(g, 10);
    expect(g.ground.items).toHaveLength(0);
    expect(g.pendingGround).toBeNull();
  });

  it('a full inventory leaves the item on the ground with a message', () => {
    let g = dropSlot(newGame(CONTENT), CONTENT, 0);
    let inv = g.inventory;
    for (let i = 0; i < 28; i++) {
      const r = addItem(inv, CONTENT.items, 'logs', 1);
      if (r.ok) inv = r.value;
    }
    g = takeGroundItem({ ...g, inventory: inv }, CONTENT, g.ground.items[0]!.id);
    expect(g.ground.items).toHaveLength(1);
    expect(g.chat.some((l) => l.text === NO_SPACE && l.important)).toBe(true);
  });

  it('despawns after the timer', () => {
    const g = run(dropSlot(newGame(CONTENT), CONTENT, 0), 301);
    expect(g.ground.items).toHaveLength(0);
  });

  it('swaps slots', () => {
    const g = newGame(CONTENT);
    const s = swapInventorySlots(g, 0, 5);
    expect(s.inventory.slots[5]).toEqual(g.inventory.slots[0]);
    expect(swapInventorySlots(g, 2, 2)).toBe(g);
  });
});
