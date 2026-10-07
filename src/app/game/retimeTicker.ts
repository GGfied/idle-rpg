/** A Ticker whose interval can change live (used by the DEV tick-speed hook; rules stay tick-based). */
import { createTicker } from '@core/engine';
import type { Ticker } from '@core/engine';

export interface RetimeTicker extends Ticker {
  /** Switch the tick interval, keeping the tick count; accumulated time restarts at `nowMs`. */
  retime(ms: number, nowMs: number): void;
  readonly intervalMs: number;
}

export function createRetimeTicker(opts: {
  onTick: (tick: number) => void;
  tickMs: number;
}): RetimeTicker {
  let ms = opts.tickMs;
  let inner = createTicker({ onTick: opts.onTick, tickMs: ms });
  return {
    update: (now) => inner.update(now),
    alpha: () => inner.alpha(),
    get tick() {
      return inner.tick;
    },
    reset: (now) => inner.reset(now),
    get intervalMs() {
      return ms;
    },
    retime(next, nowMs) {
      ms = next;
      inner = createTicker({ onTick: opts.onTick, tickMs: next, startTick: inner.tick });
      inner.reset(nowMs);
    },
  };
}

/** DEV clamp: fast enough to speed up QA, never below the 30 ms frame-ish floor or above real time. */
export const clampTickMs = (ms: number): number =>
  Number.isFinite(ms) ? Math.min(600, Math.max(30, Math.round(ms))) : 600;
