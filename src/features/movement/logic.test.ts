import { describe, expect, it } from 'vitest';
import { gridFromAscii, makeCtx } from '@test-utils/index';
import {
  canStep,
  createMovementState,
  deserializeMovement,
  serializeMovement,
  findPath,
  findPathToAdjacent,
  findPathToNearest,
  isAdjacentTo,
  setDestination,
  setPath,
  tickMovement,
  toggleRun,
} from './index';

const t = (x: number, y: number) => ({ x, y });

describe('findPath', () => {
  const open = gridFromAscii(['.....', '.....', '.....']);
  it.each([
    ['straight', t(0, 0), t(3, 0), [t(1, 0), t(2, 0), t(3, 0)]],
    ['diagonal', t(0, 0), t(2, 2), [t(1, 1), t(2, 2)]],
    ['same tile', t(1, 1), t(1, 1), []],
  ])('%s', (_n, from, to, expected) => {
    expect(findPath(open, from, to)).toEqual(expected);
  });

  it('goes around walls', () => {
    const g = gridFromAscii(['..#..', '..#..', '.....']);
    const p = findPath(g, t(0, 0), t(4, 0)) as ReturnType<typeof findPath> & object;
    expect(p[p.length - 1]).toEqual(t(4, 0));
    expect(p.every((s) => g.isWalkable(s.x, s.y))).toBe(true);
    expect(p.length).toBe(6);
  });

  it('never cuts corners', () => {
    const g = gridFromAscii(['.#', '#.']);
    expect(canStep(g, t(0, 0), t(1, 1))).toBe(false);
    expect(findPath(g, t(0, 0), t(1, 1))).toBeNull();
    const half = gridFromAscii(['.#', '..']);
    expect(canStep(half, t(0, 0), t(1, 1))).toBe(false);
    expect(findPath(half, t(0, 0), t(1, 1))).toEqual([t(0, 1), t(1, 1)]);
  });

  it('returns null for blocked, enclosed, or out-of-bounds targets', () => {
    const g = gridFromAscii(['.#.', '.#.', '.#.']);
    expect(findPath(g, t(0, 0), t(1, 0))).toBeNull();
    expect(findPath(g, t(0, 0), t(2, 0))).toBeNull();
    expect(findPath(g, t(0, 0), t(9, 9))).toBeNull();
  });

  it('respects the node cap', () => {
    const g = gridFromAscii(Array(50).fill('.'.repeat(50)));
    expect(findPath(g, t(0, 0), t(49, 49), { maxNodes: 10 })).toBeNull();
    expect(findPath(g, t(0, 0), t(49, 49))).toHaveLength(49);
  });
});

describe('findPathToNearest', () => {
  it('walks to the closest reachable tile when target is enclosed', () => {
    const g = gridFromAscii(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const p = findPathToNearest(g, t(0, 0), t(2, 2));
    const end = p[p.length - 1] as ReturnType<typeof t>;
    expect(Math.max(Math.abs(end.x - 2), Math.abs(end.y - 2))).toBe(2);
  });
  it('walks next to a blocked target', () => {
    const g = gridFromAscii(['...', '..#', '...']);
    const p = findPathToNearest(g, t(0, 0), t(2, 1));
    expect(p[p.length - 1]).toEqual(t(1, 1));
  });
  it('reaches a walkable target exactly', () => {
    expect(findPathToNearest(gridFromAscii(['...']), t(0, 0), t(2, 0))).toEqual([t(1, 0), t(2, 0)]);
  });
});

describe('findPathToAdjacent', () => {
  const g = gridFromAscii(['.....', '..#..', '.....']);
  it('ends 4-adjacent to a blocked target', () => {
    const p = findPathToAdjacent(g, t(0, 0), t(2, 1)) as ReturnType<typeof findPath> & object;
    expect(isAdjacentTo(p[p.length - 1] as ReturnType<typeof t>, t(2, 1))).toBe(true);
    expect(p).toEqual([t(1, 1)]);
  });
  it('is empty when already adjacent', () => {
    expect(findPathToAdjacent(g, t(1, 1), t(2, 1))).toEqual([]);
  });
  it('is null when no adjacent tile is reachable', () => {
    const e = gridFromAscii(['.#...', '.#.#.', '.#...']);
    expect(findPathToAdjacent(e, t(0, 0), t(3, 1))).toBeNull();
  });
  it('does not treat diagonal as adjacent', () => {
    expect(isAdjacentTo(t(0, 0), t(1, 1))).toBe(false);
  });
});

describe('tickMovement', () => {
  const g = gridFromAscii(['......']);
  const ctx = makeCtx();

  it('walks 1 tile per tick and reports arrival', () => {
    let s = setDestination(createMovementState(t(0, 0)), g, t(2, 0));
    let r = tickMovement(s, ctx, g);
    expect(r.state.position).toEqual(t(1, 0));
    expect(r.events).toEqual([{ type: 'entityMoved', from: t(0, 0), to: t(1, 0) }]);
    s = r.state;
    r = tickMovement(s, ctx, g);
    expect(r.events).toEqual([
      { type: 'entityMoved', from: t(1, 0), to: t(2, 0) },
      { type: 'destinationReached', position: t(2, 0) },
    ]);
    expect(tickMovement(r.state, ctx, g).events).toEqual([]);
  });

  it('runs 2 tiles per tick', () => {
    const s = toggleRun(setDestination(createMovementState(t(0, 0)), g, t(5, 0)));
    const r = tickMovement(s, ctx, g);
    expect(r.state.position).toEqual(t(2, 0));
    expect(r.state.path).toHaveLength(3);
    expect(r.events).toEqual([
      { type: 'entityMoved', from: t(0, 0), to: t(2, 0) },
      { type: 'runEnergyChanged', energy: 10000 - 2 * 67 },
    ]);
  });

  it('stops and emits when the next step is blocked', () => {
    const wall = gridFromAscii(['..#...']);
    const s = setPath({ ...createMovementState(t(0, 0)), running: true }, [
      t(1, 0),
      t(2, 0),
      t(3, 0),
    ]);
    const r = tickMovement(s, ctx, wall);
    expect(r.state.position).toEqual(t(1, 0));
    expect(r.state.path).toEqual([]);
    expect(r.events).toEqual([
      { type: 'entityMoved', from: t(0, 0), to: t(1, 0) },
      { type: 'movementBlocked', position: t(1, 0) },
      { type: 'runEnergyChanged', energy: 10000 - 67 },
    ]);
  });

  it('does not mutate the input state', () => {
    const s = setDestination(createMovementState(t(0, 0)), g, t(2, 0));
    tickMovement(s, ctx, g);
    expect(s.position).toEqual(t(0, 0));
    expect(s.path).toHaveLength(2);
  });
});

describe('serialize / deserialize', () => {
  const g = gridFromAscii(['..#', '...']);
  const fb = t(0, 0);
  const pos = (x: unknown, y: unknown, running: unknown = false) => ({
    position: { x, y },
    running,
  });

  it('round-trips and drops the path', () => {
    const s = setPath({ ...createMovementState(t(1, 1)), running: true }, [t(2, 1)]);
    const data = serializeMovement(s);
    expect(data).toEqual({ position: t(1, 1), running: true, runEnergy: 10000 });
    const r = deserializeMovement(JSON.parse(JSON.stringify(data)), g, fb);
    expect(r).toEqual({
      ok: true,
      value: { position: t(1, 1), path: [], running: true, runEnergy: 10000 },
    });
  });

  it.each([
    ['out of bounds', pos(9, 0)],
    ['negative', pos(-1, 0)],
    ['unwalkable', pos(2, 0)],
    ['fractional', pos(0.5, 1)],
    ['NaN', pos(NaN, 0)],
  ])('falls back on %s position', (_n, data) => {
    const r = deserializeMovement(data, g, t(1, 1));
    expect(r.ok && r.value.position).toEqual(t(1, 1));
  });

  it.each([
    ['null', null],
    ['string', 'x'],
    ['array', []],
    ['missing position', { running: true }],
    ['position not object', { position: 3, running: true }],
    ['string coords', pos('1', 1)],
    ['missing y', { position: { x: 1 }, running: false }],
    ['running not boolean', pos(1, 1, 'yes')],
    ['missing running', { position: t(1, 1) }],
  ])('errors on %s', (_n, data) => {
    expect(deserializeMovement(data, g, fb).ok).toBe(false);
  });

  it('ignores inherited / __proto__ keys', () => {
    const evil = JSON.parse('{"__proto__":{"position":{"x":1,"y":1},"running":true}}');
    expect(deserializeMovement(evil, g, fb).ok).toBe(false);
    const inherited = Object.create({ position: t(1, 1), running: true });
    expect(deserializeMovement(inherited, g, fb).ok).toBe(false);
    expect(({} as Record<string, unknown>).position).toBeUndefined();
  });
});

describe('run energy', () => {
  const g = gridFromAscii(['..............................']);
  const ctx = makeCtx();
  const far = (energy: number, running: boolean) =>
    setDestination({ ...createMovementState(t(0, 0)), runEnergy: energy, running }, g, t(29, 0));

  it('starts full', () => {
    expect(createMovementState(t(0, 0)).runEnergy).toBe(10000);
  });

  it.each([
    { name: 'walking does not drain', running: false, from: 5000, expected: 5045 },
    { name: 'running drains 2 tiles', running: true, from: 5000, expected: 5000 - 2 * 67 },
  ])('$name', ({ running, from, expected }) => {
    expect(tickMovement(far(from, running), ctx, g).state.runEnergy).toBe(expected);
  });

  it('running only drains for tiles actually moved', () => {
    const s = setPath({ ...createMovementState(t(0, 0)), running: true }, [t(1, 0)]);
    expect(tickMovement(s, ctx, g).state.runEnergy).toBe(10000 - 67);
  });

  it('auto-disables at 0 and emits runDisabled', () => {
    const r = tickMovement(far(100, true), ctx, g);
    expect(r.state.runEnergy).toBe(0);
    expect(r.state.running).toBe(false);
    expect(r.events).toContainEqual({ type: 'runDisabled' });
    expect(r.events).toContainEqual({ type: 'runEnergyChanged', energy: 0 });
    expect(tickMovement(r.state, ctx, g).state.position).toEqual(t(3, 0));
  });

  it('regenerates while standing, capped at 100%', () => {
    const s = { ...createMovementState(t(0, 0)), runEnergy: 9980 };
    expect(tickMovement(s, ctx, g).state.runEnergy).toBe(10000);
    const r = tickMovement({ ...s, runEnergy: 1000 }, ctx, g);
    expect(r.state.runEnergy).toBe(1045);
  });

  it('toggleRun is refused below 1% and allowed at 1%', () => {
    const low = { ...createMovementState(t(0, 0)), runEnergy: 99 };
    expect(toggleRun(low)).toBe(low);
    expect(toggleRun({ ...low, runEnergy: 100 }).running).toBe(true);
    expect(toggleRun({ ...low, running: true }).running).toBe(false);
  });

  it('emits runEnergyChanged only when the whole percent changes', () => {
    let s = { ...createMovementState(t(0, 0)), runEnergy: 5000 };
    const pcts: number[] = [];
    let quiet = 0;
    for (let i = 0; i < 20; i++) {
      const r = tickMovement(s, ctx, g);
      const ev = r.events.filter((e) => e.type === 'runEnergyChanged');
      if (ev.length === 0) quiet++;
      for (const e of ev) pcts.push(Math.floor((e as { energy: number }).energy / 100));
      s = r.state;
    }
    expect(s.runEnergy).toBe(5900);
    expect(quiet).toBeGreaterThan(0);
    expect(pcts.length).toBeLessThan(20);
    expect(new Set(pcts).size).toBe(pcts.length);
  });

  it('serializes runEnergy and loads old saves without it as full', () => {
    const s = { ...createMovementState(t(1, 1)), runEnergy: 1234 };
    const grid = gridFromAscii(['...', '...']);
    const r = deserializeMovement(JSON.parse(JSON.stringify(serializeMovement(s))), grid, t(0, 0));
    expect(r.ok && r.value.runEnergy).toBe(1234);
    const old = { position: { x: 1, y: 1 }, running: true };
    const o = deserializeMovement(old, grid, t(0, 0));
    expect(o.ok && o.value.runEnergy).toBe(10000);
    expect(deserializeMovement({ ...old, runEnergy: 'x' }, grid, t(0, 0)).ok).toBe(false);
    const c = deserializeMovement({ ...old, runEnergy: 99999 }, grid, t(0, 0));
    expect(c.ok && c.value.runEnergy).toBe(10000);
  });
});
