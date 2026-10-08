import { describe, expect, it } from 'vitest';
import { scriptedRng, seededRng } from '@test-utils/index';
import { bestTool, createToolRegistry, hasTool } from '@core/equipment';
import { checkItemRefs, createItemRegistry } from '@core/items';
import { successChance } from '@core/skills';
import {
  BAIT_ITEM_ID,
  FISHING_ITEMS,
  FISHING_MESSAGES,
  FISHING_SPOTS,
  FISHING_TOOLS,
  STARTING_ITEMS,
  addSpot,
  createFishingState,
  eligibleCatches,
  expectedXpPerTick,
  getMethod,
  getSpotDef,
  levelTooLowMessage,
  startFishing,
  stopFishing,
  tickFishing,
} from './index';
import type { FishingEnv, FishingEvent, FishingState } from './index';

const items = createItemRegistry(FISHING_ITEMS);
const tools = createToolRegistry(FISHING_TOOLS);

describe('data validity', () => {
  it('spot ids are exactly the world spawn defIds', () => {
    expect(FISHING_SPOTS.map((d) => d.id)).toEqual(['net_spot', 'bait_spot']);
  });

  it('all item refs resolve (catches, bait, tools, starting items)', () => {
    const ids = [
      ...FISHING_SPOTS.flatMap((s) =>
        Object.values(s.methods).flatMap((m) => [
          ...m.catches.map((c) => c.itemId),
          ...(m.baitItemId ? [m.baitItemId] : []),
        ]),
      ),
      ...tools.itemIds(),
      ...STARTING_ITEMS.map((s) => s.itemId),
    ];
    expect(checkItemRefs(items, ids, 'fishing').ok).toBe(true);
  });

  it('raw fish ids are raw_<fish>, bait is the only stackable item, tools are fishing tools', () => {
    const fish = FISHING_SPOTS.flatMap((s) =>
      Object.values(s.methods).flatMap((m) => m.catches.map((c) => c.itemId)),
    );
    expect(fish).toEqual([
      'raw_shrimp',
      'raw_anchovies',
      'raw_mackerel',
      'raw_sardine',
      'raw_herring',
      'raw_trout',
    ]);
    expect(FISHING_ITEMS.filter((i) => i.stackable).map((i) => i.id)).toEqual([BAIT_ITEM_ID]);
    expect([...tools.all()].map(([id, d]) => [id, d.kind, d.skill])).toEqual([
      ['small_fishing_net', 'net', 'fishing'],
      ['fishing_rod', 'rod', 'fishing'],
    ]);
  });

  it('every method has valid catch data and a tool in the registry', () => {
    const kinds = new Set([...tools.all()].map(([, d]) => d.kind));
    for (const s of FISHING_SPOTS) {
      expect(s.moveTicksMin).toBeGreaterThan(0);
      expect(s.moveTicksMax).toBeGreaterThanOrEqual(s.moveTicksMin);
      for (const m of Object.values(s.methods)) {
        expect(kinds.has(m.toolKind)).toBe(true);
        expect(m.baseTicks).toBeGreaterThan(0);
        for (const c of m.catches) {
          expect(c.weight).toBeGreaterThan(0);
          expect(c.xp).toBeGreaterThan(0);
          expect(c.successLow).toBeGreaterThan(0);
          expect(c.successHigh).toBeGreaterThanOrEqual(c.successLow);
          expect(c.successHigh).toBeLessThanOrEqual(256);
        }
      }
    }
  });

  it('only the bait method needs bait; levels follow the brief', () => {
    expect(getMethod('net_spot')!.def.baitItemId).toBeUndefined();
    expect(getMethod('bait_spot')!.def.baitItemId).toBe('fishing_bait');
    const lv = (d: string) => getMethod(d)!.def.catches.map((c) => [c.itemId, c.requiredLevel]);
    expect(lv('net_spot')).toEqual([
      ['raw_shrimp', 1],
      ['raw_anchovies', 15],
      ['raw_mackerel', 30],
    ]);
    expect(lv('bait_spot')).toEqual([
      ['raw_sardine', 5],
      ['raw_herring', 10],
      ['raw_trout', 25],
    ]);
    expect(getMethod('nope')).toBeUndefined();
    expect(getMethod('net_spot', 'bait')).toBeUndefined();
    expect(getSpotDef('nope')).toBeUndefined();
  });

  it('messages cover every stop reason and every fish', () => {
    expect(Object.keys(FISHING_MESSAGES.stopped).sort()).toEqual(
      ['cancelled', 'inventoryFull', 'levelTooLow', 'noBait', 'noTool', 'spotMoved'].sort(),
    );
    const fish = FISHING_SPOTS.flatMap((s) =>
      Object.values(s.methods).flatMap((m) => m.catches.map((c) => c.itemId)),
    );
    expect(Object.keys(FISHING_MESSAGES.caught).sort()).toEqual([...fish].sort());
    expect(levelTooLowMessage('bait_spot')).toBe('You need a Fishing level of 5 to fish here.');
    expect(levelTooLowMessage('nope')).toBeNull();
  });
});

describe('tools', () => {
  const lvl = () => 1;
  it.each([
    ['net', ['small_fishing_net'], true],
    ['net', ['fishing_rod'], false],
    ['rod', ['fishing_rod'], true],
    ['rod', ['small_fishing_net', 'fishing_bait'], false],
    ['net', [], false],
  ])('hasTool(%s, %j) = %s', (kind, owned, expected) => {
    expect(hasTool(tools, kind, owned, lvl)).toBe(expected);
    expect(bestTool(tools, kind, owned, lvl) !== null).toBe(expected);
  });
});

const makeEnv = (
  over: Partial<FishingEnv> = {},
  owned = ['small_fishing_net', 'fishing_rod'],
  level = 1,
  bait = true,
): FishingEnv => ({
  level: () => level,
  tool: (kind) => {
    const b = bestTool(tools, kind, owned, () => level);
    return b ? { ticksSaved: b.def.ticksSaved } : null;
  },
  hasItem: (id) => id !== BAIT_ITEM_ID || bait,
  canFit: () => true,
  ...over,
});

const ctx = (tick: number, values: number[]) => ({ tick, rng: scriptedRng(values) });

function begin(defId: string, env: FishingEnv, state = createFishingState()): FishingState {
  const r = startFishing(state, `${defId}_1`, defId, env);
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
}

/** Run ticks 1..n-1 as pure countdown, returns the state ready for the attempt tick. */
function countdown(state: FishingState, env: FishingEnv, ticks = 3): FishingState {
  let s = state;
  for (let t = 1; t <= ticks; t++) s = tickFishing(s, ctx(t, [0]), env).state;
  return s;
}

const types = (e: FishingEvent[]) => e.map((x) => x.type);

describe('start requirements', () => {
  it.each([
    ['net_spot', makeEnv({}, ['fishing_rod']), 'noTool'],
    ['net_spot', makeEnv({}, []), 'noTool'],
    ['bait_spot', makeEnv({}, ['small_fishing_net'], 50), 'noTool'],
    ['bait_spot', makeEnv({}, undefined, 4), 'levelTooLow'],
    ['bait_spot', makeEnv({}, undefined, 5, false), 'noBait'],
    ['net_spot', makeEnv({ canFit: () => false }), 'inventoryFull'],
    ['nope', makeEnv(), 'cancelled'],
  ])('%s refuses with %s and leaves no session', (defId, env, reason) => {
    expect(startFishing(createFishingState(), 's1', defId, env)).toEqual({
      ok: false,
      error: reason,
    });
  });

  it.each([
    ['net_spot', makeEnv()],
    ['bait_spot', makeEnv({}, undefined, 5)],
    ['net_spot', makeEnv({ hasItem: () => false })], // net needs no bait
  ])('%s starts with the right gear', (defId, env) => {
    const r = startFishing(createFishingState(), 's1', defId, env);
    expect(r.ok && r.value.events).toEqual([
      {
        type: 'fishingStarted',
        spotId: 's1',
        defId,
        method: defId === 'net_spot' ? 'net' : 'bait',
      },
    ]);
  });
});

describe('catching', () => {
  it('net: counts down 4 ticks, miss keeps fishing, hit grants shrimp + xp and no bait event', () => {
    const env = makeEnv();
    let s = begin('net_spot', env);
    s = countdown(s, env, 3);
    let r = tickFishing(s, ctx(5, [0, 0.999]), env); // pick fish, fail the roll
    expect(types(r.events)).toEqual(['fishingAttempt']);
    expect(r.state.session!.cooldown).toBe(4);
    s = countdown(r.state, env, 3);
    r = tickFishing(s, ctx(10, [0, 0]), env);
    expect(r.events).toEqual([
      { type: 'fishingAttempt', spotId: 'net_spot_1', defId: 'net_spot', method: 'net' },
      {
        type: 'itemGathered',
        skill: 'fishing',
        nodeId: 'net_spot_1',
        itemId: 'raw_shrimp',
        quantity: 1,
      },
      { type: 'xpGranted', skill: 'fishing', amount: 10, source: 'net' },
    ]);
    expect(r.state.session).not.toBeNull();
  });

  it('bait: each catch consumes exactly one bait; a miss consumes none', () => {
    const env = makeEnv({}, undefined, 10);
    const s = countdown(begin('bait_spot', env), env, 3);
    const miss = tickFishing(s, ctx(5, [0, 0.999]), env);
    expect(types(miss.events)).toEqual(['fishingAttempt']);
    const hit = tickFishing(countdown(miss.state, env, 3), ctx(10, [0, 0]), env);
    expect(types(hit.events)).toEqual([
      'fishingAttempt',
      'itemGathered',
      'xpGranted',
      'baitConsumed',
    ]);
    expect(hit.events[3]).toEqual({ type: 'baitConsumed', itemId: 'fishing_bait', quantity: 1 });
  });

  it('running out of bait stops the next tick with a noBait reason + item id', () => {
    let bait = true;
    const env = makeEnv({ hasItem: (id) => id !== BAIT_ITEM_ID || bait }, undefined, 10);
    let s = begin('bait_spot', env);
    bait = false;
    const r = tickFishing(s, ctx(1, [0]), env);
    expect(r.events).toEqual([
      {
        type: 'fishingStopped',
        spotId: 'bait_spot_1',
        defId: 'bait_spot',
        reason: 'noBait',
        baitItemId: 'fishing_bait',
      },
    ]);
    expect(r.state.session).toBeNull();
    expect(FISHING_MESSAGES.stopped.noBait).not.toBe('');
    s = r.state;
    expect(s.session).toBeNull();
  });

  it('losing the tool mid-session stops with noTool and the tool kind', () => {
    let owned = ['small_fishing_net'];
    const env = makeEnv({
      tool: (k) => (bestTool(tools, k, owned, () => 1) ? { ticksSaved: 0 } : null),
    });
    const s = begin('net_spot', env);
    owned = [];
    const r = tickFishing(s, ctx(1, [0]), env);
    expect(r.events).toMatchObject([{ type: 'fishingStopped', reason: 'noTool', tool: 'net' }]);
  });

  it('a full inventory stops a running session, before a roll and on a catch', () => {
    let full = false;
    const env = makeEnv({ canFit: () => !full });
    let s = begin('net_spot', env);
    full = true;
    let r = tickFishing(s, ctx(1, [0]), env);
    expect(r.events).toMatchObject([{ type: 'fishingStopped', reason: 'inventoryFull' }]);
    expect(r.state.session).toBeNull();
    // bag fills only for the fish itself (canFit true for start + pre-check, false at the catch)
    full = false;
    let calls = 0;
    const env2 = makeEnv({ canFit: () => ++calls <= 2 });
    s = countdown(begin('net_spot', env2), makeEnv(), 3);
    r = tickFishing(s, ctx(5, [0, 0]), env2);
    expect(types(r.events)).toEqual(['fishingAttempt', 'fishingStopped']);
    expect(r.events.some((e) => e.type === 'itemGathered')).toBe(false);
  });

  it('stopFishing cancels and is a no-op when idle', () => {
    const env = makeEnv();
    const s = begin('net_spot', env);
    expect(stopFishing(s).events).toMatchObject([{ type: 'fishingStopped', reason: 'cancelled' }]);
    expect(stopFishing(s).state.session).toBeNull();
    const idle = createFishingState();
    expect(stopFishing(idle)).toEqual({ state: idle, events: [] });
  });
});

describe('fishingAttempt', () => {
  it.each([
    ['net_spot', 'net', makeEnv(), 4],
    ['bait_spot', 'bait', makeEnv({}, undefined, 10), 4],
  ])('%s: one event per attempt (hit or miss), none on idle ticks', (defId, method, env, cd) => {
    let s = begin(defId, env);
    const attempts: FishingEvent[] = [];
    let expected = 0;
    // alternate hit / miss rolls for 6 full cycles; every other tick is a cooldown tick
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < cd - 1; k++) {
        const idle = tickFishing(s, ctx(1, [0]), env);
        expect(idle.events).toEqual([]);
        s = idle.state;
      }
      const r = tickFishing(s, ctx(1, i % 2 ? [0, 0.999] : [0, 0]), env);
      attempts.push(...r.events.filter((e) => e.type === 'fishingAttempt'));
      expected++;
      s = r.state;
    }
    expect(attempts).toHaveLength(expected);
    expect(attempts[0]).toEqual({
      type: 'fishingAttempt',
      spotId: `${defId}_1`,
      defId,
      method,
    });
  });

  it('no session and a refused tick emit no attempt; every method has a message', () => {
    const env = makeEnv();
    expect(tickFishing(createFishingState(), ctx(1, [0]), env).events).toEqual([]);
    const s = begin('net_spot', env);
    const r = tickFishing(s, ctx(1, [0]), makeEnv({ hasItem: () => true, canFit: () => false }));
    expect(types(r.events)).toEqual(['fishingStopped']);
    const methods = FISHING_SPOTS.flatMap((d) => Object.keys(d.methods));
    for (const m of methods) expect(FISHING_MESSAGES.attempt[m]).toBeTruthy();
  });
});

describe('level-gated catches', () => {
  it.each([
    ['net_spot', 1, ['raw_shrimp']],
    ['net_spot', 14, ['raw_shrimp']],
    ['net_spot', 15, ['raw_shrimp', 'raw_anchovies']],
    ['net_spot', 29, ['raw_shrimp', 'raw_anchovies']],
    ['net_spot', 30, ['raw_shrimp', 'raw_anchovies', 'raw_mackerel']],
    ['bait_spot', 5, ['raw_sardine']],
    ['bait_spot', 9, ['raw_sardine']],
    ['bait_spot', 10, ['raw_sardine', 'raw_herring']],
    ['bait_spot', 24, ['raw_sardine', 'raw_herring']],
    ['bait_spot', 25, ['raw_sardine', 'raw_herring', 'raw_trout']],
  ])('%s at level %i can catch %j', (defId, level, expected) => {
    expect(eligibleCatches(getMethod(defId)!.def, level).map((c) => c.itemId)).toEqual(expected);
  });

  it('the roll picks the high-level fish only once unlocked', () => {
    const catchWith = (level: number, pick: number) => {
      const env = makeEnv({}, undefined, level);
      const s = countdown(begin('net_spot', env), env, 3);
      const r = tickFishing(s, ctx(5, [pick, 0]), env);
      return r.events.find((e) => e.type === 'itemGathered');
    };
    expect(catchWith(14, 0.99)).toMatchObject({ itemId: 'raw_shrimp' });
    expect(catchWith(15, 0.99)).toMatchObject({ itemId: 'raw_anchovies' });
    expect(catchWith(15, 0)).toMatchObject({ itemId: 'raw_shrimp' });
  });

  it('weights hold within tolerance over many seeded attempts', () => {
    const m = getMethod('net_spot')!.def;
    const level = 40;
    const env = makeEnv({}, undefined, level);
    const rng = seededRng(7);
    let s = begin('net_spot', env);
    const counts: Record<string, number> = {};
    for (let t = 1; t <= 60000; t++) {
      const r = tickFishing(s, { tick: t, rng }, env);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'itemGathered') counts[e.itemId] = (counts[e.itemId] ?? 0) + 1;
      }
    }
    const exp = m.catches.map((c) => c.weight * successChance(level, c.successLow, c.successHigh));
    const share =
      (counts.raw_anchovies ?? 0) / ((counts.raw_anchovies ?? 0) + (counts.raw_shrimp ?? 0));
    expect(Math.abs(share - exp[1]! / (exp[0]! + exp[1]!))).toBeLessThan(0.02);
  });
});

describe('top fish per spot', () => {
  it.each([
    ['net_spot', 'raw_mackerel', 30, 'raw_anchovies'],
    ['bait_spot', 'raw_trout', 25, 'raw_herring'],
  ])(
    '%s: %s unlocks at %i, pays more xp/h from the gate to 99, and lower fish still appear',
    (defId, fish, gate, prev) => {
      const m = getMethod(defId)!.def;
      const without = { ...m, catches: m.catches.filter((c) => c.itemId !== fish) };
      for (const lv of [gate, 40, 60, 99]) {
        expect(expectedXpPerTick(m, lv)).toBeGreaterThan(expectedXpPerTick(without, lv));
      }
      expect(expectedXpPerTick(m, gate - 1)).toBe(expectedXpPerTick(without, gate - 1));
      const env = makeEnv({}, undefined, 60);
      const rng = seededRng(11);
      let s = begin(defId, env);
      const counts: Record<string, number> = {};
      for (let t = 1; t <= 40000; t++) {
        const r = tickFishing(s, { tick: t, rng }, env);
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'itemGathered') counts[e.itemId] = (counts[e.itemId] ?? 0) + 1;
        }
      }
      expect(counts[fish]).toBeGreaterThan(0);
      expect(counts[prev]).toBeGreaterThan(0);
      expect(counts[m.catches[0]!.itemId]).toBeGreaterThan(counts[fish]!);
      expect(counts[fish]!).toBeGreaterThan(40000 * 0.01);
    },
  );
});

describe('XP per hour', () => {
  it.each(FISHING_SPOTS.flatMap((s) => Object.keys(s.methods).map((m) => [s.id, m] as const)))(
    '%s/%s xp per tick is positive and rises with level in a unlock-free stretch',
    (defId, method) => {
      const m = getMethod(defId, method)!.def;
      const first = Math.min(...m.catches.map((c) => c.requiredLevel));
      const last = Math.max(...m.catches.map((c) => c.requiredLevel));
      expect(expectedXpPerTick(m, first - 1)).toBe(0);
      for (let lv = last; lv < 99; lv++) {
        expect(expectedXpPerTick(m, lv + 1)).toBeGreaterThan(expectedXpPerTick(m, lv));
      }
      // Unlocking a better fish never lowers the rate by much (xp per hour should keep rising overall).
      expect(expectedXpPerTick(m, 99)).toBeGreaterThan(expectedXpPerTick(m, first));
    },
  );

  it('xp/hour is in an OSRS-like band at 99 (ticks are 0.6 s)', () => {
    for (const s of FISHING_SPOTS) {
      const m = Object.values(s.methods)[0]!;
      const perHour = expectedXpPerTick(m, 99) * 6000;
      expect(perHour).toBeGreaterThan(5000);
      expect(perHour).toBeLessThan(24000);
    }
  });
});

describe('spot moving', () => {
  const def = getSpotDef('net_spot')!;
  const placed = (tileCount = 4) =>
    addSpot(createFishingState(), 'net_spot_1', 'net_spot', tileCount, ctx(0, [0]));

  it('addSpot schedules the first move within min..max ticks; unknown def is ignored', () => {
    const s = placed();
    expect(s.spots.net_spot_1).toMatchObject({ defId: 'net_spot', tile: 0, tileCount: 4 });
    expect(s.spots.net_spot_1!.moveTimer.respawnAt).toBe(def.moveTicksMin);
    const late = addSpot(createFishingState(), 'a', 'net_spot', 4, ctx(0, [0.9999]));
    expect(late.spots.a!.moveTimer.respawnAt).toBe(def.moveTicksMax);
    expect(addSpot(createFishingState(), 'a', 'nope', 4, ctx(0, [0]))).toEqual(
      createFishingState(),
    );
  });

  it('does not move early, moves on the due tick to a different tile and reschedules', () => {
    const s = placed();
    const due = def.moveTicksMin;
    expect(tickFishing(s, ctx(due - 1, [0]), makeEnv()).events).toEqual([]);
    const r = tickFishing(s, ctx(due, [0, 0]), makeEnv());
    expect(r.events).toEqual([
      { type: 'spotMoved', spotId: 'net_spot_1', defId: 'net_spot', from: 0, to: 1 },
    ]);
    expect(r.state.spots.net_spot_1!.tile).toBe(1);
    expect(r.state.spots.net_spot_1!.moveTimer.respawnAt).toBe(due + def.moveTicksMin);
  });

  it.each([0, 0.34, 0.67, 0.9999])('never lands on its own tile (roll %d)', (roll) => {
    const r = tickFishing(placed(4), ctx(def.moveTicksMin, [roll]), makeEnv());
    const e = r.events[0] as Extract<FishingEvent, { type: 'spotMoved' }>;
    expect(e.to).not.toBe(e.from);
    expect(e.to).toBeGreaterThanOrEqual(0);
    expect(e.to).toBeLessThan(4);
  });

  it('a single-tile spot stays put', () => {
    const r = tickFishing(placed(1), ctx(def.moveTicksMin, [0]), makeEnv());
    expect(r.state.spots.net_spot_1!.tile).toBe(0);
  });

  it('moving ends the session of the player fishing there, not of someone elsewhere', () => {
    const env = makeEnv();
    const base = addSpot(createFishingState(), 'net_spot_1', 'net_spot', 4, ctx(0, [0]));
    const here = begin('net_spot', env, base);
    const moved = tickFishing(here, ctx(def.moveTicksMin, [0]), env);
    expect(types(moved.events)).toEqual(['spotMoved', 'fishingStopped']);
    expect(moved.events[1]).toMatchObject({ reason: 'spotMoved', spotId: 'net_spot_1' });
    expect(moved.state.session).toBeNull();

    const other = startFishing(base, 'other_spot', 'net_spot', env);
    expect(other.ok).toBe(true);
    if (other.ok) {
      const r = tickFishing(other.value.state, ctx(def.moveTicksMin, [0]), env);
      expect(types(r.events)).toEqual(['spotMoved']);
      expect(r.state.session).not.toBeNull();
    }
  });
});
