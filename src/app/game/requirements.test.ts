import { afterEach, describe, expect, it } from 'vitest';
import { currentView, DIALOGUES } from '@features/story';
import type { DialogueDef } from '@features/story';
import { addXp, xpForLevel } from '@core/progression';
import { addItem } from '@core/inventory';
import type { ItemRegistry } from '@core/items';
import { CONTENT } from '@app/registry';
import { startTalk } from '@app/game/dialogue';
import { newGame } from '@app/game/newGame';
import { evaluate, meets } from '@app/game/requirements';
import type { GameState } from '@app/game/types';

const gate = (req: object): DialogueDef =>
  ({
    id: 'req_gate',
    start: 'menu',
    nodes: {
      menu: { type: 'choice', options: [{ text: 'Go', next: 'bye', requirement: req }] },
      bye: { type: 'end' },
    },
  }) as unknown as DialogueDef;

const atLevel = (g: GameState, level: number): GameState => ({
  ...g,
  progression: addXp(g.progression, 'woodcutting', xpForLevel(level)).state,
});

const choice = (g: GameState) => currentView(g.talk!.dialogue)?.choices[0];

afterEach(() => {
  const i = DIALOGUES.findIndex((d) => d.id === 'req_gate');
  if (i >= 0) DIALOGUES.splice(i, 1);
});

describe('requirement context from game state', () => {
  const skill = { type: 'skillLevel', skill: 'woodcutting', level: 15 } as const;

  it('locked choice shows the real level', () => {
    DIALOGUES.push(gate(skill));
    const g = startTalk(newGame(CONTENT), 's', 'req_gate', undefined, CONTENT.items);
    expect(choice(g)).toEqual({
      text: 'Go',
      locked: true,
      requirementText: 'Requires Woodcutting 15 (you: 1)',
    });
  });

  it('unlocks at level 15', () => {
    DIALOGUES.push(gate(skill));
    const g = startTalk(atLevel(newGame(CONTENT), 15), 's', 'req_gate', undefined, CONTENT.items);
    expect(choice(g)).toEqual({ text: 'Go', locked: false });
  });

  it('item requirements use the item display name and the bag count', () => {
    const req = { type: 'item', itemId: 'oak_logs', count: 3 } as const;
    const g = newGame(CONTENT);
    expect(evaluate(g, req, CONTENT.items).text).toContain('Oak logs');
    const named = { get: () => ({ name: 'Mighty timber' }) } as unknown as ItemRegistry;
    expect(evaluate(g, req, named).text).toContain('Mighty timber');
    expect(evaluate(g, req, CONTENT.items).current).toBe(0);
    const r = addItem(g.inventory, CONTENT.items, 'oak_logs', 3);
    if (!r.ok) throw new Error('add failed');
    expect(meets({ ...g, inventory: r.value }, req)).toBe(true);
  });

  it('unknown skills and quests are never met', () => {
    const g = newGame(CONTENT);
    expect(meets(g, { type: 'skillLevel', skill: 'nope', level: 1 } as never)).toBe(false);
    expect(meets(g, { type: 'quest', questId: 'q' } as never)).toBe(false);
  });
});
