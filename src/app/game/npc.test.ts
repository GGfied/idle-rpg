import { describe, expect, it } from 'vitest';
import { currentView } from '@features/story';
import { scriptedRng } from '@test-utils/index';
import { CONTENT } from '@app/registry';
import { createAppStore } from '@app/store';
import { examineNpc, interactNpc, walkTo } from '@app/game/actions';
import { advanceTalk } from '@app/game/dialogue';
import { applyIntent } from '@app/game/intents';
import { facilityMenu, npcMenu } from '@app/game/menus';
import { newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';

function run(state: GameState, ticks: number): GameState {
  const rng = scriptedRng([0]);
  let s = state;
  for (let t = 1; t <= ticks; t++) s = step(s, { tick: t, rng }).state;
  return s;
}

describe('npcs in content', () => {
  it('both bankers exist and their tiles block walking', () => {
    expect([...CONTENT.npcs.keys()]).toEqual(['banker_1', 'banker_2']);
    expect(CONTENT.grid.isWalkable(12, 8)).toBe(false);
  });
});

describe('talk -> dialogue -> bank', () => {
  it('walks across the counter, opens the dialogue, and "access my bank" opens the bank', () => {
    let s = interactNpc(newGame(CONTENT), CONTENT, 'banker_1');
    expect(s.pendingNpc).toEqual({ spawnId: 'banker_1', optionId: 'talk_to' });
    s = run(s, 30);
    expect(s.pendingNpc).toBeNull();
    expect(s.talk?.spawnId).toBe('banker_1');
    expect(currentView(s.talk!.dialogue)?.text).toContain('Welcome to Willowbrook Bank');
    s = advanceTalk(s, CONTENT); // say -> choice
    expect(currentView(s.talk!.dialogue)?.choices).toHaveLength(3);
    s = advanceTalk(s, CONTENT, 1); // "What is this place?"
    s = advanceTalk(s, CONTENT); // back to the menu
    expect(s.bankOpen).toBe(false);
    s = advanceTalk(s, CONTENT, 0); // access my bank
    expect(s.bankOpen).toBe(true);
    expect(s.talk).toBeNull();
  });

  it('the Bank option opens the bank directly without a dialogue', () => {
    const s = run(interactNpc(newGame(CONTENT), CONTENT, 'banker_2', 'bank'), 30);
    expect(s.bankOpen).toBe(true);
    expect(s.talk).toBeNull();
  });

  it('a new click closes the dialogue, and so does Nothing, thanks', () => {
    let s = run(interactNpc(newGame(CONTENT), CONTENT, 'banker_1'), 30);
    expect(s.talk).not.toBeNull();
    expect(walkTo(s, CONTENT, { x: 18, y: 16 }).talk).toBeNull();
    s = advanceTalk(advanceTalk(s, CONTENT), CONTENT, 2);
    expect(s.talk).toBeNull();
    expect(s.bankOpen).toBe(false);
  });

  it('closes the dialogue when the player is moved out of reach', () => {
    const s = run(interactNpc(newGame(CONTENT), CONTENT, 'banker_1'), 30);
    const away = { ...s, movement: { ...s.movement, position: { x: 18, y: 15 } } };
    expect(run(away, 1).talk).toBeNull();
  });

  it('an unknown spawn or option does nothing; examine says the npc text', () => {
    const g = newGame(CONTENT);
    expect(interactNpc(g, CONTENT, 'nobody').pendingNpc).toBeNull();
    expect(interactNpc(g, CONTENT, 'banker_1', 'nope').pendingNpc).toBeNull();
    expect(examineNpc(g, CONTENT, 'banker_1').chat.at(-1)?.text).toContain('calm clerk');
  });
});

describe('store: dialogue mirror and actions', () => {
  it('interactNpc then ticking exposes dialogue; advance and close update it', () => {
    const store = createAppStore(newGame(CONTENT));
    store.getState().interactNpc('banker_1');
    store.getState().setGame(run(store.getState().game, 30));
    expect(store.getState().dialogue).not.toBeNull();
    store.getState().advanceDialogue();
    store.getState().advanceDialogue(0);
    expect(store.getState().game.bankOpen).toBe(true);
    expect(store.getState().dialogue).toBeNull();
    store.getState().interactNpc('banker_1');
    store.getState().setGame(run(store.getState().game, 30));
    store.getState().closeDialogue();
    expect(store.getState().dialogue).toBeNull();
  });
});

describe('intents and menus', () => {
  it('openPanel bankPanel opens the bank; an unwired intent says so instead of failing silently', () => {
    const g = newGame(CONTENT);
    expect(applyIntent(g, { type: 'openPanel', panel: 'bankPanel' }).bankOpen).toBe(true);
    const r = applyIntent(g, { type: 'startRecipe', recipeGroup: 'x' });
    expect(r.bankOpen).toBe(false);
    expect(r.chat.at(-1)?.text).toBe('Nothing interesting happens.');
  });
  it('menus list the options, then Examine', () => {
    expect(npcMenu('banker').entries.map((e) => e.label)).toEqual([
      'Talk-to Banker',
      'Bank Banker',
      'Examine Banker',
    ]);
    expect(facilityMenu('bank_booth').entries[0]?.optionId).toBe('bank');
  });
});
