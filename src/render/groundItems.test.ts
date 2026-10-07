import { describe, expect, it } from 'vitest';
import { hitDistance, MAX_PILE, planPiles, qtyBadge, type GroundItemLike } from './groundItemModel';
import { createGroundItemViews } from './groundItemViews';
import { isoProjection } from './projection';

const it_ = (id: string, x: number, y: number, qty = 1, itemId = 'logs'): GroundItemLike => ({
  id,
  itemId,
  qty,
  x,
  y,
});

describe('planPiles', () => {
  it('gives items on one tile distinct slots, ordered by id, and caps at MAX_PILE', () => {
    const items = [
      it_('g10', 1, 1),
      it_('g2', 1, 1),
      it_('g3', 1, 1),
      it_('g4', 1, 1),
      it_('g5', 2, 2),
    ];
    const plan = planPiles(items);
    expect([...plan.keys()].sort()).toEqual(['g2', 'g3', 'g4', 'g5']);
    expect(plan.get('g2')!.slot).toBe(0);
    expect(plan.get('g3')!.slot).toBe(1);
    expect(plan.get('g4')!.slot).toBe(2);
    expect(plan.get('g5')!.slot).toBe(0);
    expect(MAX_PILE).toBe(3);
  });
  it('does not mix tiles whose coordinates would collide in a naive key', () => {
    const plan = planPiles([it_('a', 0, 65536 - 1), it_('b', 1, 0)]);
    expect(plan.get('a')!.slot).toBe(0);
    expect(plan.get('b')!.slot).toBe(0);
  });
  it('reuses and clears the output map', () => {
    const out = new Map();
    planPiles([it_('a', 0, 0)], out);
    planPiles([it_('b', 0, 0)], out);
    expect([...out.keys()]).toEqual(['b']);
  });
});

describe('qtyBadge', () => {
  it.each([
    [1, ''],
    [0, ''],
    [2, '2'],
    [9999, '9999'],
    [10_000, '10k'],
    [999_999, '999k'],
    [1_000_000, '1M'],
    [2_500_000, '2M'],
  ])('%i -> %j', (q, s) => expect(qtyBadge(q)).toBe(s));
});

describe('hitDistance', () => {
  it('is 0 at the centre, 1 at the edge, and >1 outside', () => {
    expect(hitDistance(5, 5, 5, 5)).toBe(0);
    expect(hitDistance(35, 5, 5, 5)).toBeCloseTo(1);
    expect(hitDistance(5, 5 + 25, 5, 5)).toBeGreaterThan(1);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeObj = Record<string, any>;

// A minimal fake scene: just what the views touch.
function fakeScene() {
  const mk = (extra: object = {}) => {
    const o: Record<string, unknown> = {
      x: 0,
      y: 0,
      visible: true,
      active: true,
      destroyed: false,
      depth: 0,
      ...extra,
    };
    const self = o as FakeObj;
    self.setDisplaySize = () => self;
    self.setOrigin = () => self;
    self.setTexture = (k: string) => ((self.texture = k), self);
    self.setText = (t: string) => ((self.text = t), self);
    self.setVisible = (v: boolean) => ((self.visible = v), self);
    self.setActive = (v: boolean) => ((self.active = v), self);
    self.setPosition = (x: number, y: number) => ((self.x = x), (self.y = y), self);
    self.setDepth = (d: number) => ((self.depth = d), self);
    self.destroy = () => (self.destroyed = true);
    self.setScrollFactor = () => self;
    self.once = () => self;
    return self;
  };
  const containers: FakeObj[] = [];
  const tweens: unknown[] = [];
  const textures = new Set<string>();
  const handlers: (() => void)[] = [];
  const scene = {
    textures: {
      exists: (k: string) => textures.has(k),
      createCanvas: (k: string) => {
        textures.add(k);
        return {
          getContext: () =>
            new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }),
          refresh() {},
        };
      },
    },
    add: {
      image: () => mk(),
      text: () => mk(),
      container: () => {
        const c = mk();
        containers.push(c);
        return c;
      },
    },
    tweens: { add: (t: unknown) => (tweens.push(t), { stop() {} }) },
    events: {
      on: (e: string, f: () => void) => {
        if (e === 'postupdate') handlers.push(f);
      },
      off() {},
      once() {},
    },
    cameras: { main: { scrollX: 0, scrollY: 0, zoom: 1, width: 100, height: 100 } },
  };
  return { scene: scene as never, containers, tweens, handlers };
}

describe('createGroundItemViews', () => {
  it('draws, depth-sorts, pools and hit-tests', () => {
    const { scene, containers } = fakeScene();
    const v = createGroundItemViews(scene, isoProjection, {
      motion: () => 'off',
      iconUrl: () => undefined,
    });
    v.sync([it_('a', 3, 3), it_('b', 3, 3, 5), it_('c', 6, 6)]);
    expect(containers).toHaveLength(3);
    const [a, b, c] = containers;
    expect(c!.depth).toBeGreaterThan(a!.depth);
    expect(b!.depth).toBeGreaterThan(a!.depth); // later slot on the same tile draws on top
    // Under a figure on the same tile.
    expect(a!.depth).toBeLessThan(isoProjection.depthFor(3, 3));

    const w = isoProjection.tileToWorld(6, 6);
    expect(v.hitTest(w.x, w.y)).toBe('c');
    expect(v.hitTest(w.x + 500, w.y)).toBeNull();

    // Removing one releases its container; adding another reuses it (no new containers).
    v.sync([it_('a', 3, 3), it_('b', 3, 3, 5)]);
    expect(c!.visible).toBe(false);
    expect(v.hitTest(w.x, w.y)).toBeNull();
    v.sync([it_('a', 3, 3), it_('b', 3, 3, 5), it_('d', 8, 8)]);
    expect(containers).toHaveLength(3);
    expect(c!.visible).toBe(true);
    v.destroy();
    expect(containers.every((x) => x.destroyed)).toBe(true);
  });
  it('a released (pooled) view is not re-shown by the camera cull', () => {
    const { scene, containers, handlers } = fakeScene();
    const v = createGroundItemViews(scene, isoProjection, {
      motion: () => 'off',
      iconUrl: () => undefined,
    });
    v.sync([it_('a', 0, 0)]);
    v.sync([]);
    const w = isoProjection.tileToWorld(0, 0);
    const cam = (scene as unknown as { cameras: { main: { scrollX: number; scrollY: number } } })
      .cameras.main;
    cam.scrollX = w.x - 50;
    cam.scrollY = w.y - 50;
    for (const h of handlers) h();
    expect(containers[0]!.visible).toBe(false);
  });
  it('plays the drop tween only with animations on', () => {
    const on = fakeScene();
    createGroundItemViews(on.scene, isoProjection, {
      motion: () => 'on',
      iconUrl: () => undefined,
    }).sync([it_('a', 1, 1)]);
    expect(on.tweens).toHaveLength(1);
    const off = fakeScene();
    createGroundItemViews(off.scene, isoProjection, {
      motion: () => 'off',
      iconUrl: () => undefined,
    }).sync([it_('a', 1, 1)]);
    expect(off.tweens).toHaveLength(0);
  });
});
