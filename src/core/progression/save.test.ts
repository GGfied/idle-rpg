import { describe, expect, it } from 'vitest';
import {
  MAX_XP,
  addXp,
  createProgressionState,
  deserializeProgression,
  serializeProgression,
} from './index';

const fresh = createProgressionState();

describe('progression save slice', () => {
  it('round-trips through JSON', () => {
    const s = addXp(fresh, 'mining', 5000).state;
    const r = deserializeProgression(JSON.parse(JSON.stringify(serializeProgression(s))));
    expect(r).toEqual({ ok: true, value: s });
  });

  it('defaults missing skills', () => {
    const r = deserializeProgression({ xp: { mining: 83 } });
    expect(r.ok && r.value.xp.mining).toBe(83);
    expect(r.ok && r.value.xp.hitpoints).toBe(1154);
  });

  it('accepts 0 and MAX_XP', () => {
    expect(deserializeProgression({ xp: { mining: 0, attack: MAX_XP } }).ok).toBe(true);
  });

  it.each([
    ['string xp', { xp: { mining: '5' } }],
    ['null xp', { xp: { mining: null } }],
    ['NaN', { xp: { mining: NaN } }],
    ['Infinity', { xp: { mining: Infinity } }],
    ['negative', { xp: { mining: -1 } }],
    ['over cap', { xp: { mining: MAX_XP + 1 } }],
    ['xp array', { xp: [] }],
    ['xp missing', {}],
    ['null', null],
    ['number', 5],
    ['string', 'x'],
    ['array', []],
    ['undefined', undefined],
  ])('rejects %s', (_n, data) => {
    expect(deserializeProgression(data).ok).toBe(false);
  });

  it('ignores unknown keys and __proto__ without polluting', () => {
    const data = JSON.parse('{"xp":{"__proto__":{"polluted":1},"basket":9,"mining":83}}');
    const r = deserializeProgression(data);
    expect(r.ok && r.value.xp.mining).toBe(83);
    expect(r.ok && Object.keys(r.value.xp)).not.toContain('basket');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.ok && (r.value.xp as Record<string, unknown>).polluted).toBeUndefined();
  });
});
