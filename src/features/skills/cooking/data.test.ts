import { describe, expect, it } from 'vitest';
import { createItemRegistry } from '@core/items';
import { COOKING_ITEMS, COOKING_RECIPES } from './index';

const items = createItemRegistry(COOKING_ITEMS);

describe('food naming rule: Raw / Cooked / Burnt', () => {
  it.each(COOKING_RECIPES.map((r) => [r.rawId, r] as const))('%s recipe names', (_id, r) => {
    expect(items.get(r.cookedId)?.name).toMatch(/^Cooked /);
    expect(items.get(r.burntId)?.name).toMatch(/^Burnt /);
    // Raw fish are defined by fishing (not imported here); check every raw item cooking itself defines.
    const raw = items.get(r.rawId);
    if (raw) expect(raw.name).toMatch(/^Raw /);
  });

  it('checks at least the raw items cooking defines', () => {
    expect(COOKING_RECIPES.filter((r) => items.get(r.rawId)).length).toBeGreaterThan(0);
  });
});
