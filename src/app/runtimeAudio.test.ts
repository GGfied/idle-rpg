import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '@core/persistence';
import type * as AudioModule from '@audio/index';
import type { RuntimeEnv } from '@app/runtime';

const unlockCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock('@audio/index', async (orig) => {
  const real = await orig<typeof AudioModule>();
  return {
    ...real,
    createAudio: (...a: Parameters<typeof real.createAudio>) => {
      const audio = real.createAudio(...a);
      return {
        ...audio,
        unlock: () => {
          unlockCalls.n++;
          audio.unlock();
        },
      };
    },
  };
});

describe('audio is only created by a user gesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    unlockCalls.n = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('pageshow/visible before any gesture never unlocks; after a gesture it resumes', async () => {
    const { createRuntime } = await import('@app/runtime');
    const visible: (() => void)[] = [];
    const env: RuntimeEnv = {
      onHidden: () => () => undefined,
      onVisible: (cb) => {
        visible.push(cb);
        return () => undefined;
      },
    };
    const rt = createRuntime(createMemoryStorage(), env);
    const stop = rt.start();
    visible.forEach((cb) => cb()); // pageshow at boot
    expect(unlockCalls.n).toBe(0);
    rt.audio.unlock(); // first pointerdown / keydown
    expect(unlockCalls.n).toBe(1);
    visible.forEach((cb) => cb()); // tab visible again
    expect(unlockCalls.n).toBe(2);
    stop();
  });
});
