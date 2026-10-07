import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '@core/persistence';
import { createRuntime } from '@app/runtime';

/** Any node: every property is a callable, assignable stub (params, gains, oscillators...). */
function anyNode(): unknown {
  const store: Record<string | symbol, unknown> = {};
  const fn = () => anyNode();
  return new Proxy(fn, {
    get: (_t, k) => (k in store ? store[k] : k === 'then' ? undefined : anyNode()),
    set: (_t, k, v) => ((store[k] = v), true),
    apply: () => anyNode(),
  });
}

const contexts: FakeContext[] = [];
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  constructor() {
    contexts.push(this);
    return new Proxy(this, {
      get: (t, k) => (k in t ? (t as never)[k] : (anyNode() as never)),
    });
  }
  resume = vi.fn(async () => {
    if (this.state !== 'closed') this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createBuffer = () => ({ duration: 1, getChannelData: () => new Float32Array(8) });
}

const env = { onHidden: () => () => undefined, onVisible: () => () => undefined };
const live = () => contexts.filter((c) => c.state !== 'closed').length;

describe('runtime audio lifecycle (HMR)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    contexts.length = 0;
    vi.stubGlobal('AudioContext', FakeContext);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function boot() {
    const rt = createRuntime(createMemoryStorage(), env);
    const stop = rt.start();
    rt.audio.setArea('default');
    rt.audio.unlock(); // creates the context and starts the music/ambience scheduler
    return { rt, stop };
  }

  it('dispose closes the context and stops the scheduler; recreate leaves exactly one live', () => {
    const a = boot();
    expect(live()).toBe(1);
    const timersWhileLive = vi.getTimerCount();
    a.stop();
    expect(contexts[0]!.close).toHaveBeenCalled();
    expect(contexts[0]!.state).toBe('closed');
    expect(vi.getTimerCount()).toBeLessThan(timersWhileLive);
    expect(vi.getTimerCount()).toBe(0);
    a.rt.audio.unlock(); // stale listener on the disposed runtime
    expect(contexts).toHaveLength(1);

    const b = boot();
    expect(contexts).toHaveLength(2);
    expect(live()).toBe(1);
    b.stop();
    expect(live()).toBe(0);
  });

  it('a new runtime disposes a leaked one that was never stopped', () => {
    boot(); // HMR copy whose dispose never ran
    boot();
    boot();
    expect(contexts).toHaveLength(3);
    expect(live()).toBe(1);
  });
});
