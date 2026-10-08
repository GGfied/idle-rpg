import { describe, expect, it } from 'vitest';
import { countItem } from '@core/inventory';
import { decodeSave, encodeSave } from '@core/persistence';
import { SKILLS, getLevel, xpForLevel } from '@core/progression';
import { createRng } from '@core/engine';
import { createMovementState } from '@features/movement';
import { TREE_SPAWNS } from '@features/world';
import { makeCtx, scriptedRng, withInventory } from '@test-utils/index';
import { CONTENT, SAVE_SCHEMA } from '@app/registry';
import {
  bankDeposit,
  bankDepositAll,
  bankWithdraw,
  dropSlot,
  interactFacility,
  interactTree,
  walkTo,
} from '@app/game/actions';
import { NOTHING_TO_CHOP, OUT_OF_RUN_ENERGY } from '@app/game/systems';
import { CHAT_LIMIT, addChat } from '@app/game/chat';
import { fromSave, newGame } from '@app/game/newGame';
import { facilityMenu } from '@app/game/menus';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';

const tree = TREE_SPAWNS[0]!;

/** Run ticks with an rng that always succeeds the roll (0 < any chance, then a log, then falls). */
function run(state: GameState, ticks: number, rngValues = [0]): GameState {
  const rng = scriptedRng(rngValues);
  let s = state;
  for (let t = 1; t <= ticks; t++) s = step(s, { tick: t, rng }).state;
  return s;
}

const texts = (s: GameState): string[] => s.chat.map((l) => l.text);

describe('step: click tree -> walk -> chop', () => {
  it('walks next to the tree, chops, and gets a log and xp', () => {
    let s = interactTree(newGame(CONTENT), CONTENT, tree.nodeId);
    expect(s.pendingInteraction).toEqual({ nodeId: tree.nodeId });
    s = run(s, 30);
    expect(s.pendingInteraction).toBeNull();
    expect(countItem(s.inventory, 'logs')).toBeGreaterThanOrEqual(1);
    expect(s.progression.xp.woodcutting).toBeGreaterThanOrEqual(25);
    // swing lines now come from the animator's impact (scene), not from the tick
    expect(texts(s)).not.toContain('You swing your axe at the tree.');
    expect(texts(s)).toContain('You get some logs.');
    expect(s.gathering.session).toBeNull(); // the tree fell after one log
  });

  it('adds a level-up chat line when xp crosses a level', () => {
    let s = newGame(CONTENT);
    s = { ...s, progression: { xp: { ...s.progression.xp, woodcutting: xpForLevel(2) - 1 } } };
    s = run(interactTree(s, CONTENT, tree.nodeId), 30);
    expect(getLevel(s.progression, 'woodcutting')).toBe(2);
    expect(texts(s)).toContain(
      "Congratulations, you've just advanced your Woodcutting level. You are now level 2.",
    );
  });

  it('stops with a message when the inventory is full', () => {
    const base = newGame(CONTENT);
    const full = withInventory(
      Array.from({ length: 28 }, () => ({ itemId: 'bronze_axe', quantity: 1 })),
    );
    const s = run(interactTree({ ...base, inventory: full }, CONTENT, tree.nodeId), 30);
    expect(s.gathering.session).toBeNull();
    expect(countItem(s.inventory, 'logs')).toBe(0);
    expect(texts(s)).toContain('Your inventory is too full to hold any more logs.');
  });

  it('says so when the level is too low for an oak', () => {
    const oak = TREE_SPAWNS.find((t) => t.defId === 'oak_tree')!;
    const s = run(interactTree(newGame(CONTENT), CONTENT, oak.nodeId), 60);
    expect(texts(s)).toContain('You need a Woodcutting level of 15 to chop this tree.');
    expect(s.gathering.session).toBeNull();
  });

  it('a new click cancels gathering and the pending interaction', () => {
    let s = run(interactTree(newGame(CONTENT), CONTENT, tree.nodeId), 30, [0.99]);
    expect(s.gathering.session).not.toBeNull(); // chopping, no luck yet
    s = walkTo(s, CONTENT, { x: s.movement.position.x, y: s.movement.position.y + 1 });
    expect(s.gathering.session).toBeNull();
    expect(s.pendingInteraction).toBeNull();
    const pending = interactTree(newGame(CONTENT), CONTENT, tree.nodeId);
    expect(walkTo(pending, CONTENT, { x: 18, y: 14 }).pendingInteraction).toBeNull();
  });

  it('starts at once when already adjacent', () => {
    const base = newGame(CONTENT);
    const s0 = { ...base, movement: createMovementState({ x: tree.x, y: tree.y - 1 }) };
    const s = interactTree(s0, CONTENT, tree.nodeId);
    expect(s.movement.path).toEqual([]);
    expect(run(s, 1).gathering.session).not.toBeNull();
  });

  it('re-tapping the tree being chopped keeps the session: one swing message, then a log', () => {
    const base = newGame(CONTENT);
    let s = interactTree(
      { ...base, movement: createMovementState({ x: tree.x, y: tree.y - 1 }) },
      CONTENT,
      tree.nodeId,
    );
    const rng = scriptedRng([0.99, 0.99, 0]); // two missed attempts, then success
    for (let t = 1; t <= 60 && countItem(s.inventory, 'logs') === 0; t++) {
      s = step(s, { tick: t, rng }).state;
      s = interactTree(s, CONTENT, tree.nodeId); // the player keeps tapping the tree
    }
    expect(texts(s).filter((m) => m === 'You swing your axe at the tree.')).toHaveLength(0);
    expect(countItem(s.inventory, 'logs')).toBe(1);
  });

  it('re-tapping while still walking to the tree keeps the walk', () => {
    const a = interactTree(newGame(CONTENT), CONTENT, tree.nodeId);
    expect(interactTree(a, CONTENT, tree.nodeId)).toBe(a);
  });

  it('clicking a stump says there is nothing left; the normal fall stays silent', () => {
    const base = newGame(CONTENT);
    const adjacent = { ...base, movement: createMovementState({ x: tree.x, y: tree.y - 1 }) };
    const felled = run(interactTree(adjacent, CONTENT, tree.nodeId), 10); // chops it down
    expect(texts(felled)).not.toContain(NOTHING_TO_CHOP);
    expect(texts(felled)).not.toContain('The tree falls and you stop chopping.');
    const again = run(interactTree(felled, CONTENT, tree.nodeId), 1, [0.99]);
    expect(texts(again)).toContain(NOTHING_TO_CHOP);
  });

  it('clicking a stump says so at once and does not walk to it', () => {
    const base = newGame(CONTENT);
    const adjacent = { ...base, movement: createMovementState({ x: tree.x, y: tree.y - 1 }) };
    const felled = run(interactTree(adjacent, CONTENT, tree.nodeId), 10);
    const far = { ...felled, movement: createMovementState({ x: 0, y: 0 }) };
    const s = interactTree(far, CONTENT, tree.nodeId);
    expect(texts(s)).toContain(NOTHING_TO_CHOP);
    expect(s.pendingInteraction).toBeNull();
    expect(s.movement.path).toEqual([]);
  });

  it('counts play time and uses the engine rng', () => {
    const s = step(newGame(CONTENT), { tick: 1, rng: createRng(1) }).state;
    expect(s.meta.playTimeMs).toBe(600);
    expect(step(newGame(CONTENT), makeCtx()).state.meta.playTimeMs).toBe(600);
  });
});

describe('actions and chat', () => {
  it('drops an item from a slot', () => {
    const s = dropSlot(newGame(CONTENT), CONTENT, 0);
    expect(countItem(s.inventory, 'bronze_axe')).toBe(0);
    expect(texts(s)).toContain('You drop the bronze axe.');
    expect(dropSlot(s, CONTENT, 0)).toBe(s);
  });

  it('keeps only the newest lines', () => {
    let s = newGame(CONTENT);
    for (let i = 0; i < CHAT_LIMIT + 10; i++) s = addChat(s, `line ${i}`);
    expect(s.chat).toHaveLength(CHAT_LIMIT);
    expect(s.chat[CHAT_LIMIT - 1]?.text).toBe(`line ${CHAT_LIMIT + 9}`);
    expect(addChat(s, '')).toBe(s);
  });
});

describe('real v2 save without bank/hp/prayer', () => {
  it('loads with logs, an empty bank, full hp and full prayer', () => {
    const slots = Array.from({ length: 28 }, () => null) as (unknown | null)[];
    slots[0] = { itemId: 'bronze_axe', quantity: 1 };
    for (let i = 1; i <= 4; i++) slots[i] = { itemId: 'logs', quantity: 1 }; // logs don't stack
    const xp = Object.fromEntries(SKILLS.map((k) => [k.id, 0]));
    Object.assign(xp, { hitpoints: 1154, woodcutting: 100 });
    const raw = JSON.stringify({
      version: 3,
      savedAt: 1,
      data: {
        inventory: { slots },
        progression: { xp },
        movement: { position: { x: 18, y: 15 }, running: false },
        meta: { playTimeMs: 1200 },
      },
    });
    const back = decodeSave(SAVE_SCHEMA, raw);
    if (!back.ok) throw new Error(back.error);
    const s = fromSave(back.value, CONTENT);
    expect(countItem(s.inventory, 'logs')).toBe(4);
    expect(s.progression.xp.woodcutting).toBe(100);
    expect(s.bank.items).toEqual([]);
    expect(s.hp.current).toBe(10);
    expect(s.prayer.current).toBe(1);
  });
});

describe('save round trip', () => {
  it('keeps inventory, xp, position and play time', () => {
    const s = run(interactTree(newGame(CONTENT), CONTENT, tree.nodeId), 30);
    const json = encodeSave(SAVE_SCHEMA, s, 123);
    const back = decodeSave(SAVE_SCHEMA, json);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.inventory).toEqual(s.inventory);
    expect(back.value.progression).toEqual(s.progression);
    expect(back.value.movement.position).toEqual(s.movement.position);
    expect(back.value.meta).toEqual(s.meta);
  });

  it('rejects a bad meta slice', () => {
    const s = newGame(CONTENT);
    for (const bad of [-1, Infinity, 'x']) {
      const json = JSON.parse(encodeSave(SAVE_SCHEMA, s, 1)) as { data: { meta: unknown } };
      json.data.meta = { playTimeMs: bad };
      expect(decodeSave(SAVE_SCHEMA, JSON.stringify(json)).ok).toBe(false);
    }
  });

  it('knows every skill for the skills panel', () => {
    expect(SKILLS).toHaveLength(13);
  });
});

describe('bank', () => {
  it('tapping a booth walks beside it, opens the panel, and closes when the player walks away', () => {
    let s = interactFacility(newGame(CONTENT), CONTENT, 'bank_booth_1');
    expect(s.pendingFacility).toEqual({
      kind: 'bank_booth',
      objectId: 'bank_booth_1',
      optionId: 'bank',
    });
    expect(s.bankOpen).toBe(false);
    s = run(s, 20);
    expect(s.bankOpen).toBe(true);
    expect(s.pendingFacility).toBeNull();
    expect(walkTo(s, CONTENT, { x: 18, y: 16 }).bankOpen).toBe(false);
  });

  it('the booth menu lists Bank then Examine, and the Bank option is the default tap', () => {
    const m = facilityMenu('bank_booth');
    expect(m.title).toBe('Bank booth');
    expect(m.entries.map((e) => e.label)).toEqual(['Bank Bank booth', 'Examine Bank booth']);
    const viaOption = interactFacility(newGame(CONTENT), CONTENT, 'bank_booth_2', 'bank');
    expect(viaOption.pendingFacility?.optionId).toBe('bank');
    expect(run(viaOption, 25).bankOpen).toBe(true);
  });

  it('an unknown object or option does nothing', () => {
    const g = newGame(CONTENT);
    expect(interactFacility(g, CONTENT, 'nope').pendingFacility).toBeNull();
    expect(interactFacility(g, CONTENT, 'bank_booth_1', 'nope').pendingFacility).toBeNull();
  });

  it('deposits and withdraws with chat feedback and reports errors as chat lines', () => {
    let s = newGame(CONTENT);
    s = bankDeposit(s, CONTENT, 0, 1);
    expect(countItem(s.inventory, 'bronze_axe')).toBe(0);
    expect(s.bank.items).toEqual([{ itemId: 'bronze_axe', quantity: 1 }]);
    expect(texts(s)).toContain('You deposit 1 bronze axe.');
    s = bankWithdraw(s, CONTENT, 'bronze_axe', 'all');
    expect(countItem(s.inventory, 'bronze_axe')).toBe(1);
    expect(texts(s)).toContain('You withdraw 1 bronze axe.');
    s = bankWithdraw(s, CONTENT, 'logs', 1);
    expect(texts(s)).toContain('That item is not in your bank.');
    s = bankDeposit(s, CONTENT, 7, 1);
    expect(texts(s)).toContain('There is nothing in that slot.');
    s = bankDepositAll(s, CONTENT); // tools stay: the starter tools are all that is left
    expect(s.inventory.slots.filter((x) => x !== null).map((x) => x.itemId)).toEqual([
      'bronze_axe',
      'bronze_pickaxe',
      'small_fishing_net',
      'fishing_rod',
    ]);
    expect(texts(s)).toContain('You deposit your inventory.');
  });
});

describe('step: run energy', () => {
  it('says once in chat when run energy hits 0 while running', () => {
    const g = newGame(CONTENT);
    const start = g.movement.position;
    const s0: GameState = {
      ...g,
      movement: {
        ...g.movement,
        running: true,
        runEnergy: 1,
        path: [
          { x: start.x + 1, y: start.y },
          { x: start.x + 2, y: start.y },
        ],
      },
    };
    const s = run(s0, 3);
    expect(s.movement.running).toBe(false);
    expect(texts(s).filter((t) => t === OUT_OF_RUN_ENERGY)).toHaveLength(1);
    expect(s.chat.find((l) => l.text === OUT_OF_RUN_ENERGY)?.important).toBe(true);
  });
});
