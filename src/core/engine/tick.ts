import type { GameEvent, System, TickContext } from '@core/contracts';

export type { System } from '@core/contracts';

/** One game tick lasts 600 ms. Game logic never runs on frame time. */
export const TICK_MS = 600;

/** Run systems in order, threading state through and concatenating their events. */
export function runSystems<S, E extends GameEvent = GameEvent>(
  systems: readonly System<S, E>[],
  state: S,
  ctx: TickContext,
): { state: S; events: E[] } {
  const events: E[] = [];
  let current = state;
  for (const system of systems) {
    const result = system(current, ctx);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

export interface TickerOptions {
  /** Called once per elapsed tick. `tick` counts from `startTick + 1`. */
  onTick: (tick: number) => void;
  tickMs?: number;
  startTick?: number;
  /** Cap on ticks run in one update, so a background tab can't cause a burst. Default 5. */
  maxCatchUp?: number;
}

export interface Ticker {
  /**
   * Feed the current time in ms (one monotonic clock for all callers). Returns the number of
   * ticks run. A `nowMs` older than or equal to the latest seen time is ignored (returns 0 and
   * leaves state untouched), so several callers sharing a clock can't double-count time.
   * `reset()` is the only way to move the reference time backwards.
   */
  update(nowMs: number): number;
  /** Fraction [0, 1) of the way to the next tick, for render interpolation. */
  alpha(): number;
  readonly tick: number;
  /** Forget accumulated time (e.g. after the tab was hidden or a save was loaded). */
  reset(nowMs: number): void;
}

/** Fixed-timestep accumulator, decoupled from frame rate and testable with a fake clock. */
export function createTicker(options: TickerOptions): Ticker {
  const tickMs = options.tickMs ?? TICK_MS;
  const maxCatchUp = options.maxCatchUp ?? 5;
  let tick = options.startTick ?? 0;
  let last: number | null = null;
  let acc = 0;

  return {
    update(nowMs) {
      if (last === null) {
        last = nowMs;
        return 0;
      }
      if (nowMs <= last) return 0; // older/equal time: no-op, never move `last` back
      acc += nowMs - last;
      last = nowMs;
      let ran = 0;
      while (acc >= tickMs && ran < maxCatchUp) {
        acc -= tickMs;
        tick += 1;
        ran += 1;
        options.onTick(tick);
      }
      if (acc >= tickMs) acc %= tickMs; // dropped backlog beyond the cap
      return ran;
    },
    alpha: () => acc / tickMs,
    get tick() {
      return tick;
    },
    reset(nowMs) {
      last = nowMs;
      acc = 0;
    },
  };
}

export interface TickerScheduler {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: TickerScheduler = {
  now: () => performance.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** Drive a ticker from a timer (every 100 ms by default). Returns a stop function. */
export function startTicker(
  ticker: Ticker,
  scheduler: TickerScheduler = defaultScheduler,
  pollMs = 100,
): () => void {
  ticker.reset(scheduler.now());
  const handle = scheduler.setInterval(() => ticker.update(scheduler.now()), pollMs);
  return () => scheduler.clearInterval(handle);
}
