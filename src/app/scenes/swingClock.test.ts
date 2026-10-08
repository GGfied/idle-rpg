import { describe, expect, it } from 'vitest';
import { createGatheringState, startGather, tickGathering } from '@core/skills';
import type { GatherDef, GatherEnv, GatheringState } from '@core/skills';
import type { TickContext } from '@core/contracts';
import { createRng } from '@core/engine';
import { animatorImpactCounts, attemptLanded, swingImpactEvent } from '@app/scenes/swingClock';
import type { SessionSnap } from '@app/scenes/swingClock';

const DEF: GatherDef = {
  id: 'copper_rock',
  skill: 'mining',
  requiredLevel: 1,
  xp: 17,
  successLow: 256,
  successHigh: 256,
  baseTicks: 4,
  yields: [{ weight: 1, value: { itemId: 'copper_ore', quantity: 1 } }],
  depleteChance: 1,
  respawnTicks: 10,
  toolKind: 'pickaxe',
};
const ENV: GatherEnv = {
  getDef: () => DEF,
  level: () => 1,
  tool: () => ({ ticksSaved: 0 }),
  canFit: () => true,
};
const snap = (g: GatheringState): SessionSnap | null => g.session;

/** Scene-side bookkeeping over the real core tick: count swings per tick, like WorldScene does. */
function run(chance: boolean, ticks: number): { swings: number[]; ore: number[] } {
  const started = startGather(createGatheringState(), 'rock1', DEF.id, ENV);
  if (!started.ok) throw new Error('start');
  let g = started.value.state;
  let prev: SessionSnap | null = null;
  const swings: number[] = [];
  const ore: number[] = [];
  const rng = { ...createRng(1), chance: () => chance } as TickContext['rng'];
  for (let t = 1; t <= ticks; t++) {
    const r = tickGathering(g, { tick: t, rng } as TickContext, ENV);
    const events = t === 1 ? [...started.value.events, ...r.events] : r.events;
    g = r.state;
    if (attemptLanded(prev, snap(g), events)) swings.push(t);
    if (events.some((e) => e.type === 'itemGathered')) ore.push(t);
    prev = snap(g);
  }
  return { swings, ore };
}

describe('attemptLanded', () => {
  it('an ore on the attempt that depletes the rock still gets its swing (the 600 ms bug)', () => {
    // Attempt on tick 4; the rock depletes and the session clears on that same tick.
    const r = run(true, 6);
    expect(r.ore).toEqual([4]);
    expect(r.swings).toEqual([4]);
  });
  it('a miss gets a swing on every attempt tick, none in between', () => {
    const r = run(false, 9);
    expect(r.ore).toEqual([]);
    expect(r.swings).toEqual([4, 8]);
  });
  it('a stale session after a cancel and restart does not swing', () => {
    const post = { nodeId: 'r', defId: 'd', cooldown: 3 };
    const prev = { nodeId: 'r', defId: 'd', cooldown: 1 };
    expect(attemptLanded(prev, post, [{ type: 'gatherStarted' }])).toBe(false);
  });
});

describe('swingImpactEvent', () => {
  it('carries the skill of what is gathered (mining -> pick sound)', () => {
    expect(swingImpactEvent('mining')).toEqual({ type: 'swingImpact', skill: 'mining' });
    expect(swingImpactEvent(undefined)).toEqual({ type: 'swingImpact' });
  });
});

describe('one swing per mining attempt (tick source + animator impact together)', () => {
  /** Both sources, as WorldScene wires them: the tick path and the animator firing on every attempt. */
  function total(chance: boolean, ticks: number): { swings: number; attempts: number } {
    const r = run(chance, ticks);
    // The animator also hits once per attempt (its 'mine' state; for the depleting attempt state is still 'mine').
    const animatorHits = r.swings.length;
    const counted = Array.from({ length: animatorHits }).filter(() =>
      animatorImpactCounts('mine', 'pickaxe'),
    ).length;
    return { swings: r.swings.length + counted, attempts: r.swings.length };
  }
  it('hit + deplete: exactly one swing per attempt', () => {
    const t = total(true, 6);
    expect(t.swings).toBe(t.attempts);
    expect(t.attempts).toBe(1);
  });
  it('misses: exactly one swing per attempt', () => {
    const t = total(false, 9);
    expect(t.swings).toBe(t.attempts);
    expect(t.attempts).toBe(2);
  });
  it('ignores the animator even when the session is already cleared (depleting attempt)', () => {
    expect(animatorImpactCounts('mine', undefined)).toBe(false);
  });
  it('chopping stays on the animator', () => {
    expect(animatorImpactCounts('chop', 'axe')).toBe(true);
  });
});
