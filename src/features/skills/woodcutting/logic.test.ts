import { describe, expect, it } from 'vitest';
import { scriptedRng } from '@test-utils/index';
import { bestTool, createToolRegistry } from '@core/equipment';
import { checkItemRefs, createItemRegistry } from '@core/items';
import { createGatheringState, startGather, successChance, tickGathering } from '@core/skills';
import type { GatherEnv, GatheringState } from '@core/skills';
import {
  STARTING_ITEMS,
  WOODCUTTING_ITEMS,
  WOODCUTTING_MESSAGES,
  WOODCUTTING_NODES,
  WOODCUTTING_TOOLS,
  getTreeDef,
  levelTooLowMessage,
} from './index';

const items = createItemRegistry(WOODCUTTING_ITEMS);
const tools = createToolRegistry(WOODCUTTING_TOOLS);

describe('data validity', () => {
  it('node ids are exactly the world spawn defIds', () => {
    expect(WOODCUTTING_NODES.map((d) => d.id)).toEqual(['tree', 'oak_tree']);
  });

  it('all item refs resolve (yields, tools, starting items)', () => {
    const ids = [
      ...WOODCUTTING_NODES.flatMap((d) => d.yields.map((y) => y.value.itemId)),
      ...tools.itemIds(),
      ...STARTING_ITEMS.map((s) => s.itemId),
    ];
    const r = checkItemRefs(items, ids, 'woodcutting');
    expect(r.ok).toBe(true);
  });

  it('items are not stackable and tools are axes for woodcutting', () => {
    expect(WOODCUTTING_ITEMS.every((i) => !i.stackable)).toBe(true);
    for (const [, def] of tools.all()) {
      expect(def).toMatchObject({ kind: 'axe', skill: 'woodcutting' });
    }
  });

  it('nodes are woodcutting axe nodes and progress in level/xp', () => {
    expect(WOODCUTTING_NODES.every((d) => d.skill === 'woodcutting' && d.toolKind === 'axe')).toBe(
      true,
    );
    expect(getTreeDef('oak_tree')!.requiredLevel).toBeGreaterThan(
      getTreeDef('tree')!.requiredLevel,
    );
    expect(getTreeDef('oak_tree')!.xp).toBeGreaterThan(getTreeDef('tree')!.xp);
    expect(getTreeDef('nope')).toBeUndefined();
  });

  it('messages cover every stop reason', () => {
    expect(Object.keys(WOODCUTTING_MESSAGES.stopped).sort()).toEqual(
      ['cancelled', 'depleted', 'inventoryFull', 'levelTooLow', 'noTool'].sort(),
    );
    expect(levelTooLowMessage('oak_tree')).toBe(
      'You need a Woodcutting level of 15 to chop this tree.',
    );
    expect(levelTooLowMessage('nope')).toBeNull();
  });
});

describe('axe selection and success rate', () => {
  it('prefers iron over bronze; none when no axe', () => {
    const pick = (owned: string[]) => bestTool(tools, 'axe', owned, () => 1)?.itemId ?? null;
    expect(pick(['bronze_axe', 'iron_axe'])).toBe('iron_axe');
    expect(pick(['bronze_axe'])).toBe('bronze_axe');
    expect(pick(['logs'])).toBeNull();
  });

  it('success rises with level', () => {
    for (const d of WOODCUTTING_NODES) {
      expect(successChance(99, d.successLow, d.successHigh)).toBeGreaterThan(
        successChance(1, d.successLow, d.successHigh),
      );
    }
    const t = getTreeDef('tree')!;
    const o = getTreeDef('oak_tree')!;
    expect(successChance(30, t.successLow, t.successHigh)).toBeGreaterThan(
      successChance(30, o.successLow, o.successHigh),
    );
  });
});

const makeEnv = (over: Partial<GatherEnv> = {}, owned = ['bronze_axe'], level = 1): GatherEnv => ({
  getDef: getTreeDef,
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

describe('chopping behaviour', () => {
  it('chops a log, then a normal tree falls and respawns after respawnTicks', () => {
    const env = makeEnv();
    let state = begin('tree_1', 'tree', env);
    // cooldown 4: ticks 1..3 count down; a miss (0.99) on tick 4 keeps chopping
    for (let t = 1; t <= 3; t++) state = tickGathering(state, ctx(t, [0.99]), env).state;
    let r = tickGathering(state, ctx(4, [0.99]), env);
    expect(r.events).toEqual([]);
    state = r.state;
    for (let t = 5; t <= 7; t++) state = tickGathering(state, ctx(t, [0]), env).state;
    // success (0), table (0), deplete roll (0 < 1)
    r = tickGathering(state, ctx(8, [0, 0, 0]), env);
    expect(r.events.map((e) => e.type)).toEqual([
      'itemGathered',
      'xpGranted',
      'nodeDepleted',
      'gatherStopped',
    ]);
    expect(r.events[0]).toMatchObject({ itemId: 'logs', quantity: 1 });
    expect(r.events[1]).toMatchObject({ amount: 25, skill: 'woodcutting' });
    expect(startGather(r.state, 'tree_1', 'tree', env)).toEqual({ ok: false, error: 'depleted' });

    const respawnTick = 8 + getTreeDef('tree')!.respawnTicks;
    expect(tickGathering(r.state, ctx(respawnTick - 1, [0]), env).events).toEqual([]);
    const back = tickGathering(r.state, ctx(respawnTick, [0]), env);
    expect(back.events).toEqual([{ type: 'nodeRespawned', nodeId: 'tree_1' }]);
    expect(startGather(back.state, 'tree_1', 'tree', env).ok).toBe(true);
  });

  it('iron axe chops faster (3 ticks vs 4)', () => {
    const attempt = (owned: string[]) => {
      const env = makeEnv({}, owned);
      let s = begin('tree_1', 'tree', env);
      for (let t = 1; t <= 4; t++) {
        const r = tickGathering(s, ctx(t, [0, 0, 0.99]), env);
        if (r.events.some((e) => e.type === 'itemGathered')) return t;
        s = r.state;
      }
      return null;
    };
    expect(attempt(['bronze_axe'])).toBe(4);
    expect(attempt(['iron_axe'])).toBe(3);
  });

  it('oak is blocked under level 15, allowed at 15; oak survives a failed deplete roll', () => {
    expect(
      startGather(createGatheringState(), 'oak_1', 'oak_tree', makeEnv({}, undefined, 14)),
    ).toEqual({
      ok: false,
      error: 'levelTooLow',
    });
    const env = makeEnv({}, undefined, 15);
    let s = begin('oak_1', 'oak_tree', env);
    for (let t = 1; t <= 3; t++) s = tickGathering(s, ctx(t, [0]), env).state;
    const r = tickGathering(s, ctx(4, [0, 0, 0.9]), env); // success, table, no deplete
    expect(r.events.map((e) => e.type)).toEqual(['itemGathered', 'xpGranted']);
    expect(r.events[0]).toMatchObject({ itemId: 'oak_logs' });
    expect(r.state.session).not.toBeNull();
  });

  it('no axe -> noTool', () => {
    expect(startGather(createGatheringState(), 'tree_1', 'tree', makeEnv({}, []))).toEqual({
      ok: false,
      error: 'noTool',
    });
  });

  it('a full inventory stops the action', () => {
    const env = makeEnv({ canFit: () => false });
    let s = begin('tree_1', 'tree', env);
    for (let t = 1; t <= 3; t++) s = tickGathering(s, ctx(t, [0]), env).state;
    const r = tickGathering(s, ctx(4, [0, 0]), env);
    expect(r.events).toEqual([
      {
        type: 'gatherStopped',
        nodeId: 'tree_1',
        defId: 'tree',
        reason: 'inventoryFull',
      },
    ]);
    expect(r.state.session).toBeNull();
  });
});
