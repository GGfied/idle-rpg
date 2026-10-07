import { describe, expect, it, vi } from 'vitest';
import type { System } from '@core/contracts';
import { makeCtx } from '@test-utils/index';
import { TICK_MS, createTicker, runSystems, startTicker } from './tick';

describe('runSystems', () => {
  it('threads state in order and concatenates events', () => {
    const add: System<number> = (s) => ({ state: s + 1, events: [{ type: 'added' }] });
    const dbl: System<number> = (s) => ({ state: s * 2, events: [{ type: 'doubled' }] });
    const r = runSystems([add, dbl], 5, makeCtx());
    expect(r.state).toBe(12);
    expect(r.events.map((e) => e.type)).toEqual(['added', 'doubled']);
  });

  it('passes ctx through and handles no systems', () => {
    const ctx = makeCtx(9);
    const seen: number[] = [];
    runSystems([(s, c) => (seen.push(c.tick), { state: s, events: [] })], 0, ctx);
    expect(seen).toEqual([9]);
    expect(runSystems([], 'x', ctx)).toEqual({ state: 'x', events: [] });
  });
});

describe('createTicker', () => {
  it('uses 600 ms ticks', () => expect(TICK_MS).toBe(600));

  it('first update only anchors the clock', () => {
    const onTick = vi.fn();
    const t = createTicker({ onTick });
    expect(t.update(10_000)).toBe(0);
    expect(onTick).not.toHaveBeenCalled();
  });

  it.each([
    [599, 0],
    [600, 1],
    [1199, 1],
    [1800, 3],
  ])('after %i ms runs %i ticks', (elapsed, expected) => {
    const t = createTicker({ onTick: () => {} });
    t.update(1000);
    expect(t.update(1000 + elapsed)).toBe(expected);
  });

  it('numbers ticks consecutively regardless of frame rate', () => {
    const ticks: number[] = [];
    const t = createTicker({ onTick: (n) => ticks.push(n), startTick: 10 });
    t.update(0);
    for (let ms = 16; ms <= 1300; ms += 16) t.update(ms);
    expect(ticks).toEqual([11, 12]);
    expect(t.tick).toBe(12);
  });

  it('caps catch-up and drops the backlog', () => {
    const t = createTicker({ onTick: () => {}, maxCatchUp: 3 });
    t.update(0);
    expect(t.update(600 * 100)).toBe(3);
    expect(t.update(600 * 100 + 1)).toBe(0);
  });

  it('alpha reports progress to the next tick; reset clears it', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(0);
    t.update(300);
    expect(t.alpha()).toBeCloseTo(0.5);
    t.reset(300);
    expect(t.alpha()).toBe(0);
  });

  it('ignores a clock that goes backwards', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(1000);
    expect(t.update(500)).toBe(0);
    expect(t.alpha()).toBe(0);
  });

  it('does not move its reference back on an older now', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(1000);
    expect(t.update(400)).toBe(0);
    expect(t.update(1600)).toBe(1); // 600 ms since 1000, not 1200 since 400
    expect(t.tick).toBe(1);
  });

  it('treats an equal now as a no-op', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(0);
    expect(t.update(900)).toBe(1);
    const alpha = t.alpha();
    expect(t.update(900)).toBe(0);
    expect(t.alpha()).toBe(alpha);
    expect(t.tick).toBe(1);
  });

  it('does not double-tick with interleaved callers on the same clock', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(0);
    let ran = 0;
    for (const now of [100, 100, 600, 600, 650, 1100, 1200, 1200, 1200]) ran += t.update(now);
    expect(ran).toBe(2);
    expect(t.tick).toBe(2);
  });

  it('interleaved stale and fresh times still tick once per 600 ms', () => {
    const t = createTicker({ onTick: () => {} });
    t.update(0);
    let ran = 0;
    for (const now of [600, 590, 1200, 1190, 1800]) ran += t.update(now);
    expect(ran).toBe(3);
  });
});

describe('startTicker', () => {
  it('polls on the scheduler and stops', () => {
    let now = 0;
    let cb: () => void = () => {};
    const cleared = vi.fn();
    const ticker = createTicker({ onTick: () => {} });
    const stop = startTicker(ticker, {
      now: () => now,
      setInterval: (fn) => ((cb = fn), 'h'),
      clearInterval: cleared,
    });
    now = 1250;
    cb();
    expect(ticker.tick).toBe(2);
    stop();
    expect(cleared).toHaveBeenCalledWith('h');
  });
});
