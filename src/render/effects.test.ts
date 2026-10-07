import { describe, expect, it, vi } from 'vitest';
import { isoProjection } from './projection';
import { registerEffect, startEffects, tilesInView } from './effects';
import type { EffectContext } from './effects';

const ctx = {} as EffectContext;

describe('effects registry', () => {
  it('runs every hook in registration order and replaces by id', () => {
    const log: string[] = [];
    registerEffect({
      id: 't1',
      onSceneStart: () => log.push('a-start'),
      onFrame: (t) => log.push(`a-${t}`),
    });
    registerEffect({
      id: 't2',
      onChunksChanged: () => log.push('b-chunks'),
      onDestroy: () => log.push('b-destroy'),
    });
    const onFrame = vi.fn();
    registerEffect({ id: 't1', onFrame });
    const r = startEffects(ctx);
    r.frame(5);
    r.chunksChanged({ trees: [] });
    r.destroy();
    expect(onFrame).toHaveBeenCalledWith(5, ctx);
    expect(log).toEqual(['b-chunks', 'b-destroy']);
  });

  it('tilesInView bounds the view without allocating a new rect', () => {
    const out = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const p = isoProjection.tileToWorld(10, 10);
    const r = tilesInView(
      isoProjection,
      { x: p.x - 10, y: p.y - 10, right: p.x + 10, bottom: p.y + 10 },
      out,
    );
    expect(r).toBe(out);
    expect(out.x0).toBeLessThanOrEqual(10);
    expect(out.x1).toBeGreaterThanOrEqual(10);
    expect(out.y0).toBeLessThanOrEqual(10);
    expect(out.y1).toBeGreaterThanOrEqual(10);
  });
});
