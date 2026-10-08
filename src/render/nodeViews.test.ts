import { describe, expect, it } from 'vitest';
import { createNodeView, NODE_IDLE } from './nodeViews';
import { SPOT_FRAMES } from './spotArt';
import { isoProjection } from './projection';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fakeScene() {
  const mk = (): Obj => {
    const o: Obj = { x: 0, y: 0, visible: true, depth: 0, alpha: 1, tk: '', children: [] };
    o.setOrigin = () => o;
    Object.defineProperty(o, 'texture', { get: () => ({ key: o.tk }) });
    o.setTexture = (k: string) => ((o.tk = k), o);
    o.setVisible = (v: boolean) => ((o.visible = v), o);
    o.setAlpha = (a: number) => ((o.alpha = a), o);
    o.setBlendMode = () => o;
    o.setPosition = (x: number, y: number) => ((o.x = x), (o.y = y), o);
    o.setDepth = (d: number) => ((o.depth = d), o);
    o.add = (c: Obj) => o.children.push(c);
    o.once = () => o;
    o.destroy = () => (o.destroyed = true);
    return o;
  };
  const textures = new Set<string>();
  const listeners = new Map<string, Set<(...a: number[]) => void>>();
  const scene = {
    time: { now: 0 },
    textures: {
      exists: (k: string) => textures.has(k),
      createCanvas: (k: string) => {
        textures.add(k);
        return {
          context: {
            createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData() {},
          },
          refresh() {},
        };
      },
    },
    add: {
      container: mk,
      image: (_x: number, _y: number, key: string) =>
        ((): Obj => {
          const o = mk();
          o.tk = key;
          return o;
        })(),
    },
    events: {
      on: (e: string, f: (...a: number[]) => void) => {
        if (!listeners.has(e)) listeners.set(e, new Set());
        listeners.get(e)!.add(f);
      },
      off: (e: string, f: (...a: number[]) => void) => listeners.get(e)?.delete(f),
      once() {},
    },
    cameras: { main: { scrollX: 0, scrollY: 0, zoom: 1, width: 100, height: 100 } },
  };
  return { scene: scene as never, raw: scene, listeners, textures };
}

const feet = isoProjection.tileToWorld(12, 9);

describe('createNodeView', () => {
  it('rock: full -> rubble swap and back, per-kind textures', () => {
    const { scene } = fakeScene();
    const copper = createNodeView(scene, 'copper_rock', { idle: false });
    const tin = createNodeView(scene, 'tin_rock', { idle: false });
    copper.setWorldPosition(feet.x, feet.y);
    tin.setWorldPosition(feet.x, feet.y);
    const full = (copper.art as unknown as Obj).tk as string;
    expect(full).toMatch(/^rock_copper_rock_\d$/);
    expect((tin.art as unknown as Obj).tk).toMatch(/^rock_tin_rock_\d$/);
    copper.setDepleted(true);
    expect((copper.art as unknown as Obj).tk).toBe(`${full}_rubble`);
    copper.setDepleted(false);
    expect((copper.art as unknown as Obj).tk).toBe(full);
  });

  it('rock look is fixed per tile (variant from the tile hash)', () => {
    const { scene } = fakeScene();
    const keys = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const v = createNodeView(scene, 'iron_rock', { idle: false });
      const f = isoProjection.tileToWorld(i, 2 * i + 1);
      v.setWorldPosition(f.x, f.y);
      keys.add((v.art as unknown as Obj).tk);
      const again = createNodeView(scene, 'iron_rock', { idle: false });
      again.setWorldPosition(f.x, f.y);
      expect((again.art as unknown as Obj).tk).toBe((v.art as unknown as Obj).tk);
    }
    expect(keys.size).toBeGreaterThan(1);
  });

  it('spot: depleted hides the art (the spot moved); idle picks ripple frames', () => {
    const { scene, raw } = fakeScene();
    const v = createNodeView(scene, 'net_spot', { idle: false });
    v.setWorldPosition(feet.x, feet.y);
    const seen = new Set<string>();
    for (let t = 0; t < NODE_IDLE.spotLoopMs; t += 40) {
      v.setIdle(t);
      seen.add((v.art as unknown as Obj).tk);
    }
    expect(seen.size).toBe(SPOT_FRAMES);
    v.setDepleted(true);
    expect((v.art as unknown as Obj).visible).toBe(false);
    const before = (v.art as unknown as Obj).tk;
    v.setIdle(5000);
    expect((v.art as unknown as Obj).tk).toBe(before); // frozen while gone
    v.setDepleted(false);
    expect((v.art as unknown as Obj).visible).toBe(true);
    expect(raw.time.now).toBe(0);
  });

  it('spot sorts under things on its own tile', () => {
    const { scene } = fakeScene();
    const v = createNodeView(scene, 'bait_spot', { idle: false });
    v.setWorldPosition(feet.x, feet.y);
    expect((v.container as unknown as Obj).depth).toBeLessThan(isoProjection.depthFor(12, 9));
  });

  it('rock glint twinkles on a vein and is off when depleted', () => {
    const { scene } = fakeScene();
    const v = createNodeView(scene, 'copper_rock', { idle: false });
    v.setWorldPosition(feet.x, feet.y);
    const glint = (v.container as unknown as Obj).children[1] as Obj;
    let peak = 0;
    for (let t = 0; t < NODE_IDLE.glintPeriodMs * 2; t += 50) {
      v.setIdle(t);
      peak = Math.max(peak, glint.alpha);
    }
    expect(peak).toBeGreaterThan(0.9);
    v.setDepleted(true);
    expect(glint.alpha).toBe(0);
    v.setIdle(100);
    expect(glint.alpha).toBe(0);
  });

  it('self-driven idle listens on update and is removed on destroy; idle:false never listens', () => {
    const { scene, listeners } = fakeScene();
    const quiet = createNodeView(scene, 'net_spot', { idle: false });
    expect(listeners.get('update')?.size ?? 0).toBe(0);
    quiet.destroy();
    const v = createNodeView(scene, 'net_spot');
    expect(listeners.get('update')?.size).toBe(1);
    v.destroy();
    expect(listeners.get('update')?.size).toBe(0);
  });
});
