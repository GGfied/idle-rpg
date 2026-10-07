import { describe, expect, it } from 'vitest';
import { clampTickMs, createRetimeTicker } from './retimeTicker';

describe('retime ticker', () => {
  it('changes the interval live, keeps the tick count', () => {
    const ticks: number[] = [];
    const t = createRetimeTicker({ onTick: (n) => ticks.push(n), tickMs: 600 });
    t.reset(0);
    expect(t.update(600)).toBe(1);
    t.retime(60, 600);
    expect(t.intervalMs).toBe(60);
    expect(t.update(720)).toBe(2);
    expect(ticks).toEqual([1, 2, 3]);
    expect(t.tick).toBe(3);
    t.update(750);
    expect(t.alpha()).toBeCloseTo(0.5);
  });
  it('clamps to 30-600', () => {
    expect(clampTickMs(1)).toBe(30);
    expect(clampTickMs(60)).toBe(60);
    expect(clampTickMs(5000)).toBe(600);
    expect(clampTickMs(NaN)).toBe(600);
  });
});
