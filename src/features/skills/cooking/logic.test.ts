import { describe, expect, it } from 'vitest';
import { scriptedRng, seededRng } from '@test-utils/index';
import { checkItemRefs, createItemRegistry } from '@core/items';
import { successChance } from '@core/skills';
import {
  BURNT_FISH_ID,
  BURNT_MEAT_ID,
  COOKING_ITEMS,
  COOKING_MESSAGES,
  COOKING_RECIPES,
  cookOnce,
  cookSuccessChance,
  createCookingState,
  getRecipe,
  healAmount,
  levelTooLowMessage,
  startCooking,
  stopCooking,
  tickCooking,
} from './index';
import type { CookingEnv, CookingEvent, CookingState } from './index';

const items = createItemRegistry(COOKING_ITEMS);
const shrimp = getRecipe('raw_shrimp')!;
const trout = getRecipe('raw_trout')!;

describe('data validity', () => {
  it('every recipe resolves to registered items and has sane numbers', () => {
    const ids = COOKING_RECIPES.flatMap((r) => [r.cookedId, r.burntId]);
    expect(checkItemRefs(items, ids, 'cooking').ok).toBe(true);
    for (const r of COOKING_RECIPES) {
      expect(r.stopBurnLevel).toBeGreaterThan(r.levelRequired);
      expect(r.ticksPerCook).toBe(4);
      expect(r.xp).toBeGreaterThan(0);
      expect(r.heals).toBeGreaterThan(0);
      expect(r.rawId).toMatch(/^raw_/);
      expect(COOKING_MESSAGES.cooked[r.rawId]).toBeTruthy();
      expect(COOKING_MESSAGES.burnt[r.rawId]).toBeTruthy();
    }
  });

  it('matches the OSRS-like level/xp table', () => {
    expect(COOKING_RECIPES.map((r) => [r.rawId, r.levelRequired, r.xp])).toEqual([
      ['raw_shrimp', 1, 30],
      ['raw_anchovies', 1, 30],
      ['raw_sardine', 1, 40],
      ['raw_herring', 5, 50],
      ['raw_mackerel', 10, 60],
      ['raw_trout', 15, 70],
      ['raw_chicken', 1, 30],
      ['raw_beef', 1, 30],
    ]);
  });

  it('item icons equal item ids', () => {
    for (const i of COOKING_ITEMS) expect(i.icon).toBe(i.id);
  });
});

describe('cookSuccessChance', () => {
  const cases: [string, number, 'fire' | 'range', (p: number) => boolean][] = [
    ['at requirement (fire)', shrimp.levelRequired, 'fire', (p) => Math.abs(p - 119 / 256) < 1e-9],
    ['mid level', 17, 'fire', (p) => p > 119 / 256 && p < 1],
    ['at stop-burn', shrimp.stopBurnLevel, 'fire', (p) => p === 1],
    ['above stop-burn', 99, 'fire', (p) => p === 1],
    ['range at requirement', shrimp.levelRequired, 'range', (p) => Math.abs(p - 127 / 256) < 1e-9],
  ];
  it.each(cases)('%s', (_n, level, src, check) => {
    expect(check(cookSuccessChance(shrimp, level, src))).toBe(true);
  });

  it('rises monotonically and a range never burns more than a fire', () => {
    let prev = 0;
    for (let l = trout.levelRequired; l <= trout.stopBurnLevel + 2; l++) {
      const fire = cookSuccessChance(trout, l, 'fire');
      expect(fire).toBeGreaterThanOrEqual(prev);
      expect(cookSuccessChance(trout, l, 'range')).toBeGreaterThanOrEqual(fire);
      prev = fire;
    }
  });

  it('uses the shared successChance curve', () => {
    expect(cookSuccessChance(shrimp, 1, 'fire')).toBe(successChance(1, 118, 255));
  });
});

describe('cookOnce errors', () => {
  const base = { rawId: 'raw_trout', level: 15, rawCount: 1, source: 'fire' as const };
  const cases: [string, Partial<typeof base>, string][] = [
    ['unknown recipe', { rawId: 'logs' }, 'unknownRecipe'],
    ['level one below requirement', { level: 14 }, 'levelTooLow'],
    ['no raw food', { rawCount: 0 }, 'noRawFood'],
  ];
  it.each(cases)('%s', (_n, patch, error) => {
    const r = cookOnce({ ...base, ...patch }, seededRng(1));
    expect(r).toEqual({ ok: false, error });
  });

  it('level exactly at requirement is allowed', () => {
    expect(cookOnce(base, seededRng(1)).ok).toBe(true);
  });
});

describe('cookOnce outcomes', () => {
  const input = { rawId: 'raw_shrimp', level: 1, rawCount: 3, source: 'fire' as const };

  it('success: cooked item, xp, message', () => {
    const r = cookOnce(input, scriptedRng([0]));
    expect(r).toEqual({
      ok: true,
      value: {
        consume: { itemId: 'raw_shrimp', quantity: 1 },
        produce: { itemId: 'shrimps', quantity: 1 },
        xp: 30,
        burnt: false,
        message: 'You cook the shrimps.',
      },
    });
  });

  it('burn: burnt item, NO xp, message', () => {
    const r = cookOnce(input, scriptedRng([0.999]));
    expect(r).toEqual({
      ok: true,
      value: {
        consume: { itemId: 'raw_shrimp', quantity: 1 },
        produce: { itemId: BURNT_FISH_ID, quantity: 1 },
        xp: 0,
        burnt: true,
        message: 'You accidentally burn the shrimps.',
      },
    });
  });

  it('burn rate over many seeded rolls matches the chance at req / mid / stop-burn, fire and range', () => {
    const cases: [string, number, 'fire' | 'range'][] = [
      ['req', 1, 'fire'],
      ['mid', 17, 'fire'],
      ['stop', 34, 'fire'],
      ['req range', 1, 'range'],
    ];
    for (const [, level, source] of cases) {
      const rng = seededRng(42);
      const n = 5000;
      let burnt = 0;
      for (let i = 0; i < n; i++) {
        const r = cookOnce({ ...input, level, source, rawCount: 1 }, rng);
        if (r.ok && r.value.burnt) burnt++;
      }
      const expected = 1 - cookSuccessChance(shrimp, level, source);
      expect(Math.abs(burnt / n - expected)).toBeLessThan(0.03);
    }
  });

  it('range burns less than fire over many rolls at the requirement level', () => {
    const count = (source: 'fire' | 'range'): number => {
      const rng = seededRng(7);
      let b = 0;
      for (let i = 0; i < 5000; i++) {
        const r = cookOnce({ ...input, source }, rng);
        if (r.ok && r.value.burnt) b++;
      }
      return b;
    };
    expect(count('range')).toBeLessThan(count('fire'));
  });

  it('never burns at or above stop-burn level', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 500; i++) {
      const r = cookOnce({ ...input, level: 34 }, rng);
      expect(r.ok && r.value.burnt).toBe(false);
    }
  });
});

describe('meat', () => {
  const cases: [string, number, string, string, number][] = [
    ['raw_chicken', 0, 'cooked_chicken', 'You cook the chicken.', 30],
    ['raw_beef', 0, 'cooked_beef', 'You cook the beef.', 30],
    ['raw_chicken', 0.999, BURNT_MEAT_ID, 'You accidentally burn the chicken.', 0],
    ['raw_beef', 0.999, BURNT_MEAT_ID, 'You accidentally burn the beef.', 0],
  ];
  it.each(cases)('%s roll %s -> %s', (rawId, roll, produced, message, xp) => {
    const r = cookOnce({ rawId, level: 1, rawCount: 1, source: 'fire' }, scriptedRng([roll]));
    expect(r).toMatchObject({ ok: true, value: { produce: { itemId: produced }, message, xp } });
  });
});

describe('healing values', () => {
  it.each([
    ['shrimps', 3],
    ['anchovies', 1],
    ['sardine', 4],
    ['herring', 5],
    ['mackerel', 6],
    ['trout', 7],
    ['cooked_chicken', 3],
    ['cooked_beef', 3],
    [BURNT_FISH_ID, undefined],
    [BURNT_MEAT_ID, undefined],
    ['logs', undefined],
  ])('%s heals %s', (id, hp) => expect(healAmount(id)).toBe(hp));
});

describe('messages', () => {
  it('level message names the level', () => {
    expect(levelTooLowMessage('raw_trout')).toBe('You need a Cooking level of 15 to cook this.');
    expect(levelTooLowMessage('nope')).toBeNull();
  });
});

describe('cooking loop', () => {
  const make = (raw: number, level = 15, active = true) => {
    const bag = { raw };
    const env: CookingEnv = {
      level: () => level,
      count: () => bag.raw,
      sourceActive: () => active,
    };
    return { bag, env };
  };
  const run = (state: CookingState, env: CookingEnv, bag: { raw: number }, ticks: number) => {
    const rng = scriptedRng([0]); // always succeeds
    const events: CookingEvent[] = [];
    let s = state;
    for (let t = 1; t <= ticks; t++) {
      const r = tickCooking(s, { tick: t, rng }, env);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'itemConsumed') bag.raw -= e.quantity;
        events.push(e);
      }
    }
    return { state: s, events };
  };

  it('start errors leave state unchanged', () => {
    const cases: [string, string, number, number, string][] = [
      ['unknown', 'logs', 5, 15, 'unknownRecipe'],
      ['low level', 'raw_trout', 5, 1, 'levelTooLow'],
      ['no food', 'raw_trout', 0, 15, 'noRawFood'],
    ];
    for (const [, raw, n, lvl, error] of cases) {
      const { env } = make(n, lvl);
      expect(startCooking('fire1', 'fire', raw, env)).toEqual({ ok: false, error });
    }
  });

  it('cooks one item every 4 ticks until none are left, then stops', () => {
    const { bag, env } = make(3);
    const started = startCooking('fire1', 'fire', 'raw_trout', env);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const { state, events } = run(started.value.state, env, bag, 30);
    const cooked = events.filter((e) => e.type === 'itemCooked');
    expect(cooked).toHaveLength(3);
    expect(events.filter((e) => e.type === 'xpGranted')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'itemGathered' && e.itemId === 'trout')).toHaveLength(3);
    expect(bag.raw).toBe(0);
    expect(state.session).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'cookingStopped', reason: 'noRawFood' });
  });

  it('first cook lands on tick 4, not earlier', () => {
    const { bag, env } = make(2);
    const s = startCooking('fire1', 'fire', 'raw_trout', env);
    if (!s.ok) throw new Error('start');
    expect(run(s.value.state, env, bag, 3).events).toHaveLength(0);
  });

  it('a burn grants no xp event but still consumes and produces burnt fish', () => {
    const { env } = make(2);
    const s = startCooking('fire1', 'fire', 'raw_shrimp', env);
    if (!s.ok) throw new Error('start');
    let st = s.value.state;
    const events: CookingEvent[] = [];
    for (let t = 1; t <= 4; t++) {
      const r = tickCooking(st, { tick: t, rng: scriptedRng([0.999]) }, make(2, 1).env);
      st = r.state;
      events.push(...r.events);
    }
    expect(events.some((e) => e.type === 'xpGranted')).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'itemConsumed', itemId: 'raw_shrimp' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'itemGathered', itemId: BURNT_FISH_ID }),
    );
  });

  it('stops when the fire is gone', () => {
    const { env } = make(3, 15, false);
    const r = tickCooking(
      { session: { objectId: 'f', source: 'fire', rawId: 'raw_trout', cooldown: 1 } },
      { tick: 1, rng: seededRng(1) },
      env,
    );
    expect(r.state.session).toBeNull();
    expect(r.events).toEqual([expect.objectContaining({ reason: 'sourceGone' })]);
  });

  it('stops mid-session when raw food vanishes or level is too low', () => {
    const sess = {
      session: { objectId: 'f', source: 'fire' as const, rawId: 'raw_trout', cooldown: 2 },
    };
    const none = tickCooking(sess, { tick: 1, rng: seededRng(1) }, make(0).env);
    expect(none.events).toEqual([expect.objectContaining({ reason: 'noRawFood' })]);
    const low = tickCooking(sess, { tick: 1, rng: seededRng(1) }, make(3, 1).env);
    expect(low.events).toEqual([
      expect.objectContaining({ reason: 'levelTooLow', requiredLevel: 15 }),
    ]);
  });

  it('stopCooking cancels, and is a no-op when idle', () => {
    const idle = createCookingState();
    expect(stopCooking(idle)).toEqual({ state: idle, events: [] });
    const r = stopCooking({
      session: { objectId: 'f', source: 'fire', rawId: 'raw_trout', cooldown: 2 },
    });
    expect(r.state.session).toBeNull();
    expect(r.events).toEqual([expect.objectContaining({ reason: 'cancelled' })]);
  });

  it('tick with no session is a no-op', () => {
    const idle = createCookingState();
    expect(tickCooking(idle, { tick: 1, rng: seededRng(1) }, make(1).env)).toEqual({
      state: idle,
      events: [],
    });
  });
});
