import { describe, expect, it } from 'vitest';
import { FACILITIES } from './data';
import type { FacilityDef } from './types';
import { facilityDef, interactionFor, optionsFor, reachRuleFor, requirementsFor } from './logic';

const PANELS = ['bankPanel', 'depositPanel'];
const RECIPE_GROUPS = ['range', 'furnace', 'anvil'];

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
