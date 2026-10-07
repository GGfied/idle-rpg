import { describe, expect, it } from 'vitest';
import { bestTool, createToolRegistry, defineTools, hasTool } from './index';
import type { ToolDef } from './index';

const tool = (over: Partial<ToolDef> = {}): ToolDef => ({
  kind: 'axe',
  skill: 'woodcutting',
  levelRequired: 1,
  ticksSaved: 0,
  ...over,
});

const axes = defineTools({
  bronze_axe: tool(),
  iron_axe: tool({ levelRequired: 5, ticksSaved: 1 }),
  steel_axe: tool({ levelRequired: 10, ticksSaved: 2 }),
  fast_axe: tool({ levelRequired: 20, ticksSaved: 2 }),
  bronze_pickaxe: tool({ kind: 'pickaxe', skill: 'mining' }),
});
const registry = createToolRegistry(axes);
const lvl = (n: number) => () => n;

describe('defineTools', () => {
  it('accepts valid tables', () => {
    expect(axes.get('iron_axe')?.ticksSaved).toBe(1);
    expect(axes.size).toBe(5);
  });

  it.each([
    ['bad id', { 'Bad-Id': tool() }, /Invalid tool item id/],
    ['empty kind', { a: tool({ kind: ' ' }) }, /empty kind/],
    ['empty skill', { a: tool({ skill: '' }) }, /empty skill/],
    ['level 0', { a: tool({ levelRequired: 0 }) }, /levelRequired/],
    ['level 100', { a: tool({ levelRequired: 100 }) }, /levelRequired/],
    ['fractional level', { a: tool({ levelRequired: 1.5 }) }, /levelRequired/],
    ['negative ticks', { a: tool({ ticksSaved: -1 }) }, /ticksSaved/],
    ['fractional ticks', { a: tool({ ticksSaved: 0.5 }) }, /ticksSaved/],
    ['NaN ticks', { a: tool({ ticksSaved: NaN }) }, /ticksSaved/],
  ])('throws on %s', (_n, table, msg) => {
    expect(() => defineTools(table)).toThrow(msg);
  });
});

describe('createToolRegistry', () => {
  it('looks up, lists and merges', () => {
    const more = defineTools({ bronze_rod: tool({ kind: 'rod', skill: 'fishing' }) });
    const r = createToolRegistry(axes, more);
    expect(r.get('bronze_rod')?.kind).toBe('rod');
    expect(r.itemIds()).toHaveLength(6);
    expect(r.all()).toHaveLength(6);
  });

  it('throws on duplicate ids across tables', () => {
    expect(() => createToolRegistry(axes, defineTools({ iron_axe: tool() }))).toThrow(
      /Duplicate tool item ids across tables: iron_axe/,
    );
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'missing'])(
    'returns undefined for %s',
    (key) => {
      expect(registry.get(key)).toBeUndefined();
    },
  );
});

describe('bestTool', () => {
  it.each([
    ['none owned', [], 99, null],
    ['wrong kind only', ['bronze_pickaxe'], 99, null],
    ['unknown items only', ['logs', 'constructor'], 99, null],
    ['level too low for all', ['iron_axe'], 4, null],
    ['skips axes above level', ['bronze_axe', 'iron_axe', 'steel_axe'], 7, 'iron_axe'],
    ['picks highest ticksSaved', ['bronze_axe', 'steel_axe', 'iron_axe'], 99, 'steel_axe'],
    ['tie -> higher levelRequired', ['steel_axe', 'fast_axe'], 99, 'fast_axe'],
    ['tie -> first owned when equal', ['bronze_axe', 'bronze_axe'], 1, 'bronze_axe'],
  ])('%s', (_n, owned, level, expected) => {
    const result = bestTool(registry, 'axe', owned, lvl(level));
    expect(result?.itemId ?? null).toBe(expected);
    if (expected) expect(result?.def).toBe(registry.get(expected));
  });

  it('uses the level of the tool skill', () => {
    const levelOf = (s: string) => (s === 'woodcutting' ? 1 : 99);
    expect(bestTool(registry, 'axe', ['iron_axe'], levelOf)).toBeNull();
  });

  it('first owned wins an exact tie', () => {
    const r = createToolRegistry(defineTools({ a_axe: tool(), b_axe: tool() }));
    expect(bestTool(r, 'axe', ['b_axe', 'a_axe'], lvl(1))?.itemId).toBe('b_axe');
  });
});

describe('hasTool', () => {
  it('is true when usable, false otherwise', () => {
    expect(hasTool(registry, 'axe', ['iron_axe'], lvl(5))).toBe(true);
    expect(hasTool(registry, 'axe', ['iron_axe'], lvl(4))).toBe(false);
    expect(hasTool(registry, 'pickaxe', [], lvl(99))).toBe(false);
  });
});
