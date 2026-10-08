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
  tintFor,
  towards,
  lighten,
} from './logic';
import { ROCK_LOOKS } from '@render/index';

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
    expect(effects('noBait')).toEqual(['blockedText']);
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
    expect(blockedLabel(stop('noBait'))).toBe('No bait');
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
    expect(plan('itemGathered', 'on', true, { skill: 'woodcutting' })).toEqual(['logPuff']);
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
      const p = planEvent({ type: 'itemGathered', skill: 'woodcutting', nodeId: 'n' }, c)[0];
      expect(p?.x).toBeCloseTo(feet.x);
      expect(p?.y).toBeCloseTo(feet.y - (EFFECTS.logPuff?.lift ?? 0));
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

const names = (e: Parameters<typeof planEvent>[0], c = ctx) => planEvent(e, c).map((p) => p.effect);
const spotCtx = {
  ...ctx,
  nodeWorld: (id: string) => (id === 'n1' || id === 's1' ? { x: 100, y: 200 } : undefined),
  tileWorld: (id: string, i: number) => (id === 's1' ? { x: 10 * i, y: 5 * i } : undefined),
};

describe('skill-filtered cues', () => {
  it('mining never plays wood or tree effects, and vice versa', () => {
    const mining = [
      ...names({ type: 'swingImpact', skill: 'mining', nodeId: 'n1' }),
      ...names({ type: 'itemGathered', skill: 'mining', nodeId: 'n1', itemId: 'tin_ore' }),
      ...names({ type: 'nodeDepleted', skill: 'mining', nodeId: 'n1' }),
    ];
    expect(mining).toEqual(['rockDust', 'stoneChips', 'oreSparkle', 'rockBurst', 'rockPebbles']);
    const wood = [
      ...names({ type: 'swingImpact', skill: 'woodcutting', nodeId: 'n1' }),
      ...names({ type: 'itemGathered', skill: 'woodcutting', nodeId: 'n1' }),
      ...names({ type: 'nodeDepleted', nodeId: 'n1' }),
    ];
    expect(wood).toEqual([
      'woodChips',
      'barkFlakes',
      'leafDrift',
      'logPuff',
      'treeFallDust',
      'leafBurst',
    ]);
    expect(wood.join()).not.toMatch(/rock|stone|ore/);
  });
  it('an untagged swing counts as woodcutting', () => {
    expect(names({ type: 'swingImpact', nodeId: 'n1' })).toContain('woodChips');
  });
  it('fishing plays water effects only', () => {
    expect(names({ type: 'fishingStarted', spotId: 's1' }, spotCtx)).toEqual([
      'castSplash',
      'castRing',
    ]);
    expect(names({ type: 'itemGathered', skill: 'fishing', nodeId: 's1' }, spotCtx)).toEqual([
      'catchSplash',
      'catchRing',
    ]);
  });
});

describe('fishing spotMoved ripples', () => {
  it('plays rings at the from and to tiles', () => {
    const p = planEvent({ type: 'spotMoved', spotId: 's1', from: 1, to: 3 }, spotCtx);
    expect(p.map((x) => [x.effect, x.x])).toEqual([
      ['spotRipple', 10],
      ['spotRippleOuter', 10],
      ['spotRipple', 30],
      ['spotRippleOuter', 30],
    ]);
  });
  it('skips unresolved tiles instead of falling back to the player', () => {
    expect(planEvent({ type: 'spotMoved', spotId: 'zz', from: 1, to: 2 }, spotCtx)).toEqual([]);
    expect(planEvent({ type: 'spotMoved', spotId: 's1', from: 'a', to: 2 }, spotCtx).length).toBe(
      2,
    );
  });
});

describe('ore tint and anchors', () => {
  it('tints the sparkle from the rock art ore colour', () => {
    const p = planEvent(
      { type: 'itemGathered', skill: 'mining', nodeId: 'n1', itemId: 'iron_ore' },
      ctx,
    );
    expect(p[0]?.tint).toBe(ROCK_LOOKS.iron_rock.ore);
    expect(tintFor('unknown')).toBeUndefined();
    expect(tintFor('toString')).toBeUndefined();
  });
  it('tints coal and runs rock dust for coal_rock impacts', () => {
    const g = planEvent(
      { type: 'itemGathered', skill: 'mining', nodeId: 'n1', itemId: 'coal' },
      ctx,
    );
    expect(g[0]?.tint).toBe(ROCK_LOOKS.coal_rock.ore);
    expect(g[0]?.tint).toBeDefined();
  });
  it('lighten blends toward white', () => {
    expect(lighten(0x000000, 1)).toBe(0xffffff);
    expect(lighten(0x102030, 0)).toBe(0x102030);
  });
  it('towards moves toward the player but never past it', () => {
    expect(towards({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
    expect(towards({ x: 0, y: 0 }, { x: 2, y: 0 }, 4)).toEqual({ x: 2, y: 0 });
    expect(towards({ x: 1, y: 1 }, { x: 1, y: 1 }, 4)).toEqual({ x: 1, y: 1 });
  });
  it('axe chips sit toward the player side of the trunk', () => {
    const p = planEvent(
      { type: 'swingImpact', nodeId: 'n1' },
      { ...spotCtx, playerWorld: { x: 0, y: 200 } },
    );
    expect(p[0]?.x).toBeLessThan(100);
    expect(p[2]?.x).toBe(100); // leaves fall from the canopy centre
  });
});

describe('modes with the new effects', () => {
  it('reduced mode keeps rings, drops decorative bursts; off plays nothing', () => {
    const ev = { type: 'spotMoved', spotId: 's1', from: 1, to: 2 };
    expect(planEvent(ev, spotCtx, EVENT_VFX, { mode: 'reduced', xpDrops: true }).length).toBe(4);
    expect(
      planEvent({ type: 'swingImpact', skill: 'mining', nodeId: 'n1' }, ctx, EVENT_VFX, {
        mode: 'reduced',
        xpDrops: true,
      }),
    ).toEqual([]);
    expect(planEvent(ev, spotCtx, EVENT_VFX, { mode: 'off', xpDrops: true })).toEqual([]);
  });
  it('xpGained drops for mining and fishing like woodcutting', () => {
    for (const skill of ['woodcutting', 'mining', 'fishing'])
      expect(names({ type: 'xpGained', skill, amount: 5 })).toEqual(['xpDrop']);
  });
});

describe('pool reuse under the new bursts', () => {
  it('a burst larger than the cap recycles instead of growing', () => {
    let made = 0;
    const pool = createPool({
      cap: 4,
      create: () => ({ n: made++ }),
      reset: () => {},
      dispose: () => {},
    });
    for (let i = 0; i < 12; i++) pool.acquire();
    expect(pool.totalCount()).toBe(4);
    expect(pool.activeCount()).toBe(4);
  });
});
