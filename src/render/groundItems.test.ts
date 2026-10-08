import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemIconIds, itemIconSource, itemIconUrl } from './itemIcons';
import {
  hitDistance,
  MAX_PILE,
  PILE_OFFSETS,
  planPiles,
  qtyBadge,
  type GroundItemLike,
} from './groundItemModel';
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
  return { scene: scene as never, containers, tweens, handlers, textures };
}

describe('createGroundItemViews', () => {
  it('draws, depth-sorts, pools and hit-tests', () => {
    const { scene, containers } = fakeScene();
    const v = createGroundItemViews(scene, isoProjection, {
      motion: () => 'off',
      iconSource: () => undefined,
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
      iconSource: () => undefined,
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
      iconSource: () => undefined,
    }).sync([it_('a', 1, 1)]);
    expect(on.tweens).toHaveLength(1);
    const off = fakeScene();
    createGroundItemViews(off.scene, isoProjection, {
      motion: () => 'off',
      iconSource: () => undefined,
    }).sync([it_('a', 1, 1)]);
    expect(off.tweens).toHaveLength(0);
  });
});

describe('one icon source per item (inventory === bank === ground)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has art for every item the game defines (ids kept in sync with the features)', () => {
    // render may not import features: the list is the registered item ids that need icons.
    const IDS = [
      'logs',
      'oak_logs',
      'bronze_axe',
      'iron_axe',
      'coal',
      'copper_ore',
      'tin_ore',
      'iron_ore',
      'bronze_pickaxe',
      'iron_pickaxe',
      'steel_pickaxe',
      'raw_shrimp',
      'raw_anchovies',
      'raw_sardine',
      'raw_herring',
      'raw_trout',
      'raw_mackerel',
      'small_fishing_net',
      'fishing_rod',
      'fishing_bait',
    ];
    expect(itemIconIds()).toEqual([...IDS].sort());
  });

  it('the ground view loads exactly the URL the inventory/bank slots use, under the shared key', () => {
    for (const id of itemIconIds()) {
      const loaded: string[] = [];
      vi.stubGlobal(
        'Image',
        class {
          onload: (() => void) | null = null;
          set src(u: string) {
            loaded.push(u);
            this.onload?.();
          }
        },
      );
      const { scene, textures } = fakeScene();
      createGroundItemViews(scene, isoProjection, { motion: () => 'off' }).sync([
        it_('a', 1, 1, 1, id),
      ]);
      // ItemSlot (inventory, bank, shops) and the drag ghost call itemIconUrl(id).
      expect(loaded, id).toContain(itemIconUrl(id));
      expect(
        loaded.filter((u) => u === itemIconUrl(id)),
        id,
      ).toHaveLength(1);
      expect(textures.has(itemIconSource(id)!.key), id).toBe(true);
    }
  });
});

describe('drops are visible beside the player', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pile slots sit on the front half of the tile, inside the diamond, and apart', () => {
    expect(PILE_OFFSETS).toHaveLength(MAX_PILE);
    for (const o of PILE_OFFSETS) {
      expect(o.y).toBeGreaterThan(0); // south of the feet, not under them
      expect(Math.abs(o.x)).toBeLessThanOrEqual(32 * (1 - o.y / 16)); // on the tile diamond
    }
    expect(new Set(PILE_OFFSETS.map((o) => `${o.x},${o.y}`)).size).toBe(MAX_PILE);
    // At least one slot clears the player's ~9 px half-width body.
    expect(PILE_OFFSETS.filter((o) => Math.abs(o.x) > 9).length).toBeGreaterThanOrEqual(2);
  });

  it('drawn piles are offset from the tile centre but the tap target stays on the tile', () => {
    const { scene, containers } = fakeScene();
    const v = createGroundItemViews(scene, isoProjection, {
      motion: () => 'off',
      iconSource: () => undefined,
    });
    v.sync([it_('a', 4, 4), it_('b', 4, 4), it_('c', 4, 4)]);
    const w = isoProjection.tileToWorld(4, 4);
    for (const c of containers) expect(c.y).toBeGreaterThan(w.y);
    expect(v.hitTest(w.x, w.y)).not.toBeNull();
  });

  it('every icon texture exists before the first drop', () => {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        set src(_u: string) {
          this.onload?.();
        }
      },
    );
    const { scene, textures } = fakeScene();
    createGroundItemViews(scene, isoProjection, { motion: () => 'off' });
    for (const id of itemIconIds()) expect(textures.has(itemIconSource(id)!.key), id).toBe(true);
  });
});
