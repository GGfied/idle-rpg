import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@core/inventory';
import { scriptedRng } from '@test-utils/index';
import { LIGHT_TICKS } from '@features/facilities';
import { CONTENT } from '@app/registry';
import type { AppEvent } from '@app/registry';
import { cookOnFire, lightSlot, walkTo } from '@app/game/actions';
import { newGame } from '@app/game/newGame';
import { playerAction } from '@app/game/playerAction';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';

const texts = (s: GameState): string[] => s.chat.map((l) => l.text);

function run(
  state: GameState,
  ticks: number,
  from = 1,
  rng = scriptedRng([0]),
): { state: GameState; events: AppEvent[] } {
  let s = state;
  const events: AppEvent[] = [];
  for (let t = from; t < from + ticks; t++) {
    const r = step(s, { tick: t, rng });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

function give(s: GameState, itemId: string, qty = 1): GameState {
  const r = addItem(s.inventory, CONTENT.items, itemId, qty);
  if (!r.ok) throw new Error('full');
  return { ...s, inventory: r.value };
}

const slotOf = (s: GameState, id: string): number =>
  s.inventory.slots.findIndex((x) => x?.itemId === id);

describe('lighting a fire', () => {
  it('new games carry a tinderbox', () => {
    expect(countItem(newGame(CONTENT).inventory, 'tinderbox')).toBe(1);
  });

  it('takes LIGHT_TICKS, consumes the logs, lights a fire, steps aside, and emits the events', () => {
    const s0 = give(newGame(CONTENT), 'logs');
    const here = s0.movement.position;
    const s1 = lightSlot(s0, CONTENT, slotOf(s0, 'logs'));
    expect(playerAction(s1)).toBe('lighting');
    expect(texts(s1)).toContain('You attempt to light the logs.');
    const r = run(s1, LIGHT_TICKS);
    expect(r.events.filter((e) => e.type === 'fireLightStarted')).toEqual([
      { type: 'fireLightStarted', tile: here },
    ]);
    const lit = r.events.find((e) => e.type === 'fireLit');
    expect(lit).toMatchObject({ type: 'fireLit', fireId: 'fire1', tile: here, logsId: 'logs' });
    expect(r.state.firemaking.fires).toHaveLength(1);
    expect(countItem(r.state.inventory, 'logs')).toBe(0);
    expect(texts(r.state)).toContain('The fire catches and the logs begin to burn.');
    expect(playerAction(r.state)).toBeNull();
    // Already off the fire on the tick it lit (the render trail walks it over that tick), nothing left to walk.
    expect(r.state.movement.position).not.toEqual(here);
    expect(r.state.movement.path).toEqual([]);
    // Stepped to a walkable neighbour (first STEP_ASIDE offset: west).
    const after = run(r.state, 2, 10).state.movement.position;
    expect(after).not.toEqual(here);
    expect(Math.abs(after.x - here.x) + Math.abs(after.y - here.y)).toBe(1);
  });

  it('walking cancels lighting: no fire, logs kept', () => {
    const s0 = give(newGame(CONTENT), 'logs');
    const s1 = lightSlot(s0, CONTENT, slotOf(s0, 'logs'));
    const away = { x: s0.movement.position.x + 2, y: s0.movement.position.y };
    const r = run(walkTo(s1, CONTENT, away), 6);
    expect(r.state.firemaking.fires).toHaveLength(0);
    expect(countItem(r.state.inventory, 'logs')).toBe(1);
    expect(r.events.some((e) => e.type === 'fireLit')).toBe(false);
  });

  it('says why when there is no tinderbox', () => {
    let s = give(newGame(CONTENT), 'logs');
    s = {
      ...s,
      inventory: {
        ...s.inventory,
        slots: s.inventory.slots.map((x) => (x?.itemId === 'tinderbox' ? null : x)),
      },
    };
    const s1 = lightSlot(s, CONTENT, slotOf(s, 'logs'));
    expect(texts(s1)).toContain('You need a tinderbox to light a fire.');
    expect(s1.firemaking.lighting).toBeNull();
  });

  it('a second fire on the same tile is refused and keeps the logs', () => {
    const s0 = give(give(newGame(CONTENT), 'logs'), 'logs');
    const lit = run(lightSlot(s0, CONTENT, slotOf(s0, 'logs')), LIGHT_TICKS).state;
    // Back onto the fire tile and try again.
    const back = {
      ...lit,
      movement: { ...lit.movement, position: lit.firemaking.fires[0]!.tile, path: [] },
    };
    const r = run(lightSlot(back, CONTENT, slotOf(back, 'logs')), LIGHT_TICKS, 20);
    expect(r.state.firemaking.fires).toHaveLength(1);
    expect(texts(r.state)).toContain("You can't light a fire here.");
    expect(countItem(r.state.inventory, 'logs')).toBe(1);
  });

  it('a burnt-out fire leaves ashes on its tile as a normal ground item', () => {
    const s0 = give(newGame(CONTENT), 'logs');
    const lit = run(lightSlot(s0, CONTENT, slotOf(s0, 'logs')), LIGHT_TICKS).state;
    const fire = lit.firemaking.fires[0]!;
    const r = run(lit, 1, fire.expiresAtTick);
    expect(r.state.firemaking.fires).toHaveLength(0);
    expect(r.events.find((e) => e.type === 'fireBurnedOut')).toMatchObject({ fireId: fire.id });
    expect(texts(r.state)).toContain('The fire burns out.');
    const ash = r.state.ground.items.find((g) => g.itemId === 'ashes');
    expect(ash).toMatchObject({ x: fire.tile.x, y: fire.tile.y, qty: 1 });
  });
});

describe('cooking on a fire', () => {
  function withFire(): GameState {
    const s0 = give(give(newGame(CONTENT), 'raw_shrimp', 2), 'logs');
    const lit = run(lightSlot(s0, CONTENT, slotOf(s0, 'logs')), LIGHT_TICKS).state;
    return run(lit, 3, 10).state; // let the player step aside
  }

  it('walks beside the fire, cooks every raw item, grants xp and emits itemCooked with the fire tile', () => {
    const s0 = withFire();
    const fire = s0.firemaking.fires[0]!;
    const s1 = cookOnFire(s0, CONTENT, fire.id);
    const r = run(s1, 12, 20);
    expect(countItem(r.state.inventory, 'raw_shrimp')).toBe(0);
    expect(
      countItem(r.state.inventory, 'shrimps') + countItem(r.state.inventory, 'burnt_fish'),
    ).toBe(2);
    expect(r.state.progression.xp.cooking).toBeGreaterThan(0);
    const cooked = r.events.filter((e) => e.type === 'itemCooked');
    expect(cooked).toHaveLength(2);
    expect(cooked[0]).toMatchObject({ burnt: false, producedId: 'shrimps', tile: fire.tile });
    expect(texts(r.state)).toContain('You cook the shrimps.');
    expect(r.events.find((e) => e.type === 'cookingStopped')).toMatchObject({
      reason: 'noRawFood',
    });
  });

  it('the fire burning out mid-cook stops with sourceGone', () => {
    const s0 = withFire();
    const fire = s0.firemaking.fires[0]!;
    const s1 = cookOnFire(s0, CONTENT, fire.id);
    const r = run(s1, 3, fire.expiresAtTick - 1);
    expect(r.events.find((e) => e.type === 'cookingStopped')).toMatchObject({
      reason: 'sourceGone',
    });
    expect(texts(r.state)).toContain('The fire has gone out.');
  });

  it('with nothing cookable it says so and does not walk', () => {
    const s0 = withFire();
    const s1 = cookOnFire(give(s0, 'logs'), CONTENT, s0.firemaking.fires[0]!.id);
    const empty = {
      ...s0,
      inventory: {
        ...s0.inventory,
        slots: s0.inventory.slots.map((x) => (x?.itemId === 'raw_shrimp' ? null : x)),
      },
    };
    expect(s1.pendingCook).not.toBeNull();
    const s2 = cookOnFire(empty, CONTENT, s0.firemaking.fires[0]!.id);
    expect(s2.pendingCook).toBeNull();
    expect(texts(s2)).toContain('You have nothing left to cook.');
  });

  it('walking away cancels cooking', () => {
    const s0 = withFire();
    const s1 = run(cookOnFire(s0, CONTENT, s0.firemaking.fires[0]!.id), 2, 20).state;
    expect(playerAction(s1)).toBe('cooking');
    const away = walkTo(s1, CONTENT, { x: s1.movement.position.x, y: s1.movement.position.y + 3 });
    expect(playerAction(away)).toBeNull();
  });
});

describe('lighting with no free neighbour (fires stay walkable, so step-aside must exist)', () => {
  const OFFSETS = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const fireOn = (s: GameState, dirs: readonly (readonly [number, number])[]): GameState => {
    const { x, y } = s.movement.position;
    const fires = dirs.map(([dx, dy], i) => ({
      id: `n${i}`,
      tile: { x: x + dx, y: y + dy },
      logsId: 'logs',
      expiresAtTick: 1e9,
    }));
    return { ...s, firemaking: { ...s.firemaking, fires, nextId: 100 } };
  };
  const withLogs = (): GameState => give(newGame(CONTENT), 'logs');

  it('all four neighbours blocked: refused at the start, logs kept, no fire, not lighting', () => {
    const s0 = fireOn(withLogs(), OFFSETS);
    const s1 = lightSlot(s0, CONTENT, slotOf(s0, 'logs'));
    expect(texts(s1)).toContain("You can't light a fire here.");
    expect(s1.firemaking.lighting).toBeNull();
    expect(playerAction(s1)).toBeNull();
    const r = run(s1, LIGHT_TICKS + 2);
    expect(r.state.firemaking.fires).toHaveLength(4);
    expect(countItem(r.state.inventory, 'logs')).toBe(1);
    expect(r.events.some((e) => e.type === 'fireLit' || e.type === 'fireLightStarted')).toBe(false);
  });

  it('a neighbour blocked during lighting: refused at ignition, logs kept, player stays', () => {
    const s0 = fireOn(withLogs(), OFFSETS.slice(0, 3));
    const here = s0.movement.position;
    const s1 = lightSlot(s0, CONTENT, slotOf(s0, 'logs'));
    expect(s1.firemaking.lighting).not.toBeNull();
    const mid = run(s1, LIGHT_TICKS - 1).state;
    expect(mid.firemaking.lighting).not.toBeNull();
    // The last free neighbour (north) catches fire while we light.
    const blocked = fireOn(mid, OFFSETS).firemaking.fires;
    const r = run({ ...mid, firemaking: { ...mid.firemaking, fires: blocked } }, 1, LIGHT_TICKS);
    expect(texts(r.state)).toContain("You can't light a fire here.");
    expect(r.state.firemaking.fires).toHaveLength(4);
    expect(r.state.firemaking.lighting).toBeNull();
    expect(countItem(r.state.inventory, 'logs')).toBe(1);
    expect(r.state.movement.position).toEqual(here);
    expect(r.events.some((e) => e.type === 'fireLit')).toBe(false);
  });

  it('one free neighbour: lights and steps there', () => {
    const s0 = fireOn(withLogs(), OFFSETS.slice(0, 3));
    const here = s0.movement.position;
    const r = run(lightSlot(s0, CONTENT, slotOf(s0, 'logs')), LIGHT_TICKS);
    expect(r.state.firemaking.fires).toHaveLength(4);
    expect(countItem(r.state.inventory, 'logs')).toBe(0);
    expect(r.state.movement.position).toEqual({ x: here.x, y: here.y - 1 });
  });
});
