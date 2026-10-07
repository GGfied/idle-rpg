import { describe, expect, it } from 'vitest';
import { makeCtx, scriptedRng } from '@test-utils/index';
import type { TickContext } from '@core/contracts';
import {
  createGatheringState,
  createNode,
  depleteNode,
  gatherStoppedEvent,
  isDepleted,
  startGather,
  stopGather,
  successChance,
  tickGathering,
  tickNode,
} from './index';
import type { GatherDef, GatherEnv, GatheringState } from './index';

describe('successChance', () => {
  it.each([
    [1, 64, 200, 65 / 256], // level 1 -> low
    [99, 64, 200, 201 / 256], // level 99 -> high
    [50, 64, 200, 133 / 256], // floor(64*49/98 + 200*49/98 + .5) = 132 -> 133/256
    [0, 64, 200, 65 / 256], // clamped to level 1
    [150, 64, 200, 201 / 256], // clamped to level 99
    [99, 400, 400, 1], // capped at 1
    [1, 0, 0, 1 / 256],
  ])('level %i low %i high %i -> %f', (level, low, high, expected) => {
    expect(successChance(level, low, high)).toBeCloseTo(expected, 10);
  });

  it('is non-decreasing in level when high > low', () => {
    let prev = 0;
    for (let l = 1; l <= 99; l++) {
      const c = successChance(l, 30, 180);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});

describe('nodeState', () => {
  it('deplete then respawn at the right tick', () => {
    const n = depleteNode(10, 5);
    expect(isDepleted(createNode())).toBe(false);
    expect(isDepleted(n)).toBe(true);
    expect(tickNode(n, 14)).toEqual({ node: n, respawned: false });
    expect(tickNode(n, 15)).toEqual({ node: createNode(), respawned: true });
    expect(tickNode(n, 99).respawned).toBe(true);
  });

  it('respawn is at least one tick away; available nodes never respawn', () => {
    expect(depleteNode(10, 0).respawnAt).toBe(11);
    expect(tickNode(createNode(), 5).respawned).toBe(false);
  });
});

const tree: GatherDef = {
  id: 'normal_tree',
  skill: 'woodcutting',
  requiredLevel: 1,
  xp: 25,
  successLow: 256, // always succeeds (capped to 1)
  successHigh: 256,
  baseTicks: 4,
  yields: [{ weight: 1, value: { itemId: 'logs', quantity: 1 } }],
  depleteChance: 0,
  respawnTicks: 10,
  toolKind: 'axe',
};

function makeEnv(over: Partial<GatherEnv> = {}, defs: GatherDef[] = [tree]): GatherEnv {
  return {
    getDef: (id) => defs.find((d) => d.id === id),
    level: () => 1,
    tool: () => ({ ticksSaved: 0 }),
    canFit: () => true,
    ...over,
  };
}

const started = (env: GatherEnv, state = createGatheringState()): GatheringState => {
  const r = startGather(state, 't1', tree.id, env);
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
};

const ctxWith = (tick: number, values: number[]): TickContext => ({
  tick,
  rng: scriptedRng(values),
});

describe('startGather / stopGather', () => {
  it('starts with a cooldown and a gatherStarted event', () => {
    const r = startGather(createGatheringState(), 't1', tree.id, makeEnv());
    expect(r.ok && r.value.state.session).toEqual({ nodeId: 't1', defId: tree.id, cooldown: 4 });
    expect(r.ok && r.value.events).toEqual([
      { type: 'gatherStarted', nodeId: 't1', defId: tree.id },
    ]);
  });

  it.each([
    ['level too low', { level: () => 0 }, 'levelTooLow'],
    ['no tool', { tool: () => null }, 'noTool'],
    ['unknown def', { getDef: () => undefined }, 'cancelled'],
  ] as const)('refuses: %s', (_n, over, reason) => {
    const r = startGather(createGatheringState(), 't1', tree.id, makeEnv(over));
    expect(r).toEqual({ ok: false, error: reason });
  });

  it('refuses a depleted node', () => {
    const state = { session: null, nodes: { t1: depleteNode(1, 10) } };
    expect(startGather(state, 't1', tree.id, makeEnv())).toEqual({ ok: false, error: 'depleted' });
  });

  it('tool speed shortens the attempt time, never below 1 tick', () => {
    const fast = startGather(
      createGatheringState(),
      't1',
      tree.id,
      makeEnv({ tool: () => ({ ticksSaved: 99 }) }),
    );
    expect(fast.ok && fast.value.state.session?.cooldown).toBe(1);
  });

  it('stopGather clears the session once, no-op when idle', () => {
    const s = started(makeEnv());
    const r = stopGather(s);
    expect(r.state.session).toBeNull();
    expect(r.events).toEqual([
      { type: 'gatherStopped', nodeId: 't1', reason: 'cancelled', defId: 'normal_tree' },
    ]);
    expect(stopGather(r.state)).toEqual({ state: r.state, events: [] });
  });
});

describe('tickGathering', () => {
  const env = makeEnv();

  it('idle with no nodes does nothing', () => {
    const s = createGatheringState();
    expect(tickGathering(s, makeCtx(), env)).toEqual({ state: s, events: [] });
  });

  it('counts down, then yields item + xp on the attempt tick and re-arms', () => {
    let state = started(env);
    for (let t = 1; t <= 3; t++) {
      const r = tickGathering(state, ctxWith(t, [0]), env);
      expect(r.events).toEqual([]);
      state = r.state;
    }
    const r = tickGathering(state, ctxWith(4, [0, 0]), env);
    expect(r.events).toEqual([
      { type: 'itemGathered', skill: 'woodcutting', nodeId: 't1', itemId: 'logs', quantity: 1 },
      { type: 'xpGranted', skill: 'woodcutting', amount: 25, source: 'normal_tree' },
    ]);
    expect(r.state.session?.cooldown).toBe(4);
  });

  it('a failed roll yields nothing but keeps acting', () => {
    const hard = { ...tree, successLow: 0, successHigh: 0 }; // 1/256
    const e = makeEnv({}, [hard]);
    const s = started(e);
    const quick = { ...s, session: { ...s.session!, cooldown: 1 } };
    const r = tickGathering(quick, ctxWith(5, [0.99]), e);
    expect(r.events).toEqual([]);
    expect(r.state.session?.cooldown).toBe(4);
  });

  it('depletes on a successful roll under depleteChance and respawns later', () => {
    const d = { ...tree, depleteChance: 0.5 };
    const e = makeEnv({}, [d]);
    const s = started(e);
    const quick = { ...s, session: { ...s.session!, cooldown: 1 } };
    const r = tickGathering(quick, ctxWith(7, [0, 0, 0.1]), e); // success, table, deplete
    expect(r.events.map((x) => x.type)).toEqual([
      'itemGathered',
      'xpGranted',
      'nodeDepleted',
      'gatherStopped',
    ]);
    expect(r.state.session).toBeNull();
    expect(r.state.nodes.t1).toEqual({ respawnAt: 17 });

    const early = tickGathering(r.state, makeCtx(16), e);
    expect(early.events).toEqual([]);
    expect(early.state).toBe(r.state);
    const back = tickGathering(r.state, makeCtx(17), e);
    expect(back.events).toEqual([{ type: 'nodeRespawned', nodeId: 't1' }]);
    expect(back.state.nodes).toEqual({});
  });

  it('survives the deplete roll failing', () => {
    const d = { ...tree, depleteChance: 0.5 };
    const e = makeEnv({}, [d]);
    const s = started(e);
    const quick = { ...s, session: { ...s.session!, cooldown: 1 } };
    const r = tickGathering(quick, ctxWith(7, [0, 0, 0.9]), e);
    expect(r.events.map((x) => x.type)).toEqual(['itemGathered', 'xpGranted']);
    expect(r.state.session).not.toBeNull();
  });

  it.each([
    ['tool lost', { tool: () => null }, 'noTool', { tool: 'axe' }],
    ['level lost', { level: () => 0 }, 'levelTooLow', { requiredLevel: 1 }],
    ['def gone', { getDef: () => undefined }, 'cancelled', {}],
  ] as const)('stops when %s', (_n, over, reason, extra) => {
    const s = started(env);
    const r = tickGathering(s, makeCtx(2), makeEnv(over));
    expect(r.state.session).toBeNull();
    // toStrictEqual: extra fields must be absent (not undefined) for other reasons.
    expect(r.events).toStrictEqual([
      { type: 'gatherStopped', nodeId: 't1', reason, defId: 'normal_tree', ...extra },
    ]);
  });

  it('gatherStoppedEvent adds detail only for its own reason', () => {
    const d = { ...tree, requiredLevel: 15 };
    expect(gatherStoppedEvent('t1', d.id, 'levelTooLow', d)).toStrictEqual({
      type: 'gatherStopped',
      nodeId: 't1',
      reason: 'levelTooLow',
      defId: d.id,
      requiredLevel: 15,
    });
    expect(gatherStoppedEvent('t1', d.id, 'noTool', d)).toStrictEqual({
      type: 'gatherStopped',
      nodeId: 't1',
      reason: 'noTool',
      defId: d.id,
      tool: 'axe',
    });
    expect(gatherStoppedEvent('t1', d.id, 'noTool', { ...d, toolKind: undefined })).toStrictEqual({
      type: 'gatherStopped',
      nodeId: 't1',
      reason: 'noTool',
      defId: d.id,
    });
    expect(gatherStoppedEvent('t1', d.id, 'inventoryFull', d)).toStrictEqual({
      type: 'gatherStopped',
      nodeId: 't1',
      reason: 'inventoryFull',
      defId: d.id,
    });
  });

  it('stops with inventoryFull and grants nothing', () => {
    const s = started(env);
    const quick = { ...s, session: { ...s.session!, cooldown: 1 } };
    const r = tickGathering(quick, ctxWith(3, [0, 0]), makeEnv({ canFit: () => false }));
    expect(r.events).toEqual([
      { type: 'gatherStopped', nodeId: 't1', reason: 'inventoryFull', defId: 'normal_tree' },
    ]);
    expect(r.state.session).toBeNull();
  });

  it('stops when the node was depleted under the player', () => {
    const s = { ...started(env), nodes: { t1: depleteNode(1, 50) } };
    const r = tickGathering(s, makeCtx(2), env);
    expect(r.events).toEqual([
      { type: 'gatherStopped', nodeId: 't1', reason: 'depleted', defId: 'normal_tree' },
    ]);
  });

  it('is replayable: same seed, same events', () => {
    const run = (): string => {
      const e = makeEnv({}, [{ ...tree, successLow: 40, successHigh: 40, baseTicks: 1 }]);
      let st = started(e);
      const ctx = makeCtx(1, 1234);
      const out: string[] = [];
      for (let t = 1; t <= 50; t++) {
        const r = tickGathering(st, { tick: t, rng: ctx.rng }, e);
        st = r.state;
        out.push(...r.events.map((x) => x.type));
      }
      return out.join();
    };
    expect(run()).toBe(run());
    expect(run()).toContain('itemGathered');
  });
});
