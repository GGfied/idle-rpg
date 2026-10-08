import { describe, expect, it } from 'vitest';
import {
  createAshesView,
  createFireView,
  createLogPileView,
  FIRE_DYING_INTENSITY,
  FIRE_GLOW_ALPHA,
} from './fireViews';
import {
  ASHES_FRAME,
  FIRE_FRAME,
  FIRE_HALF_W,
  FIRE_TOP,
  FLAME_FRAME,
  FLAME_ROOT_UP,
  GLOW_FRAME,
  paintAshesHeap,
  paintFireBase,
  paintFireEmbers,
  paintFireGlow,
  paintFlameLayer,
  paintLogPile,
} from './fireArt';
import type { FlameTarget } from '@render/animation';
import { hitBoundsFor } from './views';
import { isoProjection } from './projection';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fakeScene() {
  const mk = (): Obj => {
    const o: Obj = {
      x: 0,
      y: 0,
      visible: true,
      depth: 0,
      alpha: 1,
      scale: 1,
      tk: '',
      blend: 'NORMAL',
      children: [],
    };
    for (const m of ['setOrigin', 'setDisplaySize']) o[m] = () => o;
    Object.defineProperty(o, 'texture', { get: () => ({ key: o.tk }) });
    o.setTexture = (k: string) => ((o.tk = k), o);
    o.setVisible = (v: boolean) => ((o.visible = v), o);
    o.setAlpha = (a: number) => ((o.alpha = a), o);
    o.setScale = (s: number) => ((o.scale = s), o);
    o.setBlendMode = (b: string) => ((o.blend = b), o);
    o.setPosition = (x: number, y: number) => ((o.x = x), (o.y = y), o);
    o.setDepth = (d: number) => ((o.depth = d), o);
    o.add = (c: Obj | Obj[]) => o.children.push(...(Array.isArray(c) ? c : [c]));
    o.once = () => o;
    o.destroy = () => (o.destroyed = true);
    return o;
  };
  const textures = new Set<string>();
  return {
    textures,
    scene: {
      textures: {
        exists: (k: string) => textures.has(k),
        createCanvas: (k: string) => {
          textures.add(k);
          return {
            context: {
              createImageData: (w: number, h: number) => ({
                data: new Uint8ClampedArray(w * h * 4),
              }),
              putImageData() {},
            },
            refresh() {},
          };
        },
      },
      add: {
        container: mk,
        image: (_x: number, _y: number, key: string) => Object.assign(mk(), { tk: key }),
      },
      events: { on() {}, off() {}, once() {} },
      cameras: { main: { scrollX: 0, scrollY: 0, zoom: 1, width: 100, height: 100 } },
    } as never,
  };
}

const alphaAt = (d: Uint8ClampedArray, w: number, x: number, y: number): number =>
  d[(y * w + x) * 4 + 3] ?? 0;
function bounds(d: Uint8ClampedArray, w: number, h: number, min = 40) {
  let top = h;
  let left = w;
  let right = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alphaAt(d, w, x, y) >= min)
        [top, left, right] = [Math.min(top, y), Math.min(left, x), Math.max(right, x)];
  return { top, left, right };
}

describe('flame layers (the animation hook)', () => {
  const [outer, inner, core] = (['outer', 'inner', 'core'] as const).map((l) => {
    const d = paintFlameLayer(l);
    return { d, ...bounds(d, FLAME_FRAME.w, FLAME_FRAME.h) };
  }) as [ReturnType<typeof bounds> & { d: Uint8ClampedArray }, ...never[]] &
    Array<ReturnType<typeof bounds> & { d: Uint8ClampedArray }>;

  it('nest: outer is tallest and widest, then inner, then the white-hot core', () => {
    expect(outer!.top).toBeLessThan(inner!.top);
    expect(inner!.top).toBeLessThan(core!.top);
    expect(outer!.right - outer!.left).toBeGreaterThan(inner!.right - inner!.left);
    expect(inner!.right - inner!.left).toBeGreaterThan(core!.right - core!.left);
  });

  it('all layers grow from the same root and stay inside the frame', () => {
    for (const l of [outer!, inner!, core!]) {
      expect(l.top).toBeGreaterThanOrEqual(0);
      expect(alphaAt(l.d, FLAME_FRAME.w, FLAME_FRAME.rootX, FLAME_FRAME.rootY - 2)).toBeGreaterThan(
        100,
      );
    }
  });

  it('colours run orange -> yellow -> white', () => {
    const px = (d: Uint8ClampedArray) => {
      const i = ((FLAME_FRAME.rootY - 6) * FLAME_FRAME.w + FLAME_FRAME.rootX) * 4;
      return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0];
    };
    const [o, y, c] = [px(outer!.d), px(inner!.d), px(core!.d)];
    expect(o[0]).toBeGreaterThan(200);
    expect(o[2]!).toBeLessThan(120); // orange: little blue
    expect(y[1]!).toBeGreaterThan(o[1]!); // yellower
    expect(c[2]!).toBeGreaterThan(200); // white-hot
  });

  it('fire frame heights fit FIRE_TOP', () => {
    expect(FLAME_FRAME.rootY - outer!.top + FLAME_ROOT_UP).toBeLessThanOrEqual(FIRE_TOP);
  });
});

describe('fire pixels', () => {
  it('base: opaque logs, a soft soot ring wider than the logs; dying is charred and differs', () => {
    const lit = paintFireBase(false);
    const dead = paintFireBase(true);
    expect(alphaAt(lit, FIRE_FRAME.w, FIRE_FRAME.feetX, FIRE_FRAME.feetY - 2)).toBe(255);
    const b = bounds(lit, FIRE_FRAME.w, FIRE_FRAME.h, 20);
    expect(b.right - b.left).toBeGreaterThan(36);
    expect(b.right - b.left).toBeLessThanOrEqual(FIRE_HALF_W * 2);
    expect(lit.some((v, i) => v !== dead[i])).toBe(true);
  });
  it('glow is brightest in the middle and clear at the rim; embers are sparse', () => {
    const g = paintFireGlow();
    expect(alphaAt(g, GLOW_FRAME.w, GLOW_FRAME.w / 2, GLOW_FRAME.h / 2)).toBeGreaterThan(120);
    expect(alphaAt(g, GLOW_FRAME.w, 0, 0)).toBe(0);
    const e = paintFireEmbers();
    let lit = 0;
    for (let i = 3; i < e.length; i += 4) if ((e[i] ?? 0) > 0) lit++;
    expect(lit).toBeGreaterThan(4);
    expect(lit).toBeLessThan(FIRE_FRAME.w * FIRE_FRAME.h * 0.2);
  });
  it('ashes: a grey-white heap with dark specks, inside its frame', () => {
    const d = paintAshesHeap();
    let light = 0;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i + 3] ?? 0) < 250) continue;
      const v = ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3;
      if (v > 150) light++;
      if (v < 70) dark++;
    }
    expect(light).toBeGreaterThan(dark * 2);
    expect(dark).toBeGreaterThan(4);
    const b = bounds(d, ASHES_FRAME.w, ASHES_FRAME.h, 200);
    expect(b.left).toBeGreaterThan(0);
    expect(b.right).toBeLessThan(ASHES_FRAME.w - 1);
  });
});

describe('createFireView', () => {
  const tile = { x: 12, y: 9 };

  it('stacks glow, base, flame layers, front log and embers; ADD glow; static art', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    const kids = (v.container as unknown as Obj).children as Obj[];
    expect(kids.map((k) => k.tk || 'flames')).toEqual([
      'fire_glow',
      'fire_base',
      'flames',
      'fire_front',
      'fire_embers',
    ]);
    expect(kids[0]!.blend).toBe('ADD');
    expect(kids[4]!.blend).toBe('ADD');
    expect(v.flames.layers.map((l) => (l as unknown as Obj).tk)).toEqual([
      'fire_flame_outer',
      'fire_flame_inner',
      'fire_flame_core',
    ]);
    expect((v.flames.embers as unknown as Obj).visible).toBe(false);
    expect((v.flames.glow as unknown as Obj).alpha).toBe(FIRE_GLOW_ALPHA.lit);
  });

  it('flameTarget: layers outermost first at the root, glow base follows dying, host is the container', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    const t = v.flameTarget;
    const asAnimationTarget: FlameTarget = t; // compile-time: structurally assignable
    expect(asAnimationTarget).toBe(t);
    expect(t.layers.map((l) => l.node)).toEqual([...v.flames.layers]);
    expect(
      t.layers.every(
        (l) => l.baseX === 0 && l.baseY === 0 && l.baseScaleX === 1 && l.baseAlpha === 1,
      ),
    ).toBe(true);
    expect(t.glow.node).toBe(v.flames.glow);
    expect(t.glow.baseAlpha).toBe(FIRE_GLOW_ALPHA.lit);
    v.setDying(true);
    expect(t.glow.baseAlpha).toBe(FIRE_GLOW_ALPHA.dying);
    expect(t.host).toBe(v.container);
  });

  it('sits on its tile with the shared depth rule', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    const c = isoProjection.tileToWorld(tile.x, tile.y);
    expect([(v.container as unknown as Obj).x, (v.container as unknown as Obj).y]).toEqual([
      c.x,
      c.y,
    ]);
    expect((v.container as unknown as Obj).depth).toBe(isoProjection.depthFor(tile.x, tile.y));
  });

  it('setDying: smaller flames, embers, dim glow, charred base; setDying(false) restores; idempotent', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    v.setDying(true);
    v.setDying(true);
    expect(v.dying).toBe(true);
    expect(v.intensity).toBe(FIRE_DYING_INTENSITY);
    expect((v.flames.root as unknown as Obj).scale).toBe(FIRE_DYING_INTENSITY);
    expect((v.flames.embers as unknown as Obj).visible).toBe(true);
    expect((v.flames.glow as unknown as Obj).alpha).toBe(FIRE_GLOW_ALPHA.dying);
    expect((v.base as unknown as Obj).tk).toBe('fire_base_dying');
    v.setDying(false);
    expect((v.flames.root as unknown as Obj).scale).toBe(1);
    expect((v.flames.embers as unknown as Obj).visible).toBe(false);
    expect((v.base as unknown as Obj).tk).toBe('fire_base');
    expect(v.intensity).toBe(1);
  });

  it('hit box = the shared hit bounds of the tile; hitTest follows it', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    const c = isoProjection.tileToWorld(tile.x, tile.y);
    expect(v.hit).toEqual(hitBoundsFor('fire', c));
    expect(v.hit.y).toBe(c.y - FIRE_TOP);
    expect(v.hitTest(c.x, c.y - 20)).toBe(true);
    expect(v.hitTest(c.x, c.y - FIRE_TOP - 2)).toBe(false);
    expect(v.hitTest(c.x + v.hit.w, c.y)).toBe(false);
  });

  it('uploads each texture once, shared by every fire', () => {
    const { scene, textures } = fakeScene();
    createFireView(scene, tile);
    const n = textures.size;
    createFireView(scene, { x: 3, y: 3 });
    expect(textures.size).toBe(n);
  });

  it('destroy removes the container; ashes sort under things on their tile', () => {
    const { scene } = fakeScene();
    const v = createFireView(scene, tile);
    v.destroy();
    expect((v.container as unknown as Obj).destroyed).toBe(true);
    const a = createAshesView(scene, tile);
    expect((a.container as unknown as Obj).depth).toBeLessThan(
      isoProjection.depthFor(tile.x, tile.y),
    );
  });
});

describe('log pile (shown while lighting)', () => {
  const opaque = (d: Uint8ClampedArray): number => {
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 200) n++;
    return n;
  };
  const meanRed = (d: Uint8ClampedArray): number => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if ((d[i + 3] ?? 0) > 200) [s, n] = [s + (d[i] ?? 0), n + 1];
    return s / n;
  };

  it('is the fire logs: same frame/feet, no flames, no soot, fewer opaque px than the fire base', () => {
    const pile = paintLogPile('logs');
    expect(pile.length).toBe(FIRE_FRAME.w * FIRE_FRAME.h * 4);
    expect(opaque(pile)).toBeGreaterThan(500);
    expect(opaque(pile)).toBeLessThanOrEqual(opaque(paintFireBase(false)));
  });

  it('oak is darker than plain logs; unknown ids fall back to plain logs', () => {
    expect(meanRed(paintLogPile('oak_logs'))).toBeLessThan(meanRed(paintLogPile('logs')));
    expect(paintLogPile('mystery_wood')).toEqual(paintLogPile('logs'));
  });

  it('has no fire light: centre logs stay brown instead of glowing orange', () => {
    const d = paintLogPile('logs');
    let sum = 0;
    let n = 0;
    for (let y = 0; y < FIRE_FRAME.h; y++)
      for (let x = 0; x < FIRE_FRAME.w; x++) {
        const i = (y * FIRE_FRAME.w + x) * 4;
        if ((d[i + 3] ?? 0) > 200 && Math.hypot(x - FIRE_FRAME.feetX, (y - 22) * 2) < 10) {
          sum += (d[i] ?? 0) - (d[i + 2] ?? 0);
          n++;
        }
      }
    expect(n).toBeGreaterThan(50);
    expect(sum / n).toBeLessThan(108); // fire-lit measures ~119, unlit ~99
  });

  it('view: one image from the shared texture, shared between piles, no hit area, depth sorted', () => {
    const { scene, textures } = fakeScene();
    const centre = isoProjection.tileToWorld(10, 7);
    const a = createLogPileView(scene, { x: 10, y: 7 }, 'logs') as never as Obj;
    const b = createLogPileView(scene, { x: 11, y: 7 }, 'logs') as never as Obj;
    const o = createLogPileView(scene, { x: 10, y: 8 }, 'oak_logs') as never as Obj;
    expect(a.container.children).toHaveLength(1);
    expect(a.container.children[0].tk).toBe('logpile_logs');
    expect(o.container.children[0].tk).toBe('logpile_oak_logs');
    expect([...textures].filter((k) => k.startsWith('logpile_')).sort()).toEqual([
      'logpile_logs',
      'logpile_oak_logs',
    ]);
    expect(a.hit).toBeUndefined();
    expect(a.hitTest).toBeUndefined();
    expect(a.container.x).toBe(centre.x);
    expect(b.container.depth).toBeGreaterThan(a.container.depth);
    a.destroy();
    expect(a.container.destroyed).toBe(true);
  });
});
