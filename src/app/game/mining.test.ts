import { describe, expect, it } from 'vitest';
import { countItem } from '@core/inventory';
import { createMovementState } from '@features/movement';
import { WORLD_ROCKS } from '@features/world';
import { scriptedRng, withInventory } from '@test-utils/index';
import { CONTENT } from '@app/registry';
import { interactTree } from '@app/game/actions';
import { newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';
import type { AppEvent } from '@app/registry';

const rock = WORLD_ROCKS.find((r) => r.defId === 'copper_rock')!;
const texts = (s: GameState): string[] => s.chat.map((l) => l.text);

function run(state: GameState, ticks: number): { state: GameState; events: AppEvent[] } {
  const rng = scriptedRng([0]);
  let s = state;
  const events: AppEvent[] = [];
  for (let t = 1; t <= ticks; t++) {
    const r = step(s, { tick: t, rng });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const beside = (s: GameState): GameState => ({
  ...s,
  movement: createMovementState({ x: rock.x, y: rock.y + 1 }),
});

describe('mining a rock', () => {
  it('starts with a bronze pickaxe', () => {
    expect(countItem(newGame(CONTENT).inventory, 'bronze_pickaxe')).toBe(1);
  });

  it('click rock -> ore + mining xp + chat, then the rock empties with the mining skill on the event', () => {
    const s0 = interactTree(beside(newGame(CONTENT)), CONTENT, rock.nodeId);
    expect(s0.pendingInteraction).toEqual({ nodeId: rock.nodeId });
    const { state, events } = run(s0, 20);
    expect(countItem(state.inventory, 'copper_ore')).toBe(1);
    expect(state.progression.xp.mining).toBeGreaterThanOrEqual(17);
    expect(texts(state)).toContain('You mine some copper ore.');
    const depleted = events.find((e) => e.type === 'nodeDepleted');
    expect(depleted).toMatchObject({ nodeId: rock.nodeId, skill: 'mining' });
    expect(events.find((e) => e.type === 'itemGathered')).toMatchObject({ skill: 'mining' });
  });

  it('a tree depletion event carries woodcutting, not mining', () => {
    const tree = [...CONTENT.trees.values()][0]!;
    const base = newGame(CONTENT);
    const s0 = interactTree(
      { ...base, movement: createMovementState({ x: tree.x, y: tree.y - 1 }) },
      CONTENT,
      tree.nodeId,
    );
    const { events } = run(s0, 20);
    expect(events.find((e) => e.type === 'nodeDepleted')).toMatchObject({ skill: 'woodcutting' });
    // runtime fans these same step events out to audio and vfx: the log must carry its skill too
    expect(events.find((e) => e.type === 'itemGathered')).toMatchObject({ skill: 'woodcutting' });
  });

  it('says the level is too low for iron, and that a pickaxe is needed', () => {
    const iron = WORLD_ROCKS.find((r) => r.defId === 'iron_rock')!;
    const near = {
      ...newGame(CONTENT),
      movement: createMovementState({ x: iron.x, y: iron.y + 1 }),
    };
    const low = run(interactTree(near, CONTENT, iron.nodeId), 3).state;
    expect(texts(low)).toContain('You need a Mining level of 15 to mine this rock.');
    const noPick = { ...beside(newGame(CONTENT)), inventory: withInventory([]) };
    const s = run(interactTree(noPick, CONTENT, rock.nodeId), 3).state;
    expect(texts(s)).toContain('You need a pickaxe to mine this rock.');
  });

  it('clicking an empty rock says so at once', () => {
    const emptied = run(interactTree(beside(newGame(CONTENT)), CONTENT, rock.nodeId), 5).state;
    expect(countItem(emptied.inventory, 'copper_ore')).toBe(1); // mined, not yet respawned
    expect(texts(interactTree(emptied, CONTENT, rock.nodeId))).toContain(
      'There is no ore left in this rock.',
    );
  });
});
