import { describe, expect, it, vi } from 'vitest';
import { watchViewport } from '@app/scenes/remeasure';
import type { ViewportEnv } from '@app/scenes/remeasure';

function fakeEnv(): {
  env: ViewportEnv;
  fire: (target: string) => void;
  flush: () => void;
  listeners: () => number;
  setDpr: (n: number) => void;
} {
  const subs = new Map<string, Set<() => void>>();
  const add = (k: string) => (_t: string, fn: () => void) => {
    (subs.get(k) ?? subs.set(k, new Set()).get(k)!).add(fn);
  };
  const rem = (k: string) => (_t: string, fn: () => void) => void subs.get(k)?.delete(fn);
  let queue: (() => void)[] = [];
  const env: ViewportEnv = {
    addEventListener: add('win'),
    removeEventListener: rem('win'),
    devicePixelRatio: 1,
    matchMedia: (q) => ({ addEventListener: add('mq:' + q), removeEventListener: rem('mq:' + q) }),
    visualViewport: { addEventListener: add('vv'), removeEventListener: rem('vv') },
    requestAnimationFrame: (fn) => queue.push(fn),
    cancelAnimationFrame: () => {
      queue = [];
    },
  };
  return {
    env,
    fire: (t) => [...(subs.get(t) ?? [])].forEach((f) => f()),
    flush: () => {
      const q = queue;
      queue = [];
      q.forEach((f) => f());
    },
    listeners: () => [...subs.values()].reduce((n, s) => n + s.size, 0),
    setDpr: (n) => {
      (env as { devicePixelRatio: number }).devicePixelRatio = n;
    },
  };
}

describe('watchViewport', () => {
  it('coalesces window and visualViewport resizes into one measure per frame', () => {
    const f = fakeEnv();
    const measure = vi.fn();
    watchViewport(f.env, measure);
    f.fire('win');
    f.fire('vv');
    f.fire('win');
    expect(measure).not.toHaveBeenCalled();
    f.flush();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('measures on a dpr change and re-arms for the new ratio', () => {
    const f = fakeEnv();
    const measure = vi.fn();
    watchViewport(f.env, measure);
    f.setDpr(1.6);
    f.fire('mq:(resolution: 1dppx)');
    f.flush();
    expect(measure).toHaveBeenCalledTimes(1);
    // the old query is gone, the new one fires
    f.fire('mq:(resolution: 1dppx)');
    f.flush();
    expect(measure).toHaveBeenCalledTimes(1);
    f.setDpr(2);
    f.fire('mq:(resolution: 1.6dppx)');
    f.flush();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('removes every listener and drops a pending frame on dispose', () => {
    const f = fakeEnv();
    const measure = vi.fn();
    const dispose = watchViewport(f.env, measure);
    f.fire('win');
    dispose();
    f.flush();
    expect(measure).not.toHaveBeenCalled();
    expect(f.listeners()).toBe(0);
  });
});
