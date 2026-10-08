import { describe, expect, it } from 'vitest';
import { createBuildingRenderer, wallKey } from './buildingRenderer';
import {
  lookOf,
  roofTrim,
  createFade,
  FRONT_WALL_INSIDE_ALPHA,
  isInside,
  planBuilding,
  roofFaces,
  type BuildingSource,
} from './buildingModel';
import { isoProjection } from './projection';

const BANK: BuildingSource = {
  id: 'bank',
  rect: { x: 10, y: 10, w: 6, h: 5 },
  doors: [{ x: 12, y: 14 }],
  roof: 'tile',
};

class FakeObj {
  alpha = 1;
  visible = true;
  depth = 0;
  destroyed = false;
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setDepth(d: number) {
    this.depth = d;
    return this;
  }
  setOrigin() {
    return this;
  }
  fillStyle() {
    return this;
  }
  lineStyle() {
    return this;
  }
  fillPoints() {
    return this;
  }
  strokePoints() {
    return this;
  }
  lineBetween() {
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function fakeScene() {
  const objs: FakeObj[] = [];
  let update: ((t: number, dt: number) => void) | null = null;
  const make = () => {
    const o = new FakeObj();
    objs.push(o);
    return o;
  };
  const generated = new Set<string>();
  const gfx: unknown = new Proxy(
    {},
    {
      get: (_t, prop) => (prop === 'generateTexture' ? (k: string) => generated.add(k) : () => gfx),
    },
  );
  const scene = {
    textures: { exists: (k: string) => generated.has(k) },
    make: { graphics: () => gfx },
    add: { graphics: make, image: make },
    events: {
      on: (_n: string, f: (t: number, dt: number) => void) => (update = f),
      off: () => (update = null),
    },
  };
  return { scene: scene as never, objs, generated, tick: (dt: number) => update?.(0, dt) };
}

describe('planBuilding', () => {
  it('walls the whole perimeter, front = east/south edges, door faces down-left on the south edge', () => {
    const plan = planBuilding(BANK, isoProjection);
    expect(plan.walls).toHaveLength(2 * 6 + 2 * 3);
    expect(plan.walls.filter((w) => w.door)).toEqual([
      expect.objectContaining({ x: 12, y: 14, door: 'left', front: true }),
    ]);
    expect(plan.walls.find((w) => w.x === 10 && w.y === 10)?.front).toBe(false);
    expect(plan.walls.find((w) => w.x === 15 && w.y === 10)?.front).toBe(true);
  });

  it('a door on a back edge is an open gap with no block', () => {
    const plan = planBuilding({ ...BANK, doors: [{ x: 12, y: 10 }] }, isoProjection);
    expect(plan.walls.find((w) => w.x === 12 && w.y === 10)?.gap).toBe(true);
  });

  it('depth: a player behind is hidden by walls and roof, one in front draws over them', () => {
    const plan = planBuilding(BANK, isoProjection);
    const d = (x: number, y: number) => isoProjection.depthFor(x, y);
    const back = plan.walls.find((w) => w.x === 12 && w.y === 10)!;
    const front = plan.walls.find((w) => w.x === 11 && w.y === 14)!;
    expect(d(12, 8)).toBeLessThan(back.depth); // north of the building
    expect(d(11, 16)).toBeGreaterThan(front.depth); // south of the building
    expect(d(16, 14)).toBeGreaterThan(plan.roofDepth); // south-east, nearer than the roof
    expect(d(11, 13)).toBeLessThan(front.depth); // inside, behind the front wall
    expect(d(12, 11)).toBeGreaterThan(back.depth); // inside, in front of the back wall
    expect(d(14, 13)).toBeLessThan(plan.roofDepth); // inside is covered by the roof
    // standing in the doorway shows the player over the door block
    expect(d(12, 14)).toBeGreaterThan(plan.walls.find((w) => w.door)!.depth);
  });

  it('isInside is the interior only', () => {
    expect(isInside(BANK, 11, 11)).toBe(true);
    expect(isInside(BANK, 10, 11)).toBe(false);
    expect(isInside(BANK, 15, 14)).toBe(false);
  });
});

describe('roofFaces', () => {
  it('four faces, ridge along the longer axis, unknown style falls back', () => {
    expect(roofFaces(BANK, isoProjection)).toHaveLength(4);
    expect(roofFaces({ ...BANK, roof: 'nope' }, isoProjection)).toHaveLength(4);
    const sq = roofFaces({ ...BANK, rect: { x: 0, y: 0, w: 5, h: 5 } }, isoProjection);
    const apex = sq[0]!.points[2]!;
    // pyramid: every face meets at one apex
    for (const f of sq) expect(f.points).toContainEqual(apex);
    const long = roofFaces(BANK, isoProjection);
    expect(long[0]!.points[2]).not.toEqual(long[0]!.points[3]); // real ridge on the long axis
  });
});

describe('createFade', () => {
  it('moves linearly over the full duration and stops on target', () => {
    const f = createFade(1, 200);
    f.set(0, false);
    f.step(100);
    expect(f.value).toBeCloseTo(0.5);
    f.step(500);
    expect(f.value).toBe(0);
    expect(f.step(10)).toBe(false);
  });
});

describe('createBuildingRenderer', () => {
  it('hides only the entered building roof, fading over ~200 ms, and restores it', () => {
    const { scene, tick } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection);
    r.add(BANK);
    r.add({ ...BANK, id: 'inn', rect: { x: 30, y: 10, w: 5, h: 5 }, doors: [] });
    r.setInside('bank');
    expect(r.state('bank')?.roofAlpha).toBe(1); // not instant
    tick(100);
    expect(r.state('bank')?.roofAlpha).toBeCloseTo(0.5);
    tick(150);
    expect(r.state('bank')).toMatchObject({
      roofAlpha: 0,
      frontWallAlpha: FRONT_WALL_INSIDE_ALPHA,
      inside: true,
    });
    expect(r.state('inn')).toMatchObject({ roofAlpha: 1, frontWallAlpha: 1, inside: false });
    r.setInside(null);
    tick(300);
    expect(r.state('bank')).toMatchObject({ roofAlpha: 1, frontWallAlpha: 1, inside: false });
  });

  it.each(['off', 'reduced'] as const)('fade is instant when animations are %s', (m) => {
    const { scene } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection, { motion: () => m });
    r.add(BANK);
    r.setInside('bank');
    expect(r.state('bank')?.roofAlpha).toBe(0);
    r.setInside(null);
    expect(r.state('bank')?.roofAlpha).toBe(1);
  });

  it('a building added while the player is inside it starts open', () => {
    const { scene } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection, { motion: () => 'off' });
    r.setInside('bank');
    r.add(BANK);
    expect(r.state('bank')?.roofAlpha).toBe(0);
  });

  it('re-adding the same id (chunk reload) draws nothing twice; remove frees objects', () => {
    const { scene, objs } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection);
    r.add(BANK);
    const n = objs.length;
    r.add(BANK);
    r.add({ ...BANK });
    expect(objs).toHaveLength(n);
    expect(r.count()).toBe(1);
    r.remove('bank');
    expect(r.has('bank')).toBe(false);
    expect(objs.every((o) => o.destroyed)).toBe(true);
    r.add(BANK);
    expect(objs.length).toBeGreaterThan(n);
  });

  it('destroyAll clears everything and stops listening', () => {
    const { scene, objs, tick } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection);
    r.add(BANK);
    r.destroyAll();
    expect(r.count()).toBe(0);
    expect(objs.every((o) => o.destroyed)).toBe(true);
    expect(() => tick(16)).not.toThrow();
  });
});

describe('building styles', () => {
  const bank = { ...BANK, style: 'bank', roof: 'slate' };
  const hut = { ...BANK, id: 'hut', style: 'hut', roof: 'thatch' };

  it('default style is house; unknown falls back to house', () => {
    expect(lookOf(BANK).style).toBe('house');
    expect(lookOf({ style: 'castle' }).style).toBe('house');
  });

  it('bank: tall dressed-stone facade, door dressing, shaded roof with dark ridge', () => {
    const b = lookOf(bank);
    expect(b.bankFront).toBe(true);
    expect(b.pattern).toBe('dressed');
    expect(b.wallHeight).toBeGreaterThan(lookOf(BANK).wallHeight);
    const trim = roofTrim(bank, isoProjection);
    // Hardcoded: the ridge/hip line is never the old gold (0xe0b43a) and is darker than every roof face.
    expect(trim.color).not.toBe(0xe0b43a);
    const lumC = (c: number) => (c >> 16) + ((c >> 8) & 255) + (c & 255);
    for (const f of roofFaces(bank, isoProjection))
      expect(lumC(trim.color)).toBeLessThan(lumC(f.color));
    expect(trim.color >> 16).toBeLessThanOrEqual(trim.color & 255); // not warm/gold: red never above blue
    expect(trim.lines).toHaveLength(5); // ridge + 4 hips
    const lum = (c: number) => (c >> 16) + ((c >> 8) & 255) + (c & 255);
    expect(lum(roofFaces(bank, isoProjection)[0]!.color)).toBeLessThan(
      lum(roofFaces({ ...BANK, roof: 'slate' }, isoProjection)[0]!.color),
    );
  });

  it('every roof has dark ridge lines; only the bank has door dressing; hut is plank-walled thatch', () => {
    for (const b of [BANK, hut]) {
      const t = roofTrim(b, isoProjection);
      expect(t.lines).toHaveLength(5);
      expect(t.color).not.toBe(0xe0b43a);
    }
    expect(lookOf(hut)).toMatchObject({ pattern: 'planks', bankFront: false });
    expect(lookOf(BANK).bankFront).toBe(false);
  });

  it('each style generates its own wall and door textures; house keeps its original keys', () => {
    expect(wallKey(lookOf(BANK), 'tile', null)).toBe('bld_wall_tile');
    expect(wallKey(lookOf(BANK), 'tile', 'left')).toBe('bld_wall_tile_door_left');
    const { scene, generated } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection);
    r.add(bank);
    r.add(hut2());
    expect([...generated].sort()).toEqual(
      ['bld_wall_bank', 'bld_wall_bank_door_left', 'bld_wall_hut'].sort(),
    );
  });

  it('styles do not change fade, depth or ids', () => {
    const { scene } = fakeScene();
    const r = createBuildingRenderer(scene, isoProjection, { motion: () => 'off' });
    r.add(bank);
    r.setInside('bank');
    expect(r.state('bank')).toMatchObject({
      roofAlpha: 0,
      frontWallAlpha: FRONT_WALL_INSIDE_ALPHA,
    });
    expect(r.state('bank')!.roofDepth).toBe(planBuilding(bank, isoProjection).roofDepth);
  });

  function hut2(): BuildingSource {
    return { ...hut, rect: { x: 40, y: 10, w: 5, h: 5 }, doors: [] };
  }
});
