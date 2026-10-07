export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface Autosave {
  start(): void;
  stop(): void;
  /** Save now. Call on visibilitychange hidden / pagehide, level-up, quest completion. */
  flush(): void;
}

const defaultScheduler: Scheduler = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

export function createAutosave(opts: {
  intervalMs?: number;
  save: () => void;
  scheduler?: Scheduler;
}): Autosave {
  const { intervalMs = 30_000, save, scheduler = defaultScheduler } = opts;
  let handle: unknown = null;
  let running = false;
  return {
    start() {
      if (running) return;
      running = true;
      handle = scheduler.setInterval(save, intervalMs);
    },
    stop() {
      if (!running) return;
      running = false;
      scheduler.clearInterval(handle);
      handle = null;
    },
    flush() {
      save();
    },
  };
}
