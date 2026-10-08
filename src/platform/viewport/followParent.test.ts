import { describe, expect, it } from 'vitest';
import { followParentSize, remeasureScale } from './followParent';
import type { FollowEnv } from './followParent';

function makeEnv() {
  const frames = new Map<number, () => void>();
  let id = 0;
  let fire: () => void = () => {};
  const observed: unknown[] = [];
  let disconnected = false;
  const env: FollowEnv = {
    ResizeObserver: class {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe(el: unknown) {
        observed.push(el);
      }
      disconnect() {
        disconnected = true;
      }
    },
    requestAnimationFrame: (fn) => {
      frames.set(++id, fn);
      return id;
    },
    cancelAnimationFrame: (i) => void frames.delete(i),
  };
  const flush = () => {
    const all = [...frames.values()];
    frames.clear();
    all.forEach((f) => f());
  };
  return { env, fire: () => fire(), flush, observed, isDisconnected: () => disconnected };
}

function makeScale() {
  const calls: string[] = [];
  return {
    calls,
    scale: {
      getParentBounds: () => (calls.push('bounds'), true),
      refresh: () => void calls.push('refresh'),
    },
  };
}

describe('remeasureScale', () => {
  it('re-reads the parent bounds before refreshing (refresh alone uses the stale size)', () => {
    const { scale, calls } = makeScale();
    remeasureScale(scale);
    expect(calls).toEqual(['bounds', 'refresh']);
  });
});

describe('followParentSize', () => {
  it('observes the parent and re-measures once per frame for a burst of resizes', () => {
    const e = makeEnv();
    const { scale, calls } = makeScale();
    const parent = {};
    followParentSize(parent, scale, e.env);
    expect(e.observed).toEqual([parent]);
    e.fire();
    e.fire();
    e.fire();
    expect(calls).toEqual([]);
    e.flush();
    expect(calls).toEqual(['bounds', 'refresh']);
  });

  it('dispose cancels a pending frame and disconnects the observer', () => {
    const e = makeEnv();
    const { scale, calls } = makeScale();
    const dispose = followParentSize({}, scale, e.env);
    e.fire();
    dispose();
    e.flush();
    expect(calls).toEqual([]);
    expect(e.isDisconnected()).toBe(true);
  });

  it('is a no-op without ResizeObserver', () => {
    const e = makeEnv();
    delete e.env.ResizeObserver;
    expect(() => followParentSize({}, makeScale().scale, e.env)()).not.toThrow();
  });
});
