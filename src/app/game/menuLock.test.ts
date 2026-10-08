import { describe, expect, it, vi } from 'vitest';
import { addXp, xpForLevel } from '@core/progression';
import { CONTENT } from '@app/registry';
import { lockableOption, lockedReason } from '@app/game/menuLock';
import { newGame } from '@app/game/newGame';
import type { GameState } from '@app/game/types';

const at = (skill: 'fishing' | 'mining', level: number): GameState => {
  const g = newGame(CONTENT);
  return {
    ...g,
    progression: addXp(g.progression, skill, xpForLevel(level)).state,
  };
};
const node = (defId: string) => ({ kind: 'node' as const, defId });
const spot = (defId: string) => ({ kind: 'spot' as const, defId });

describe('lockedReason', () => {
  it('bait spot: locked at Fishing 1 with the exact text, open at 5', () => {
    expect(lockedReason(newGame(CONTENT), CONTENT, spot('bait_spot'))).toBe(
      'Requires Fishing 5 (you: 1)',
    );
    expect(lockedReason(at('fishing', 5), CONTENT, spot('bait_spot'))).toBeUndefined();
  });
  it('net spot is open at level 1', () => {
    expect(lockedReason(newGame(CONTENT), CONTENT, spot('net_spot'))).toBeUndefined();
  });
  it('iron rock at Mining 1 names Mining 15', () => {
    expect(lockedReason(newGame(CONTENT), CONTENT, node('iron_rock'))).toBe(
      'Requires Mining 15 (you: 1)',
    );
  });
  it('coal at 29 is locked, at 30 open', () => {
    expect(lockedReason(at('mining', 29), CONTENT, node('coal_rock'))).toBe(
      'Requires Mining 30 (you: 29)',
    );
    expect(lockedReason(at('mining', 30), CONTENT, node('coal_rock'))).toBeUndefined();
  });
  it('trees: level-1 tree is open', () => {
    expect(lockedReason(newGame(CONTENT), CONTENT, node('tree'))).toBeUndefined();
  });
});

describe('lockableOption', () => {
  it('locked: shows the reason, selecting says it and runs nothing', () => {
    const run = vi.fn();
    const say = vi.fn();
    const o = lockableOption(
      { label: 'Mine Rock', onSelect: run },
      'Requires Mining 15 (you: 1)',
      say,
    );
    expect(o.locked).toBe('Requires Mining 15 (you: 1)');
    o.onSelect();
    expect(say).toHaveBeenCalledWith('Requires Mining 15 (you: 1)');
    expect(run).not.toHaveBeenCalled();
  });
  it('unlocked: the option is returned unchanged', () => {
    const opt = { label: 'Mine Rock', onSelect: vi.fn() };
    expect(lockableOption(opt, undefined, vi.fn())).toBe(opt);
  });
});
