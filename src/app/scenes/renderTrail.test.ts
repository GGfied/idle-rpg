import { describe, expect, it } from 'vitest';
import { createTicker } from '@core/engine';
import { advanceTrail, snapTrail, frameAlpha, renderPosition, startTrail } from './renderTrail';

describe('player render trail', () => {
  it('glides strictly between the previous and current tile within a tick', () => {
    const t = advanceTrail(startTrail({ x: 5, y: 5 }, 0), { x: 6, y: 5 }, 1);
    expect(renderPosition(t, 0)).toEqual({ x: 5, y: 5 });
    const mid = renderPosition(t, 0.5);
    expect(mid.x).toBeGreaterThan(5);
    expect(mid.x).toBeLessThan(6);
    expect(renderPosition(t, 1)).toEqual({ x: 6, y: 5 });
  });

  it('a store change inside the same tick (a click) does not snap the player to its tile', () => {
    const t = advanceTrail(startTrail({ x: 5, y: 5 }, 0), { x: 6, y: 5 }, 1);
    const afterClick = advanceTrail(t, { x: 6, y: 5 }, 1);
    expect(afterClick).toBe(t);
    expect(renderPosition(afterClick, 0.3).x).toBeCloseTo(5.3);
  });

  it('a standing player stays put for every alpha, and the next tick continues from the last tile', () => {
    let t = advanceTrail(startTrail({ x: 5, y: 5 }, 0), { x: 6, y: 5 }, 1);
    t = advanceTrail(t, { x: 6, y: 5 }, 2); // arrived: no movement this tick
    for (const a of [0, 0.4, 0.99]) expect(renderPosition(t, a)).toEqual({ x: 6, y: 5 });
    t = advanceTrail(t, { x: 7, y: 6 }, 3); // new path: start from where it stood, no jump
    expect(renderPosition(t, 0)).toEqual({ x: 6, y: 5 });
    expect(renderPosition(t, 0.5)).toEqual({ x: 6.5, y: 5.5 });
  });

  it('clamps bad alpha', () => {
    const t = advanceTrail(startTrail({ x: 0, y: 0 }, 0), { x: 2, y: 0 }, 1);
    expect(renderPosition(t, -1).x).toBe(0);
    expect(renderPosition(t, 5).x).toBe(2);
    expect(renderPosition(t, NaN).x).toBe(0);
  });

  describe('continuity across tick boundaries at 60 fps', () => {
    const FRAME = 1000 / 60;
    /** Walk straight one tile per tick; the ticker is also polled by a 16 ms timer like the runtime. */
    function walk(
      readAlpha: (t: ReturnType<typeof createTicker>, now: number) => number,
    ): number[] {
      let trail = startTrail({ x: 0, y: 0 }, 0);
      let x = 0;
      const ticker = createTicker({
        onTick: (n) => {
          x += 1;
          trail = advanceTrail(trail, { x, y: 0 }, n);
        },
      });
      ticker.update(0);
      let nextPoll = 16;
      const xs: number[] = [];
      for (let f = 1; f <= 400; f++) {
        const now = f * FRAME;
        while (nextPoll <= now) {
          ticker.update(nextPoll);
          nextPoll += 16;
        }
        const al = readAlpha(ticker, now); // BEFORE reading `trail`: a due tick advances it
        xs.push(renderPosition(trail, al).x);
      }
      return xs.slice(1).map((v, i) => v - (xs[i] ?? 0));
    }

    const spread = (d: number[]): number => {
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      return Math.max(...d.map((v) => Math.abs(v - mean) / mean));
    };

    it('per-frame steps stay within 15% of the mean (frame-synced alpha)', () => {
      const d = walk((t, now) => frameAlpha(t, now));
      expect(spread(d.slice(40))).toBeLessThan(0.15);
    });

    it('a timer-polled alpha does not (documents the old judder)', () => {
      const d = walk((t) => t.alpha());
      expect(spread(d.slice(40))).toBeGreaterThan(0.15);
    });
  });

  it('snapTrail jumps to the new tile with no easing, even inside the same tick', () => {
    const t = advanceTrail(startTrail({ x: 5, y: 5 }, 0), { x: 5, y: 5 }, 1);
    const s = snapTrail(t, { x: 6, y: 5 }, 1);
    expect(renderPosition(s, 0)).toEqual({ x: 6, y: 5 });
    expect(renderPosition(s, 0.5)).toEqual({ x: 6, y: 5 });
    const walked = advanceTrail(t, { x: 6, y: 5 }, 2);
    expect(renderPosition(walked, 0).x).toBe(5);
  });
});
