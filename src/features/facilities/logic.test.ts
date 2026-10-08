import { describe, expect, it } from 'vitest';
import { FACILITIES } from './data';
import type { FacilityDef } from './types';
import {
  facilityDef,
  fireAt,
  interactionFor,
  lightFire,
  optionsFor,
  reachRuleFor,
  requirementsFor,
  tickFires,
} from './logic';
import { FACILITY_ITEMS, LIGHTABLE_LOGS, LIGHT_TICKS, STEP_ASIDE } from './data';
import type { FireState, LightInput } from './types';

const PANELS = ['bankPanel', 'depositPanel'];
const RECIPE_GROUPS = ['range', 'furnace', 'anvil', 'cooking'];

describe('facility data', () => {
  it('has unique kinds and the bank kinds', () => {
    const kinds = FACILITIES.map((f) => f.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(expect.arrayContaining(['bank_booth', 'bank_chest', 'deposit_chest']));
  });

  it.each(FACILITIES.map((f) => [f.kind, f] as const))('%s is well formed', (_k, def) => {
    expect(def.name).toBeTruthy();
    expect(def.examine).toBeTruthy();
    expect(def.options.length).toBeGreaterThan(0);
    expect(new Set(def.options.map((o) => o.id)).size).toBe(def.options.length);
    for (const o of def.options) {
      expect(o.label).toBeTruthy();
      const i = o.intent;
      if (i.type === 'openPanel') expect(PANELS).toContain(i.panel);
      else expect(RECIPE_GROUPS).toContain(i.recipeGroup);
    }
  });
});

describe('interactionFor', () => {
  it('defaults to the first option', () => {
    for (const kind of ['bank_booth', 'bank_chest']) {
      expect(interactionFor(kind)).toEqual({
        ok: true,
        value: { type: 'openPanel', panel: 'bankPanel' },
      });
    }
  });
  it('resolves a named option', () => {
    expect(interactionFor('bank_booth', 'bank').ok).toBe(true);
    expect(interactionFor('bank_chest', 'use').ok).toBe(true);
  });
  it('errors on unknown kind and option', () => {
    expect(interactionFor('nope')).toEqual({ ok: false, error: 'unknownFacility' });
    expect(interactionFor('bank_booth', 'use')).toEqual({ ok: false, error: 'unknownOption' });
  });
});

describe('deposit chest', () => {
  it('opens the deposit-only panel, not the bank panel', () => {
    expect(interactionFor('deposit_chest')).toEqual({
      ok: true,
      value: { type: 'openPanel', panel: 'depositPanel' },
    });
    expect(interactionFor('deposit_chest', 'deposit').ok).toBe(true);
    expect(optionsFor('deposit_chest').map((o) => o.label)).toEqual(['Deposit']);
    expect(interactionFor('deposit_chest', 'bank')).toEqual({ ok: false, error: 'unknownOption' });
  });
  it('bank booth still opens the full bank', () => {
    expect(interactionFor('bank_booth', 'bank')).toEqual({
      ok: true,
      value: { type: 'openPanel', panel: 'bankPanel' },
    });
  });
});

describe('optionsFor / requirementsFor / reach', () => {
  it('lists labelled options, empty for unknown kinds', () => {
    expect(optionsFor('bank_booth').map((o) => o.label)).toEqual(['Bank']);
    expect(optionsFor('nope')).toEqual([]);
  });
  it('bank has no requirements; reach is adjacent4', () => {
    expect(requirementsFor('bank_booth', 'bank')).toEqual([]);
    expect(requirementsFor('bank_booth')).toEqual([]);
    expect(requirementsFor('nope')).toEqual([]);
    expect(reachRuleFor('bank_booth')).toBe('adjacent4');
    expect(reachRuleFor('nope')).toBeUndefined();
  });
});

describe('data-driven extension', () => {
  const need = [{ type: 'skillLevel' as const, skill: 'cooking', level: 5 }];
  const range: FacilityDef = {
    kind: 'range',
    name: 'Range',
    examine: 'A cooking range.',
    reach: 'adjacent4',
    options: [
      {
        id: 'cook',
        label: 'Cook',
        intent: { type: 'startRecipe', recipeGroup: 'range' },
        requires: need,
      },
    ],
  };
  const table = [...FACILITIES, range];
  it('a new def works with no code change, keeping locked options listed', () => {
    expect(facilityDef('range', table)?.name).toBe('Range');
    expect(interactionFor('range', 'cook', table)).toEqual({
      ok: true,
      value: { type: 'startRecipe', recipeGroup: 'range' },
    });
    expect(optionsFor('range', table)).toHaveLength(1);
    expect(requirementsFor('range', 'cook', table)).toEqual(need);
  });
});

describe('fire facility + data', () => {
  it('fire kind cooks via the cooking recipe group', () => {
    expect(interactionFor('fire', 'cook')).toEqual({
      ok: true,
      value: { type: 'startRecipe', recipeGroup: 'cooking' },
    });
    expect(reachRuleFor('fire')).toBe('adjacent4');
    expect(FACILITIES[FACILITIES.length - 1]?.kind).toBe('fire');
  });
  it.each([
    ['tinderbox', false],
    ['ashes', true],
  ])('declares item %s (stackable %s)', (id, stackable) => {
    expect(FACILITY_ITEMS.find((i) => i.id === id)).toMatchObject({ stackable, icon: id });
  });
  it('has sane constants', () => {
    expect(LIGHT_TICKS).toBeGreaterThan(0);
    expect(Object.keys(LIGHTABLE_LOGS)).toEqual(['logs', 'oak_logs']);
    expect(STEP_ASIDE).toEqual([
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]);
  });
  it('better logs burn longer', () => {
    expect(LIGHTABLE_LOGS.oak_logs!.burnTicks).toBeGreaterThan(LIGHTABLE_LOGS.logs!.burnTicks);
  });
});

const input = (over: Partial<LightInput> = {}): LightInput => ({
  tile: { x: 2, y: 3 },
  logsId: 'logs',
  hasTinderbox: true,
  tileBlocked: false,
  nowTick: 10,
  nextId: 'fire_1',
  ...over,
});
const existing: FireState = { id: 'f0', tile: { x: 2, y: 3 }, logsId: 'logs', expiresAtTick: 99 };

describe('lightFire', () => {
  it.each([
    ['no tinderbox', [], { hasTinderbox: false }, 'noTinderbox'],
    ['not lightable', [], { logsId: 'raw_shrimp' }, 'notLightable'],
    ['prototype key', [], { logsId: 'constructor' }, 'notLightable'],
    ['blocked tile', [], { tileBlocked: true }, 'tileOccupied'],
    ['fire already there', [existing], {}, 'tileOccupied'],
  ] as const)('%s fails', (_n, fires, over, error) => {
    expect(lightFire(fires, input(over))).toEqual({ ok: false, error });
  });

  it.each([
    ['logs', 110],
    ['oak_logs', 160],
  ])('lights %s expiring at %i', (logsId, expires) => {
    const r = lightFire([existing], input({ logsId, tile: { x: 5, y: 5 } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fire).toEqual({
      id: 'fire_1',
      tile: { x: 5, y: 5 },
      logsId,
      expiresAtTick: expires,
    });
    expect(r.value.fires).toEqual([existing, r.value.fire]);
    expect(r.value.consumed).toEqual({ itemId: logsId, quantity: 1 });
  });

  it('does not mutate the input list', () => {
    const fires = [existing];
    lightFire(fires, input({ tile: { x: 9, y: 9 } }));
    expect(fires).toHaveLength(1);
  });
});

describe('tickFires / fireAt', () => {
  const a: FireState = { ...existing, id: 'a', expiresAtTick: 20 };
  const b: FireState = { id: 'b', tile: { x: 7, y: 7 }, logsId: 'oak_logs', expiresAtTick: 21 };
  it.each([
    [19, ['a', 'b'], []],
    [20, ['b'], ['a']],
    [21, [], ['a', 'b']],
  ])('at tick %i keeps %j and burns out %j', (now, kept, gone) => {
    const r = tickFires([a, b], now);
    expect(r.fires.map((f) => f.id)).toEqual(kept);
    expect(r.events.map((e) => e.fireId)).toEqual(gone);
    expect(r.drops).toHaveLength(gone.length);
  });
  it('event carries tile and logs', () => {
    expect(tickFires([b], 30).events).toEqual([
      { type: 'fireBurnedOut', fireId: 'b', tile: { x: 7, y: 7 }, logsId: 'oak_logs' },
    ]);
  });
  it('each burnt-out fire leaves one ashes drop on its tile', () => {
    expect(tickFires([a, b], 30).drops).toEqual([
      { itemId: 'ashes', quantity: 1, tile: { x: 2, y: 3 } },
      { itemId: 'ashes', quantity: 1, tile: { x: 7, y: 7 } },
    ]);
    expect(tickFires([a, b], 0).drops).toEqual([]);
  });
  it('finds a fire by tile', () => {
    expect(fireAt([a, b], { x: 7, y: 7 })).toBe(b);
    expect(fireAt([a, b], { x: 0, y: 0 })).toBeUndefined();
  });
});
