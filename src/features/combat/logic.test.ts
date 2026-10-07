import { describe, expect, it } from 'vitest';
import { makeCtx } from '@test-utils/index';
import {
  HP_BOOST_CAP,
  HP_REGEN_INTERVAL_TICKS,
  createPlayerHp,
  damage,
  deserializePlayerHp,
  heal,
  isDead,
  serializePlayerHp,
  tickPlayerHp,
} from './index';
import type { PlayerHpState } from './index';

const hp = (current: number, regenTicks = 0): PlayerHpState => ({ current, regenTicks });

function run(state: PlayerHpState, ticks: number, max: number) {
  let s = state;
  const events: unknown[] = [];
  for (let i = 1; i <= ticks; i++) {
    const r = tickPlayerHp(s, makeCtx(i), max);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('create/isDead', () => {
  it('starts full', () => expect(createPlayerHp(10)).toEqual(hp(10)));
  it.each([
    [0, true],
    [-1, true],
    [1, false],
  ])('isDead(%i) = %s', (c, d) => expect(isDead(hp(c))).toBe(d));
});

describe('damage', () => {
  it.each([
    ['normal', 10, 3, 7],
    ['exact kill', 3, 3, 0],
    ['overkill', 3, 99, 0],
    ['infinity', 5, Infinity, 0],
    ['fraction floors', 10, 2.9, 8],
    ['zero ignored', 10, 0, 10],
    ['negative ignored', 10, -4, 10],
    ['NaN ignored', 10, NaN, 10],
    ['sub-1 ignored', 10, 0.5, 10],
    ['boosted stays above max', 25, 1, 24],
  ])('%s', (_n, cur, amt, want) => {
    expect(damage(hp(cur), amt, 10).current).toBe(want);
  });
  it('does not mutate', () => {
    const s = hp(10);
    damage(s, 3, 10);
    expect(s.current).toBe(10);
  });
});

describe('heal', () => {
  it.each([
    ['normal', 4, 3, 7],
    ['clamps to max', 8, 99, 10],
    ['infinity', 1, Infinity, 10],
    ['zero ignored', 4, 0, 4],
    ['negative ignored', 4, -2, 4],
    ['NaN ignored', 4, NaN, 4],
    ['never lowers over-max', 15, 3, 15],
    ['heal from 0', 0, 2, 2],
  ])('%s', (_n, cur, amt, want) => {
    expect(heal(hp(cur), amt, 10).current).toBe(want);
  });
});

describe('tickPlayerHp', () => {
  it('no regen and no events at max', () => {
    const r = run(hp(10), 500, 10);
    expect(r.state).toEqual(hp(10));
    expect(r.events).toEqual([]);
  });
  it('regens exactly at tick 100, not 99', () => {
    const at99 = run(hp(5), HP_REGEN_INTERVAL_TICKS - 1, 10);
    expect(at99.state).toEqual(hp(5, 99));
    expect(at99.events).toEqual([]);
    const at100 = run(hp(5), HP_REGEN_INTERVAL_TICKS, 10);
    expect(at100.state).toEqual(hp(6));
    expect(at100.events).toEqual([{ type: 'hpChanged', current: 6, max: 10 }]);
  });
  it('regens repeatedly and stops at max', () => {
    const r = run(hp(7), 1000, 10);
    expect(r.state).toEqual(hp(10));
    expect(r.events).toHaveLength(3);
  });
  it('decays by 1 per 100 ticks when above max', () => {
    const r = run(hp(12), 250, 10);
    expect(r.state).toEqual(hp(10));
    expect(r.events).toEqual([
      { type: 'hpChanged', current: 11, max: 10 },
      { type: 'hpChanged', current: 10, max: 10 },
    ]);
  });
  it('does not regen when dead', () => {
    const r = run(hp(0, 50), 300, 10);
    expect(r.state).toEqual(hp(0));
    expect(r.events).toEqual([]);
  });
  it('resets the timer when healed to max', () => {
    expect(tickPlayerHp(hp(10, 40), makeCtx(), 10).state).toEqual(hp(10));
  });
  it('max increase starts regen from the current value', () => {
    expect(run(hp(10), 100, 11).state).toEqual(hp(11));
  });
});

describe('save slice', () => {
  it('round-trips', () => {
    const s = serializePlayerHp(hp(7, 33));
    expect(s).toEqual({ current: 7 });
    expect(deserializePlayerHp(s, 10)).toEqual({ ok: true, value: hp(7) });
  });
  it.each([
    ['zero is valid', { current: 0 }, 10, 0],
    ['clamped to max', { current: 12 }, 10, 10],
    ['boost cap edge clamps', { current: 10 + HP_BOOST_CAP }, 10, 10],
  ])('accepts: %s', (_n, data, max, want) => {
    const r = deserializePlayerHp(data, max);
    expect(r.ok && r.value.current).toBe(want);
  });
  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['missing key', {}],
    ['extra key', { current: 5, regenTicks: 1 }],
    ['wrong key', { cur: 5 }],
    ['negative', { current: -1 }],
    ['fraction', { current: 2.5 }],
    ['NaN', { current: NaN }],
    ['Infinity', { current: Infinity }],
    ['string value', { current: '5' }],
    ['above boost cap', { current: 10 + HP_BOOST_CAP + 1 }],
    [
      'class instance',
      new (class X {
        current = 5;
      })(),
    ],
    ['inherited key', Object.create({ current: 5 }) as unknown],
  ])('rejects: %s', (_n, data) => {
    expect(deserializePlayerHp(data, 10).ok).toBe(false);
  });
  it('JSON __proto__ payload cannot pollute', () => {
    const data = JSON.parse('{"current":5,"__proto__":{"x":1}}') as unknown;
    expect(deserializePlayerHp(data, 10).ok).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
