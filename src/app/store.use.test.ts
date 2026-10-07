import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import { createAppStore } from '@app/store';

const make = () => createAppStore(newGame(CONTENT));
const lastText = (s: ReturnType<typeof make>) => s.getState().game.chat.at(-1)?.text;

describe('Use selection', () => {
  it('select, use on an object says nothing happens and clears', () => {
    const s = make();
    s.getState().useItem(0);
    expect(s.getState().useSelection?.slot).toBe(0);
    s.getState().useItemOn({ kind: 'object', id: 'x' });
    expect(lastText(s)).toBe('Nothing interesting happens.');
    expect(s.getState().useSelection).toBeNull();
  });
  it('cancel, same-item tap, drop and swap clear it', () => {
    const s = make();
    s.getState().useItem(0);
    s.getState().cancelUse();
    expect(s.getState().useSelection).toBeNull();
    s.getState().useItem(0);
    s.getState().useItemOn({ kind: 'item', slot: 0 });
    expect(s.getState().useSelection).toBeNull();
    s.getState().useItem(0);
    s.getState().swapInventorySlots(0, 3);
    expect(s.getState().useSelection).toBeNull();
    s.getState().useItem(3);
    s.getState().dropSlot(3);
    expect(s.getState().useSelection).toBeNull();
  });
  it('an empty slot selects nothing', () => {
    const s = make();
    s.getState().useItem(20);
    expect(s.getState().useSelection).toBeNull();
  });
});
