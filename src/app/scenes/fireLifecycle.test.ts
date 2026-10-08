import { describe, expect, it } from 'vitest';
import { LIGHT_TICKS as FAC_LIGHT_TICKS } from '@features/facilities';
import { TICKS_PER_COOK as COOK_TICKS } from '@features/skills/cooking';
import {
  LIGHT_TICKS as ANIM_LIGHT_TICKS,
  TICKS_PER_COOK as ANIM_COOK_TICKS,
} from '@render/animation';
import type { FlameTarget } from '@render/animation';
import type { FireState } from '@features/facilities';
import { createFireLifecycle, isDying } from '@app/scenes/fireLifecycle';

const fire = (id: string, expiresAtTick: number): FireState => ({
  id,
  tile: { x: 3, y: 4 },
  logsId: 'logs',
  expiresAtTick,
});

function rig() {
  const log: string[] = [];
  const lifecycle = createFireLifecycle(
    (tile) => {
      const target: FlameTarget = { layers: [] };
      log.push(`make ${tile.x},${tile.y}`);
      return {
        flameTarget: target,
        setDying: (d: boolean) => log.push(`view.dying ${d}`),
        destroy: () => log.push('view.destroy'),
      };
    },
    {
      add: (id) => log.push(`flicker.add ${id}`),
      setDying: (id, d) => log.push(`flicker.dying ${id} ${d}`),
      remove: (id) => log.push(`flicker.remove ${id}`),
    },
    (logsId) => (logsId === 'logs' ? 100 : undefined),
  );
  return { lifecycle, log };
}

describe('fire view lifecycle', () => {
  it('creates on lit, goes dying in the last 10%, then burns out without leaking', () => {
    const { lifecycle, log } = rig();
    lifecycle.sync([fire('f1', 100)], 0);
    expect(log).toEqual(['make 3,4', 'flicker.add f1']);
    lifecycle.sync([fire('f1', 100)], 89);
    expect(log).toHaveLength(2);
    lifecycle.sync([fire('f1', 100)], 90);
    expect(log.slice(2)).toEqual(['view.dying true', 'flicker.dying f1 true']);
    lifecycle.sync([fire('f1', 100)], 95);
    expect(log).toHaveLength(4);
    lifecycle.sync([], 100);
    expect(log.slice(4)).toEqual(['flicker.remove f1', 'view.destroy']);
    expect(lifecycle.count()).toBe(0);
  });

  it('destroy() removes every flicker entry before its view', () => {
    const { lifecycle, log } = rig();
    lifecycle.sync([fire('a', 100), fire('b', 100)], 0);
    log.length = 0;
    lifecycle.destroy();
    expect(log).toEqual(['flicker.remove a', 'view.destroy', 'flicker.remove b', 'view.destroy']);
  });

  it('an unknown log id never dies early', () => {
    expect(isDying(fire('x', 1), 0, 0)).toBe(false);
  });
});

describe('log pile while lighting', () => {
  const lighting = { tile: { x: 3, y: 4 }, logsId: 'logs' };
  function pileRig() {
    const log: string[] = [];
    const lc = createFireLifecycle(
      (tile) => {
        log.push(`fire.make ${tile.x},${tile.y}`);
        return {
          flameTarget: { layers: [] },
          setDying: () => {},
          destroy: () => log.push('fire.destroy'),
        };
      },
      { add: () => {}, setDying: () => {}, remove: () => {} },
      () => 100,
      (tile, logsId) => {
        log.push(`pile.make ${tile.x},${tile.y} ${logsId}`);
        return { destroy: () => log.push('pile.destroy') };
      },
    );
    return { lc, log };
  }

  it('shows one pile on the target tile for the logs being lit, not one per sync', () => {
    const { lc, log } = pileRig();
    lc.sync([], 1, lighting);
    lc.sync([], 2, lighting);
    expect(log).toEqual(['pile.make 3,4 logs']);
  });

  it('swaps the pile for the fire in the same sync when it lights', () => {
    const { lc, log } = pileRig();
    lc.sync([], 1, lighting);
    log.length = 0;
    lc.sync([fire('f1', 200)], 2, null);
    expect(log).toEqual(['fire.make 3,4', 'pile.destroy']);
  });

  it('removes the pile on cancel and leaks nothing on destroy', () => {
    const { lc, log } = pileRig();
    lc.sync([], 1, lighting);
    lc.sync([], 2, null);
    expect(log).toEqual(['pile.make 3,4 logs', 'pile.destroy']);
    lc.sync([], 3, lighting);
    lc.destroy();
    expect(log.filter((l) => l === 'pile.destroy')).toHaveLength(2);
    lc.destroy();
    expect(log.filter((l) => l === 'pile.destroy')).toHaveLength(2);
  });

  it('a different logs id replaces the pile', () => {
    const { lc, log } = pileRig();
    lc.sync([], 1, lighting);
    lc.sync([], 2, { ...lighting, logsId: 'oak_logs' });
    expect(log).toEqual(['pile.make 3,4 logs', 'pile.destroy', 'pile.make 3,4 oak_logs']);
  });
});

describe('animation mirrors', () => {
  it('LIGHT_TICKS and TICKS_PER_COOK match the owning features', () => {
    expect(ANIM_LIGHT_TICKS).toBe(FAC_LIGHT_TICKS);
    expect(ANIM_COOK_TICKS).toBe(COOK_TICKS);
  });
});
