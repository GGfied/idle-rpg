import { describe, expect, it } from 'vitest';
import { ISO, LAYERS, isoProjection } from '@render/index';
import { BLOCKED_TEXT, EFFECTS, EVENT_VFX } from './data';
import {
  resolveXpColor,
  ballistic,
  blockedLabel,
  createPool,
  createThrottle,
  diamondPoints,
  effectDepth,
  planEvent,
  resolveEffect,
  stackOffset,
  stackSlot,
} from './logic';

const ctx = {
  playerWorld: { x: 10, y: 20 },
  nodeWorld: (id: string) => (id === 't1' ? { x: 100, y: 200 } : undefined),
};

describe('planEvent', () => {
  it('maps xpGained to an xpDrop at the player', () => {
    expect(planEvent({ type: 'xpGained', skill: 'woodcutting', amount: 25 }, ctx)).toMatchObject([
      { effect: 'xpDrop', x: 10, y: 20 - (EFFECTS.xpDrop?.lift ?? 0) },
    ]);
  });
  it('plays node cues at the node, falling back to the player', () => {
    const lift = EFFECTS.treeFallDust?.lift ?? 0;
    expect(planEvent({ type: 'nodeDepleted', nodeId: 't1' }, ctx)[0]).toMatchObject({
      x: 100,
      y: 200 - lift,
    });
    expect(planEvent({ type: 'nodeDepleted', nodeId: 'nope' }, ctx)[0]).toMatchObject({
      x: 10,
      y: 20 - lift,
    });
  });
  it('levelUp plays two effects; unknown and prototype keys play none', () => {
    expect(planEvent({ type: 'levelUp' }, ctx).map((p) => p.effect)).toEqual([
      'levelUpRing',
      'levelUpSparkle',
    ]);
    expect(planEvent({ type: 'whatever' }, ctx)).toEqual([]);
    expect(planEvent({ type: 'toString' }, ctx)).toEqual([]);
  });
  it('every cue references a defined effect', () => {
    for (const cues of Object.values(EVENT_VFX))
      for (const c of cues) expect(EFFECTS[c.effect]).toBeDefined();
  });
});

describe('xp stacking', () => {
  it('counts only drops inside the window', () => {
    expect(stackSlot([0, 500, 900], 1000, 700)).toBe(2);
    expect(stackSlot([], 1000, 700)).toBe(0);
  });
  it('offsets upward', () => {
    expect(stackOffset(0, 16)).toBe(-0);
    expect(stackOffset(3, 16)).toBe(-48);
  });
});

describe('ballistic', () => {
  it('starts at 0, ends at 1, dips upward in between', () => {
    const e = ballistic(14, 10);
    expect(e(0)).toBe(0);
    expect(e(1)).toBeCloseTo(1);
    expect(e(0.3)).toBeLessThan(0);
  });
});

describe('createPool', () => {
  const make = (cap: number) => {
    let n = 0;
    const log: string[] = [];
    const pool = createPool<{ id: number }>({
      cap,
      create: () => ({ id: n++ }),
      reset: (i) => log.push(`reset${i.id}`),
      dispose: (i) => log.push(`dispose${i.id}`),
    });
    return { pool, log };
  };
  it('reuses released items and never exceeds the cap', () => {
    const { pool } = make(2);
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(pool.totalCount()).toBe(2);
    expect(pool.activeCount()).toBe(2);
  });
  it('recycles the oldest active item when full', () => {
    const { pool, log } = make(2);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.acquire()).toBe(a);
    expect(log).toEqual(['reset0']);
    expect(pool.active()).toEqual([b, a]);
  });
  it('double release is a no-op; destroy disposes everything', () => {
    const { pool, log } = make(2);
    const a = pool.acquire();
    pool.acquire();
    pool.release(a);
    pool.release(a);
    expect(log).toEqual(['reset0']);
    pool.destroy();
    expect(log.filter((l) => l.startsWith('dispose'))).toHaveLength(2);
    expect(pool.totalCount()).toBe(0);
  });
});

describe('gatherStopped blocked effects', () => {
  const stop = (reason: string, extra: object = {}) => ({
    type: 'gatherStopped',
    nodeId: 't1',
    reason,
    ...extra,
  });
  const effects = (reason: string) => planEvent(stop(reason), ctx).map((p) => p.effect);

  it('maps by reason', () => {
    expect(effects('levelTooLow')).toEqual(['blockedCross', 'blockedText']);
    expect(effects('noTool')).toEqual(['blockedCross', 'blockedText']);
    expect(effects('inventoryFull')).toEqual(['blockedText']);
    expect(effects('depleted')).toEqual([]);
    expect(effects('cancelled')).toEqual([]);
    expect(effects('bogus')).toEqual([]);
  });
  it('places the cross at the node and the text at the player', () => {
    const [cross, text] = planEvent(stop('noTool'), ctx);
    expect(cross).toMatchObject({ x: 100, y: 200 - (EFFECTS.blockedCross?.lift ?? 0) });
    expect(text).toMatchObject({ x: 10, y: 20 - (EFFECTS.blockedText?.lift ?? 0) });
    expect(cross?.throttle?.ms).toBe(600);
  });
  it('picks label text with and without requiredLevel', () => {
    expect(blockedLabel(stop('levelTooLow', { requiredLevel: 15 }))).toBe('Level 15 needed');
    expect(blockedLabel(stop('levelTooLow'))).toBe('Level too low');
    expect(blockedLabel(stop('noTool'))).toBe('No axe');
    expect(blockedLabel(stop('noTool', { tool: 'pickaxe' }))).toBe('No pickaxe');
    expect(blockedLabel(stop('inventoryFull'))).toBe('Inventory full');
    expect(blockedLabel(stop('depleted'))).toBeUndefined();
    expect(blockedLabel(stop('toString'))).toBeUndefined();
  });
  it('every blocked label reason has a cue', () => {
    for (const reason of Object.keys(BLOCKED_TEXT))
      expect(effects(reason)).toContain('blockedText');
  });
});

describe('createThrottle', () => {
  it('allows once per window per key', () => {
    const t = createThrottle();
    expect(t.allow('a', 0, 600)).toBe(true);
    expect(t.allow('a', 599, 600)).toBe(false);
    expect(t.allow('b', 100, 600)).toBe(true);
    expect(t.allow('a', 600, 600)).toBe(true);
  });
});

describe('resolveXpColor', () => {
  it('uses the lookup when given', () => {
    expect(resolveXpColor('woodcutting', () => '#8a7a3a', '#fff')).toBe('#8a7a3a');
  });
  it('falls back without a lookup, without a skill, or on an empty result', () => {
    expect(resolveXpColor('woodcutting', undefined, '#fff')).toBe('#fff');
    expect(resolveXpColor('', () => '#123456', '#fff')).toBe('#fff');
    expect(resolveXpColor('x', () => '', '#fff')).toBe('#fff');
  });
});

describe('modes', () => {
  const plan = (type: string, mode: 'on' | 'reduced' | 'off', xpDrops = true, extra = {}) =>
    planEvent({ type, ...extra }, ctx, EVENT_VFX, { mode, xpDrops }).map((p) => p.effect);
  it('on plays everything for an event', () => {
    expect(plan('levelUp', 'on')).toEqual(['levelUpRing', 'levelUpSparkle']);
    expect(plan('itemGathered', 'on')).toEqual(['woodChips']);
  });
  it('off plays nothing', () => {
    for (const t of ['levelUp', 'itemGathered', 'xpGained', 'nodeDepleted']) {
      expect(plan(t, 'off')).toEqual([]);
    }
    expect(resolveEffect('clickMarker', 'off')).toBeUndefined();
  });
  it('reduced drops decorative bursts but keeps ring, xp drop and blocked text', () => {
    expect(plan('levelUp', 'reduced')).toEqual(['levelUpRing']);
    expect(plan('itemGathered', 'reduced')).toEqual([]);
    expect(plan('nodeDepleted', 'reduced')).toEqual([]);
    expect(plan('xpGained', 'reduced')).toEqual(['xpDrop']);
    expect(plan('gatherStopped', 'reduced', true, { reason: 'inventoryFull' })).toEqual([
      'blockedText',
    ]);
  });
  it('reduced shortens kept effects and removes jitter', () => {
    const ring = resolveEffect('levelUpRing', 'reduced');
    expect(ring?.lifeMs).toBeLessThan(600);
    expect(resolveEffect('clickMarker', 'reduced')).toBeDefined();
    const burst = resolveEffect('woodChips', 'on');
    expect(burst).toBeDefined();
    const fake = { b: { ...(EFFECTS.woodChips as object), decorative: false } } as never;
    expect(resolveEffect('b', 'reduced', fake)).toMatchObject({ jitter: 0 });
  });
  it('xpDrops=false suppresses only xp drops', () => {
    expect(plan('xpGained', 'on', false)).toEqual([]);
    expect(plan('levelUp', 'on', false)).toEqual(['levelUpRing', 'levelUpSparkle']);
  });
  it('pool releaseAll empties the active set', () => {
    const pool = createPool({ cap: 3, create: () => ({}), reset: () => {}, dispose: () => {} });
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount()).toBe(0);
  });
});

describe('iso placement and depth', () => {
  const tiles = [
    [0, 0],
    [5, 3],
    [2, 9],
  ] as const;

  it('plays a node effect at the projected tile (lifted by data), depth from that tile', () => {
    for (const [tx, ty] of tiles) {
      const feet = isoProjection.tileToWorld(tx, ty);
      const c = { playerWorld: { x: 0, y: 0 }, nodeWorld: () => feet };
      const p = planEvent({ type: 'itemGathered', nodeId: 'n' }, c)[0];
      expect(p?.x).toBeCloseTo(feet.x);
      expect(p?.y).toBeCloseTo(feet.y - (EFFECTS.woodChips?.lift ?? 0));
      expect(p?.depth).toBeCloseTo(isoProjection.depthFor(tx, ty) + 0.5);
    }
  });

  it('orders ground < entity on the tile < world effect < nearer tile < overhead', () => {
    const f = isoProjection.tileToWorld(4, 4);
    const own = isoProjection.depthFor(4, 4);
    const ground = effectDepth('ground', f.x, f.y);
    const world = effectDepth('world', f.x, f.y);
    expect(ground).toBeLessThan(own);
    expect(world).toBeGreaterThan(own);
    const n = isoProjection.tileToWorld(5, 4);
    expect(effectDepth('ground', n.x, n.y)).toBeGreaterThan(world);
    expect(effectDepth('overhead', f.x, f.y)).toBe(LAYERS.VFX);
    expect(ground).toBeGreaterThan(LAYERS.GROUND_DECOR);
  });

  it('XP drops and level-up sparkles are overhead; chips, cross are world; marker, ring are ground', () => {
    const layers = Object.fromEntries(Object.entries(EFFECTS).map(([k, d]) => [k, d.layer]));
    expect(layers).toMatchObject({
      xpDrop: 'overhead',
      blockedText: 'overhead',
      levelUpSparkle: 'overhead',
      woodChips: 'world',
      blockedCross: 'world',
      clickMarker: 'ground',
      levelUpRing: 'ground',
    });
  });

  it('click marker is an iso-tile diamond (64x32), not a square', () => {
    const def = EFFECTS.clickMarker;
    expect(def?.kind === 'marker' && [def.halfW, def.halfH]).toEqual([
      ISO.tileWidth / 2,
      ISO.tileHeight / 2,
    ]);
    const pts = diamondPoints(32, 16);
    expect(pts).toEqual([
      { x: 0, y: -16 },
      { x: 32, y: 0 },
      { x: 0, y: 16 },
      { x: -32, y: 0 },
    ]);
    // its vertices are the tile's own corners: 2:1 and matching the neighbour offset
    const c = isoProjection.tileToWorld(0, 0);
    const right = isoProjection.tileToWorld(1, 0);
    expect(right.x - c.x).toBe(32);
    expect(right.y - c.y).toBe(16);
  });

  it('pool recycles at the cap and does not leak', () => {
    let made = 0;
    const pool = createPool({ cap: 3, create: () => ++made, reset: () => {}, dispose: () => {} });
    for (let i = 0; i < 20; i++) pool.acquire();
    expect(pool.totalCount()).toBe(3);
    expect(pool.activeCount()).toBe(3);
    pool.releaseAll();
    expect(pool.activeCount()).toBe(0);
    for (let i = 0; i < 20; i++) pool.release(pool.acquire());
    expect(pool.totalCount()).toBe(3);
    expect(made).toBe(3);
  });

  it('off mode plans nothing', () => {
    expect(planEvent({ type: 'levelUp' }, ctx, undefined, { mode: 'off', xpDrops: true })).toEqual(
      [],
    );
  });
});
