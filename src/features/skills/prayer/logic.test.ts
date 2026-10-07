import { describe, expect, it } from 'vitest';
import { makeCtx } from '@test-utils/index';
import {
  createPrayerPoints,
  deserializePrayerPoints,
  drain,
  restore,
  serializePrayerPoints,
  tickPrayer,
} from './index';

describe('createPrayerPoints', () => {
  it.each([
    [1, 1],
    [43, 43],
    [0, 0],
    [-5, 0],
    [NaN, 0],
    [12.7, 12],
  ])('max %s -> current %s', (max, expected) => {
    expect(createPrayerPoints(max)).toEqual({ current: expected });
  });
});

describe('drain', () => {
  it.each([
    [10, 3, 10, 7],
    [10, 99, 10, 0],
    [10, 0, 10, 10],
    [10, -4, 10, 10],
    [10, NaN, 10, 10],
    [10, Infinity, 10, 10],
    [20, 1, 10, 9], // current above max is clamped first
  ])('current %s drain %s max %s -> %s', (current, amount, max, expected) => {
    expect(drain({ current }, amount, max).current).toBe(expected);
  });
});

describe('restore', () => {
  it.each([
    [4, 3, 10, 7],
    [4, 99, 10, 10],
    [4, 0, 10, 4],
    [4, -2, 10, 4],
    [4, NaN, 10, 4],
    [4, Infinity, 10, 4],
    [20, 5, 10, 10],
  ])('current %s restore %s max %s -> %s', (current, amount, max, expected) => {
    expect(restore({ current }, amount, max).current).toBe(expected);
  });
});

describe('tickPrayer', () => {
  it.each([
    [5, 10, 5, 0],
    [10, 10, 10, 0],
    [0, 10, 0, 0],
    [10, 7, 7, 1],
  ])('current %s max %s -> %s with %s events', (current, max, expected, nEvents) => {
    const state = { current };
    const r = tickPrayer(state, makeCtx(), max);
    expect(r.state.current).toBe(expected);
    expect(r.events).toHaveLength(nEvents);
    if (nEvents === 0) expect(r.state).toBe(state);
    else expect(r.events[0]).toEqual({ type: 'prayerChanged', current: expected, max });
  });

  it('never regenerates over many ticks', () => {
    let s = { current: 3 };
    for (let i = 1; i <= 50; i++) s = tickPrayer(s, makeCtx(i), 10).state;
    expect(s.current).toBe(3);
  });
});

describe('save slice', () => {
  it('round-trips', () => {
    const s = { current: 6 };
    expect(deserializePrayerPoints(serializePrayerPoints(s), 10)).toEqual({ ok: true, value: s });
  });

  it('clamps to max', () => {
    expect(deserializePrayerPoints({ current: 50 }, 10)).toEqual({
      ok: true,
      value: { current: 10 },
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'x'],
    ['number', 5],
    ['array', [3]],
    ['missing field', {}],
    ['string current', { current: '5' }],
    ['NaN', { current: NaN }],
    ['Infinity', { current: Infinity }],
    ['negative', { current: -1 }],
    ['fraction', { current: 2.5 }],
    ['inherited field', Object.create({ current: 3 })],
  ])('rejects %s', (_name, data) => {
    expect(deserializePrayerPoints(data, 10).ok).toBe(false);
  });
});
