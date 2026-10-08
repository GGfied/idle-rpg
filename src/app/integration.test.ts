import { describe, expect, it } from 'vitest';
import { countItem } from '@core/inventory';
import { CORRUPT_KEY, SAVE_KEY, createMemoryStorage, createSaveManager } from '@core/persistence';
import { SKILLS, getLevel, isSkillId } from '@core/progression';
import { isDepleted } from '@core/skills';
import { STARTING_ITEMS, WOODCUTTING_NODES } from '@features/skills/woodcutting';
import { FISHING_SPOTS, TREE_SPAWNS } from '@features/world';
import { contentRefs, runTicks, scriptedRng, seededRng } from '@test-utils/index';
import { CONTENT, NODE_EXAMINE, SAVE_SCHEMA } from '@app/registry';
import { dropSlot, examineTree, interactTree } from '@app/game/actions';
import { fromSave, newGame } from '@app/game/newGame';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';

const texts = (s: GameState): string[] => s.chat.map((l) => l.text);
const tree1 = TREE_SPAWNS.find((t) => t.nodeId === 'tree_1')!;
const oak = TREE_SPAWNS.find((t) => t.defId === 'oak_tree')!;

describe('content references across modules', () => {
  it('every item id used by gather yields, tools and starting items is registered', () => {
    const errors = contentRefs(CONTENT.items, {
      'gather yields': WOODCUTTING_NODES.flatMap((d) => d.yields.map((y) => y.value.itemId)),
      'tool ids': CONTENT.tools.all().map(([id]) => id),
      'starting items': STARTING_ITEMS.map((s) => s.itemId),
    });
    expect(errors).toEqual([]);
  });

  it('contentRefs reports an unknown id', () => {
    expect(contentRefs(CONTENT.items, { x: ['logs', 'nope'] })).toEqual(['x: unknown item "nope"']);
  });

  it.each(TREE_SPAWNS.map((t) => [t.nodeId, t.defId] as const))(
    'spawn %s (%s) has a GatherDef and examine text',
    (_nodeId, defId) => {
      expect(CONTENT.gatherDefs.has(defId)).toBe(true);
      expect(NODE_EXAMINE[defId]).toBeTruthy();
    },
  );

  it.each([...CONTENT.gatherDefs.keys(), ...FISHING_SPOTS.map((f) => f.defId)])(
    'node kind %s has its own examine text',
    (defId) => {
      expect(NODE_EXAMINE[defId]).toBeTruthy();
    },
  );

  it('examine fallback is not tree-specific', () => {
    const g = examineTree(newGame(CONTENT), CONTENT, 'no_such_node');
    expect(texts(g).join(' ')).not.toMatch(/tree/i);
  });

  it.each(WOODCUTTING_NODES.map((d) => [d.id, d.skill] as const))(
    'GatherDef %s skill "%s" is a SkillId',
    (_id, skill) => {
      expect(isSkillId(skill)).toBe(true);
      expect(SKILLS.some((s) => s.id === skill)).toBe(true);
    },
  );

  it('node ids are unique and spawn tiles are blocked (stumps still block)', () => {
    expect(new Set(TREE_SPAWNS.map((t) => t.nodeId)).size).toBe(TREE_SPAWNS.length);
    for (const t of TREE_SPAWNS) expect(CONTENT.grid.isWalkable(t.x, t.y)).toBe(false);
  });
});

describe('save round trip through the real schema and storage', () => {
  function played(): GameState {
    const rng = seededRng(7);
    let s = interactTree(newGame(CONTENT), CONTENT, tree1.nodeId);
    s = runTicks(s, step, 40, rng).state;
    return s;
  }

  it('save -> reload keeps inventory, xp, position, play time; transient state resets', () => {
    const storage = createMemoryStorage();
    const m1 = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 1 });
    expect(m1.load()).toEqual({ ok: true, value: null });
    const s = played();
    expect(countItem(s.inventory, 'logs')).toBeGreaterThan(0);
    expect(m1.save(s).ok).toBe(true);

    const m2 = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 2 });
    const loaded = m2.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) throw new Error('no save');
    const back = fromSave(loaded.value, CONTENT);
    expect(back.inventory).toEqual(s.inventory);
    expect(back.progression).toEqual(s.progression);
    expect(back.movement.position).toEqual(s.movement.position);
    expect(back.meta).toEqual(s.meta);
    expect(back.gathering.session).toBeNull();
    expect(back.pendingInteraction).toBeNull();
  });

  it.each([
    ['not json', '{{{'],
    ['wrong shape', '[]'],
    ['future version', JSON.stringify({ version: 999, savedAt: 1, data: {} })],
    ['missing slices', JSON.stringify({ version: 1, savedAt: 1, data: {} })],
  ])('corrupt save (%s) is rejected, kept as backup, and not overwritten', (_n, raw) => {
    const storage = createMemoryStorage();
    storage.set(SAVE_KEY, raw);
    const m = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 1 });
    expect(m.load().ok).toBe(false);
    expect(storage.get(CORRUPT_KEY)).toEqual({ ok: true, value: raw });
    expect(m.save(newGame(CONTENT)).ok).toBe(false);
    expect(storage.get(SAVE_KEY)).toEqual({ ok: true, value: raw });
  });

  it('a saved unknown item id is rejected on load', () => {
    const storage = createMemoryStorage();
    const m = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 1 });
    m.load();
    m.save(newGame(CONTENT));
    const raw = storage.get(SAVE_KEY);
    if (!raw.ok || raw.value === null) throw new Error('no save');
    storage.set(SAVE_KEY, raw.value.replace('bronze_axe', 'ghost_item'));
    const m2 = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => 2 });
    expect(m2.load().ok).toBe(false);
  });
});

describe('scripted game', () => {
  /** Click tree_1 whenever idle and standing, else just tick; stops once `done` is true. */
  function play(
    start: GameState,
    tick0: number,
    done: (s: GameState) => boolean,
    rng = seededRng(42),
    maxTicks = 3000,
  ): { s: GameState; tick: number } {
    let s = start;
    let tick = tick0;
    for (let i = 0; i < maxTicks && !done(s); i++) {
      const node = s.gathering.nodes[tree1.nodeId];
      const busy = s.gathering.session !== null || s.pendingInteraction !== null;
      if (!busy && !(node && isDepleted(node))) s = interactTree(s, CONTENT, tree1.nodeId);
      s = step(s, { tick: tick++, rng }).state;
    }
    return { s, tick };
  }

  it('chops to a full inventory, stops with a message, resumes after dropping a log', () => {
    const rng = seededRng(42);
    // 22 logs + the axe, pickaxe, net, rod, bait and tinderbox (starter kits) fill all 28 slots.
    let r = play(newGame(CONTENT), 1, (s) => countItem(s.inventory, 'logs') === 22, rng);
    expect(countItem(r.s.inventory, 'logs')).toBe(22);
    expect(countItem(r.s.inventory, 'bronze_axe')).toBe(1);
    expect(r.s.inventory.slots.every((x) => x !== null)).toBe(true);
    expect(getLevel(r.s.progression, 'woodcutting')).toBeGreaterThan(1);

    // Next click: tree is chopped until the roll succeeds, then it stops without losing anything.
    r = play(
      r.s,
      r.tick,
      (s) => texts(s).includes('Your inventory is too full to hold any more logs.'),
      rng,
    );
    expect(texts(r.s)).toContain('Your inventory is too full to hold any more logs.');
    expect(r.s.gathering.session).toBeNull();
    expect(countItem(r.s.inventory, 'logs')).toBe(22);

    // Drop one log (slot 0 is the axe, slot 1 the first log) and resume.
    const slot = r.s.inventory.slots.findIndex((x) => x?.itemId === 'logs');
    const dropped = dropSlot(r.s, CONTENT, slot);
    expect(countItem(dropped.inventory, 'logs')).toBe(21);
    expect(texts(dropped)).toContain('You drop the logs.');
    const after = play(dropped, r.tick, (s) => countItem(s.inventory, 'logs') === 22, rng);
    expect(countItem(after.s.inventory, 'logs')).toBe(22);
  });

  it('dropping the axe while chopping stops with the no-axe message', () => {
    const rng = scriptedRng([0.99]); // never succeeds, keeps the session alive
    let s = interactTree(newGame(CONTENT), CONTENT, tree1.nodeId);
    s = runTicks(s, step, 30, rng).state;
    expect(s.gathering.session).not.toBeNull();
    s = dropSlot(s, CONTENT, 0);
    s = runTicks(s, step, 1, rng, 31).state;
    expect(s.gathering.session).toBeNull();
    expect(texts(s)).toContain('You need an axe to chop this tree.');
  });

  it('an oak at level 1 gives the level-too-low message and no logs', () => {
    const s = runTicks(
      interactTree(newGame(CONTENT), CONTENT, oak.nodeId),
      step,
      60,
      scriptedRng([0]),
    ).state;
    expect(texts(s)).toContain('You need a Woodcutting level of 15 to chop this tree.');
    expect(countItem(s.inventory, 'oak_logs')).toBe(0);
    expect(s.gathering.session).toBeNull();
  });

  it('a felled tree respawns after exactly 12 ticks and can be chopped again', () => {
    const rng = scriptedRng([0]);
    let s = interactTree(newGame(CONTENT), CONTENT, tree1.nodeId);
    let tick = 1;
    while (!s.gathering.nodes[tree1.nodeId] && tick < 100) s = step(s, { tick: tick++, rng }).state;
    const fellAt = tick - 1;
    expect(countItem(s.inventory, 'logs')).toBe(1);
    expect(isDepleted(s.gathering.nodes[tree1.nodeId]!)).toBe(true);

    // Still a stump one tick before respawn; clicking it does not give logs.
    s = runTicks(s, step, 11 - 1, rng, fellAt + 1).state; // ticks fellAt+1 .. fellAt+10
    s = runTicks(s, step, 1, rng, fellAt + 11).state;
    expect(s.gathering.nodes[tree1.nodeId]).toBeDefined();
    s = runTicks(s, step, 1, rng, fellAt + 12).state;
    expect(s.gathering.nodes[tree1.nodeId]).toBeUndefined();

    s = interactTree(s, CONTENT, tree1.nodeId);
    s = runTicks(s, step, 20, rng, fellAt + 13).state;
    expect(countItem(s.inventory, 'logs')).toBe(2);
  });

  it('clicking a stump yields no logs', () => {
    const rng = scriptedRng([0]);
    let s = interactTree(newGame(CONTENT), CONTENT, tree1.nodeId);
    let tick = 1;
    while (!s.gathering.nodes[tree1.nodeId] && tick < 100) s = step(s, { tick: tick++, rng }).state;
    s = interactTree(s, CONTENT, tree1.nodeId);
    s = runTicks(s, step, 3, rng, tick).state; // well before respawn
    expect(countItem(s.inventory, 'logs')).toBe(1);
    expect(s.gathering.session).toBeNull();
    expect(s.pendingInteraction).toBeNull();
  });
});
