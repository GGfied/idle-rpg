import { describe, expect, it } from 'vitest';
import { countItem } from '@core/inventory';
import { createMovementState } from '@features/movement';
import { FISHING_SPOTS } from '@features/world';
import { scriptedRng, withInventory } from '@test-utils/index';
import { CONTENT } from '@app/registry';
import { walkTo } from '@app/game/actions';
import { interactSpot } from '@app/game/fishing';
import { spotTile } from '@app/game/fishingSpots';
import { newGame } from '@app/game/newGame';
import { BAIT_STACK } from '@app/game/starterKits';
import { step } from '@app/game/step';
import type { GameState } from '@app/game/types';
import type { AppEvent } from '@app/registry';

const net = FISHING_SPOTS.find((s) => s.defId === 'net_spot')!;
const bait = FISHING_SPOTS.find((s) => s.defId === 'bait_spot')!;
const texts = (s: GameState): string[] => s.chat.map((l) => l.text);

function run(
  state: GameState,
  ticks: number,
  rng = scriptedRng([0]),
): { state: GameState; events: AppEvent[] } {
  let s = state;
  const events: AppEvent[] = [];
  for (let t = 1; t <= ticks; t++) {
    const r = step(s, { tick: t, rng });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Standing on the shore tile just south of a spot's first water tile. */
const beside = (spot: typeof net, s = newGame(CONTENT)): GameState => {
  const t = spot.tiles[0]!;
  return { ...s, movement: createMovementState({ x: t.x, y: t.y + 1 }) };
};

describe('fishing', () => {
  it('new games carry the pickaxe, net, rod and starter bait', () => {
    const inv = newGame(CONTENT).inventory;
    expect(countItem(inv, 'small_fishing_net')).toBe(1);
    expect(countItem(inv, 'fishing_rod')).toBe(1);
    expect(countItem(inv, 'fishing_bait')).toBe(BAIT_STACK);
  });

  it('click spot -> walk -> cast -> shrimp + fishing xp + chat', () => {
    const s0 = interactSpot(beside(net), CONTENT, net.spotId);
    expect(s0.pendingFishing).toEqual({ spotId: net.spotId });
    const { state, events } = run(s0, 12);
    expect(events.some((e) => e.type === 'fishingStarted')).toBe(true);
    expect(countItem(state.inventory, 'raw_shrimp')).toBeGreaterThanOrEqual(1);
    expect(state.progression.xp.fishing).toBeGreaterThanOrEqual(10);
    expect(texts(state)).toContain('You cast out into the water.');
    expect(texts(state)).toContain('You catch some shrimp.');
  });

  it('every attempt posts exactly one cast line, idle ticks none', () => {
    const attemptsOf = (spot: typeof net, line: string): void => {
      const s0 = interactSpot(beside(spot), CONTENT, spot.spotId);
      const lv = { ...s0, progression: { xp: { ...s0.progression.xp, fishing: 400 } } };
      const { state, events } = run(lv, 60);
      const n = events.filter((e) => e.type === 'fishingAttempt').length;
      expect(n).toBeGreaterThan(0);
      expect(texts(state).filter((t) => t === line)).toHaveLength(n);
    };
    attemptsOf(net, 'You cast out your net.');
    attemptsOf(bait, 'You cast your line.');
    const idle = run(beside(net), 5);
    expect(idle.state.chat).toEqual(beside(net).chat);
  });

  it('bait fishing uses up bait per catch', () => {
    const s0 = interactSpot(beside(bait), CONTENT, bait.spotId);
    const s = { ...s0, progression: { xp: { ...s0.progression.xp, fishing: 400 } } }; // level 5+
    const { state } = run(s, 12);
    const caught =
      countItem(state.inventory, 'raw_sardine') + countItem(state.inventory, 'raw_herring');
    expect(caught).toBeGreaterThanOrEqual(1);
    expect(countItem(state.inventory, 'fishing_bait')).toBe(BAIT_STACK - caught);
  });

  it('says so with no bait, with no rod, and at too low a level', () => {
    const lvl = (s: GameState) => ({
      ...s,
      progression: { xp: { ...s.progression.xp, fishing: 400 } },
    });
    const noBait = {
      ...beside(bait),
      inventory: withInventory([{ itemId: 'fishing_rod', quantity: 1 }]),
    };
    expect(texts(run(interactSpot(lvl(noBait), CONTENT, bait.spotId), 3).state)).toContain(
      'You have no bait left.',
    );
    const noRod = {
      ...beside(bait),
      inventory: withInventory([{ itemId: 'fishing_bait', quantity: 5 }]),
    };
    expect(texts(run(interactSpot(lvl(noRod), CONTENT, bait.spotId), 3).state)).toContain(
      'You need the right fishing tool to fish here.',
    );
    expect(texts(run(interactSpot(beside(bait), CONTENT, bait.spotId), 3).state)).toContain(
      'You need a Fishing level of 5 to fish here.',
    );
  });

  it('the spot hopping stops the player fishing and moves the marker tile', () => {
    let s = run(interactSpot(beside(net), CONTENT, net.spotId), 2).state;
    expect(s.fishing.session).not.toBeNull();
    const events: AppEvent[] = [];
    for (let t = 3; t < 400 && !events.some((e) => e.type === 'spotMoved'); t++) {
      const r = step(s, { tick: t, rng: scriptedRng([0.99]) });
      s = r.state;
      events.push(...r.events);
    }
    const moved = events.find((e) => e.type === 'spotMoved');
    expect(moved).toBeDefined();
    expect(s.fishing.session).toBeNull();
    expect(texts(s)).toContain('The fish have moved on.');
    expect(spotTile(net, s.fishing)).toEqual(net.tiles[s.fishing.spots[net.spotId]!.tile]);
  });

  it('any other click cancels fishing', () => {
    const fishing = run(interactSpot(beside(net), CONTENT, net.spotId), 2).state;
    expect(walkTo(fishing, CONTENT, { x: 0, y: 0 }).fishing.session).toBeNull();
    const walking = interactSpot(beside(net), CONTENT, net.spotId);
    expect(walkTo(walking, CONTENT, { x: 0, y: 0 }).pendingFishing).toBeNull();
  });

  it('re-tapping the spot being fished keeps the session', () => {
    const s = run(interactSpot(beside(net), CONTENT, net.spotId), 2).state;
    expect(interactSpot(s, CONTENT, net.spotId)).toBe(s);
  });
});
