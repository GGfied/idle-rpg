import { describe, expect, it } from 'vitest';
import { scriptedRng } from '@test-utils/index';
import { bestTool, createToolRegistry } from '@core/equipment';
import { checkItemRefs, createItemRegistry } from '@core/items';
import { createGatheringState, startGather, successChance, tickGathering } from '@core/skills';
import type { GatherEnv, GatheringState } from '@core/skills';
import {
  MINING_ITEMS,
  MINING_MESSAGES,
  MINING_NODES,
  MINING_STARTING_ITEMS,
  MINING_TOOLS,
  getRockDef,
  levelTooLowMessage,
} from './index';

const items = createItemRegistry(MINING_ITEMS);
const tools = createToolRegistry(MINING_TOOLS);

describe('data validity', () => {
  it('node ids are the world spawn defIds, in tier order', () => {
    expect(MINING_NODES.map((d) => d.id)).toEqual([
      'copper_rock',
      'tin_rock',
      'iron_rock',
      'coal_rock',
    ]);
  });

  it('all item refs resolve (yields, tools, starting items)', () => {
    const ids = [
      ...MINING_NODES.flatMap((d) => d.yields.map((y) => y.value.itemId)),
      ...tools.itemIds(),
      ...MINING_STARTING_ITEMS.map((s) => s.itemId),
    ];
    expect(checkItemRefs(items, ids, 'mining').ok).toBe(true);
  });

  it('tools are mining pickaxes; nodes are mining pickaxe nodes that deplete every ore', () => {
    for (const [, def] of tools.all())
      expect(def).toMatchObject({ kind: 'pickaxe', skill: 'mining' });
    for (const d of MINING_NODES) {
      expect(d).toMatchObject({ skill: 'mining', toolKind: 'pickaxe', depleteChance: 1 });
      expect(d.respawnTicks).toBeGreaterThan(0);
    }
  });

  it('messages cover every stop reason and every ore', () => {
    expect(Object.keys(MINING_MESSAGES.stopped).sort()).toEqual(
      ['cancelled', 'depleted', 'inventoryFull', 'levelTooLow', 'noTool'].sort(),
    );
    expect(Object.keys(MINING_MESSAGES.gathered).sort()).toEqual(
      MINING_NODES.flatMap((d) => d.yields.map((y) => y.value.itemId)).sort(),
    );
    expect(levelTooLowMessage('iron_rock')).toBe(
      'You need a Mining level of 15 to mine this rock.',
    );
    expect(levelTooLowMessage('coal_rock')).toBe(
      'You need a Mining level of 30 to mine this rock.',
    );
    expect(levelTooLowMessage('nope')).toBeNull();
  });
});

describe('pickaxe selection', () => {
  const pick = (owned: string[], level: number) =>
    bestTool(tools, 'pickaxe', owned, () => level)?.itemId ?? null;
  it.each([
    [['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 99, 'steel_pickaxe'],
    [['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 20, 'steel_pickaxe'],
    [['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 19, 'iron_pickaxe'],
    [['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 10, 'iron_pickaxe'],
    [['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 9, 'bronze_pickaxe'],
    [['bronze_pickaxe', 'iron_pickaxe'], 9, 'bronze_pickaxe'],
    [['bronze_pickaxe'], 1, 'bronze_pickaxe'],
    [['iron_pickaxe'], 1, null],
    [['copper_ore'], 99, null],
  ])('owned %j at level %i -> %s', (owned, level, want) => {
    expect(pick(owned, level)).toBe(want);
  });
});

describe('success by level and tier', () => {
  it('success rises with level for every rock', () => {
    for (const d of MINING_NODES) {
      expect(successChance(99, d.successLow, d.successHigh)).toBeGreaterThan(
        successChance(1, d.successLow, d.successHigh),
      );
    }
  });

  it('pinned level-1 and level-99 rates for copper', () => {
    const c = getRockDef('copper_rock')!;
    expect(successChance(1, c.successLow, c.successHigh)).toBeCloseTo(72 / 256, 2);
    expect(successChance(99, c.successLow, c.successHigh)).toBeCloseTo(220 / 256, 2);
  });
});

describe('balance: xp per hour', () => {
  // Expected xp per tick: attempt every (baseTicks - saved) ticks, rock empties on each ore,
  // then 3 ticks to re-target (respawn time is hidden by walking to the next rock).
  const xpPerTick = (id: string, level: number, saved = 0): number => {
    const d = getRockDef(id)!;
    const p = successChance(level, d.successLow, d.successHigh);
    return d.xp / ((d.baseTicks - saved) / p + 3);
  };

  it.each(Array.from({ length: 98 }, (_, i) => i + 1))(
    'xp/h rises with level (%i -> next)',
    (l) => {
      for (const id of ['copper_rock', 'tin_rock'])
        expect(xpPerTick(id, l + 1)).toBeGreaterThan(xpPerTick(id, l));
    },
  );

  it.each(Array.from({ length: 85 }, (_, i) => i + 15))(
    'iron out-earns copper at level %i',
    (l) => {
      expect(xpPerTick('iron_rock', l)).toBeGreaterThan(xpPerTick('copper_rock', l));
    },
  );

  it.each(Array.from({ length: 70 }, (_, i) => i + 30))(
    'coal out-earns iron at level %i with the same pickaxe',
    (l) => {
      for (const saved of [0, 1, 2])
        expect(xpPerTick('coal_rock', l, saved)).toBeGreaterThan(xpPerTick('iron_rock', l, saved));
    },
  );

  it('better pickaxes earn more', () => {
    expect(xpPerTick('copper_rock', 20, 1)).toBeGreaterThan(xpPerTick('copper_rock', 20, 0));
    expect(xpPerTick('copper_rock', 20, 2)).toBeGreaterThan(xpPerTick('copper_rock', 20, 1));
  });

  it('level 1 copper is a plausible rate (2000-8000 xp/h at 600 ms ticks)', () => {
    const perHour = xpPerTick('copper_rock', 1) * 6000;
    expect(perHour).toBeGreaterThan(2000);
    expect(perHour).toBeLessThan(8000);
  });
});

const makeEnv = (
  over: Partial<GatherEnv> = {},
  owned = ['bronze_pickaxe'],
  level = 1,
): GatherEnv => ({
  getDef: getRockDef,
  level: () => level,
  tool: (kind) => {
    const b = bestTool(tools, kind, owned, () => level);
    return b ? { ticksSaved: b.def.ticksSaved } : null;
  },
  canFit: () => true,
  ...over,
});

const ctx = (tick: number, values: number[]) => ({ tick, rng: scriptedRng(values) });

function begin(nodeId: string, defId: string, env: GatherEnv): GatheringState {
  const r = startGather(createGatheringState(), nodeId, defId, env);
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
}

describe('mining behaviour', () => {
  it('mines ore, rock empties, respawns after respawnTicks', () => {
    const env = makeEnv();
    let state = begin('rock_1', 'copper_rock', env);
    for (let t = 1; t <= 3; t++) state = tickGathering(state, ctx(t, [0]), env).state;
    const r = tickGathering(state, ctx(4, [0, 0, 0]), env); // success, table, deplete
    expect(r.events.map((e) => e.type)).toEqual([
      'itemGathered',
      'xpGranted',
      'nodeDepleted',
      'gatherStopped',
    ]);
    expect(r.events[0]).toMatchObject({ itemId: 'copper_ore', quantity: 1 });
    expect(r.events[1]).toMatchObject({ amount: 17.5, skill: 'mining' });
    expect(startGather(r.state, 'rock_1', 'copper_rock', env)).toEqual({
      ok: false,
      error: 'depleted',
    });
    const at = 4 + getRockDef('copper_rock')!.respawnTicks;
    expect(tickGathering(r.state, ctx(at - 1, [0]), env).events).toEqual([]);
    const back = tickGathering(r.state, ctx(at, [0]), env);
    expect(back.events).toEqual([{ type: 'nodeRespawned', nodeId: 'rock_1' }]);
    expect(startGather(back.state, 'rock_1', 'copper_rock', env).ok).toBe(true);
  });

  it('a failed roll keeps mining and the rock intact', () => {
    const env = makeEnv();
    let s = begin('rock_1', 'tin_rock', env);
    for (let t = 1; t <= 3; t++) s = tickGathering(s, ctx(t, [0]), env).state;
    const r = tickGathering(s, ctx(4, [0.99]), env);
    expect(r.events).toEqual([]);
    expect(r.state.session).not.toBeNull();
  });

  it.each([
    ['bronze_pickaxe', 4],
    ['iron_pickaxe', 3],
    ['steel_pickaxe', 2],
  ])('%s attempts on tick %i', (axe, want) => {
    const env = makeEnv({}, [axe], 20);
    let s = begin('rock_1', 'copper_rock', env);
    let got: number | null = null;
    for (let t = 1; t <= 4 && got === null; t++) {
      const r = tickGathering(s, ctx(t, [0, 0, 0.99]), env);
      if (r.events.some((e) => e.type === 'itemGathered')) got = t;
      s = r.state;
    }
    expect(got).toBe(want);
  });

  it.each([
    [14, false],
    [15, true],
  ])('iron rock at level %i allowed: %s', (level, allowed) => {
    const r = startGather(createGatheringState(), 'r', 'iron_rock', makeEnv({}, undefined, level));
    expect(r.ok).toBe(allowed);
    if (!r.ok) expect(r.error).toBe('levelTooLow');
  });

  it.each([
    [29, false],
    [30, true],
  ])('coal rock at level %i allowed: %s', (level, allowed) => {
    const r = startGather(createGatheringState(), 'r', 'coal_rock', makeEnv({}, undefined, level));
    expect(r.ok).toBe(allowed);
    if (!r.ok) expect(r.error).toBe('levelTooLow');
  });

  it('no pickaxe -> noTool', () => {
    expect(startGather(createGatheringState(), 'r', 'copper_rock', makeEnv({}, []))).toEqual({
      ok: false,
      error: 'noTool',
    });
  });

  it('a full inventory refuses to start, and stops a running session', () => {
    expect(
      startGather(createGatheringState(), 'r', 'copper_rock', makeEnv({ canFit: () => false })),
    ).toEqual({ ok: false, error: 'inventoryFull' });
    let full = false;
    const env = makeEnv({ canFit: () => !full });
    let s = begin('r', 'copper_rock', env);
    s = tickGathering(s, ctx(1, [0]), env).state;
    full = true;
    const r = tickGathering(s, ctx(2, [0]), env);
    expect(r.events).toMatchObject([{ type: 'gatherStopped', reason: 'inventoryFull' }]);
    expect(r.state.session).toBeNull();
  });
});
