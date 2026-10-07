import { describe, expect, it } from 'vitest';
import { checkItemRefs, createItemRegistry, defineItems } from './index';
import type { ItemDef } from './index';

const item = (over: Partial<ItemDef> = {}): ItemDef => ({
  id: 'logs',
  name: 'Logs',
  examine: 'Some logs.',
  value: 4,
  stackable: false,
  ...over,
});

describe('defineItems', () => {
  it('returns valid defs', () => {
    const defs = [item(), item({ id: 'coins', stackable: true, value: 1 })];
    expect(defineItems(defs)).toEqual(defs);
  });

  it.each([
    ['bad id format', [item({ id: 'Bad-Id' })], /Invalid item id/],
    ['empty id', [item({ id: '' })], /Invalid item id/],
    ['empty name', [item({ name: '  ' })], /empty name/],
    ['negative value', [item({ value: -1 })], /invalid value/],
    ['fractional value', [item({ value: 1.5 })], /invalid value/],
    ['duplicate ids', [item(), item()], /Duplicate item ids: logs/],
  ])('throws on %s', (_n, defs, msg) => {
    expect(() => defineItems(defs)).toThrow(msg);
  });
});

describe('createItemRegistry', () => {
  const reg = createItemRegistry(
    defineItems([item()]),
    defineItems([item({ id: 'coins', stackable: true })]),
  );

  it('looks up items', () => {
    expect(reg.get('logs')?.name).toBe('Logs');
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.has('coins')).toBe(true);
    expect(reg.has('nope')).toBe(false);
    expect(reg.all().map((d) => d.id)).toEqual(['logs', 'coins']);
  });

  it('require throws on unknown id', () => {
    expect(reg.require('logs').id).toBe('logs');
    expect(() => reg.require('nope')).toThrow(/Unknown item id "nope"/);
  });

  it.each([
    ['logs', false],
    ['coins', true],
  ])('isStackable(%s) = %s', (id, expected) => expect(reg.isStackable(id)).toBe(expected));

  it('isStackable throws on unknown id', () => {
    expect(() => reg.isStackable('nope')).toThrow();
  });

  it('throws on duplicate ids across lists', () => {
    expect(() => createItemRegistry([item()], [item()])).toThrow(/across lists: logs/);
  });

  it('works with no lists', () => {
    expect(createItemRegistry().all()).toEqual([]);
  });
});

describe('checkItemRefs', () => {
  const reg = createItemRegistry([item()]);

  it('ok when all ids exist', () => {
    expect(checkItemRefs(reg, ['logs'], 'drops').ok).toBe(true);
    expect(checkItemRefs(reg, [], 'drops').ok).toBe(true);
  });

  it('reports every missing id with context', () => {
    const r = checkItemRefs(reg, ['logs', 'ghost', 'phantom'], 'tree oak');
    expect(r).toEqual({
      ok: false,
      error: ['tree oak: unknown item "ghost"', 'tree oak: unknown item "phantom"'],
    });
  });
});
