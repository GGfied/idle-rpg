import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import { progressChanged } from '@app/game/saveTrigger';
import type { GameState } from '@app/game/types';

const base = newGame(CONTENT);
const move = (g: GameState, m: Partial<GameState['movement']>): GameState => ({
  ...g,
  movement: { ...g.movement, ...m },
});

describe('progressChanged', () => {
  it('is false for an unchanged game', () => {
    expect(progressChanged(base, { ...base })).toBe(false);
  });

  it('is true for hp and coarse run energy, false for fine run energy', () => {
    expect(
      progressChanged(base, { ...base, hp: { ...base.hp, current: base.hp.current - 1 } }),
    ).toBe(true);
    const a = move(base, { runEnergy: 5500 });
    expect(progressChanged(a, move(a, { runEnergy: 5050 }))).toBe(false);
    expect(progressChanged(a, move(a, { runEnergy: 3900 }))).toBe(true);
  });

  it('is true when a walk ends, false for each step along the way', () => {
    const p = base.movement.position;
    const walking = move(base, {
      path: [
        { x: p.x + 1, y: p.y },
        { x: p.x + 2, y: p.y },
      ],
    });
    const step1 = move(walking, {
      position: { x: p.x + 1, y: p.y },
      path: [{ x: p.x + 2, y: p.y }],
    });
    const arrived = move(step1, { position: { x: p.x + 2, y: p.y }, path: [] });
    expect(progressChanged(walking, step1)).toBe(false);
    expect(progressChanged(step1, arrived)).toBe(true);
  });

  it('is true when the player jumps while standing still', () => {
    const p = base.movement.position;
    expect(progressChanged(base, move(base, { position: { x: p.x + 5, y: p.y } }))).toBe(true);
  });
});
