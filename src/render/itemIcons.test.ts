import { describe, expect, it } from 'vitest';
import { itemIconUrl, skillIconUrl, uiIconUrl } from './itemIcons';

// Ids hardcoded: render may not import features (dependency rules).
const WOODCUTTING_ITEM_IDS = [
  'logs',
  'oak_logs',
  'bronze_axe',
  'iron_axe',
  'copper_ore',
  'tin_ore',
  'iron_ore',
  'coal',
  'bronze_pickaxe',
  'iron_pickaxe',
  'steel_pickaxe',
  'raw_shrimp',
  'raw_anchovies',
  'raw_sardine',
  'raw_herring',
  'raw_trout',
  'raw_mackerel',
  'small_fishing_net',
  'fishing_rod',
  'fishing_bait',
  // firemaking + cooking
  'tinderbox',
  'ashes',
  'shrimps',
  'anchovies',
  'sardine',
  'herring',
  'trout',
  'mackerel',
  'burnt_fish',
  'raw_chicken',
  'raw_beef',
  'cooked_chicken',
  'cooked_beef',
  'burnt_meat',
];

describe('itemIconUrl', () => {
  it.each(WOODCUTTING_ITEM_IDS)('has an icon for %s', (id) => {
    expect(itemIconUrl(id)).toMatch(/svg/);
  });
  it('returns distinct urls per id', () => {
    expect(new Set(WOODCUTTING_ITEM_IDS.map(itemIconUrl)).size).toBe(WOODCUTTING_ITEM_IDS.length);
  });
  it('returns undefined for unknown ids', () => {
    expect(itemIconUrl('nope')).toBeUndefined();
    expect(itemIconUrl('')).toBeUndefined();
  });
  it('has a bank ui icon and no unknown ui icon', () => {
    expect(uiIconUrl('bank')).toMatch(/svg/);
    expect(uiIconUrl('nope')).toBeUndefined();
  });
});

// Hardcoded: render may not import @core/progression data (keep in sync with SKILLS).
const SKILL_IDS = [
  'attack',
  'strength',
  'defence',
  'hitpoints',
  'ranged',
  'prayer',
  'magic',
  'cooking',
  'woodcutting',
  'fishing',
  'mining',
  'smithing',
  'crafting',
];

describe('skillIconUrl', () => {
  it.each(SKILL_IDS)('has an icon for %s', (id) => {
    expect(skillIconUrl(id)).toMatch(/svg/);
  });
  it('has a distinct url per skill', () => {
    expect(new Set(SKILL_IDS.map(skillIconUrl)).size).toBe(SKILL_IDS.length);
  });
  it('returns undefined for unknown ids', () => {
    expect(skillIconUrl('nope')).toBeUndefined();
    expect(skillIconUrl('')).toBeUndefined();
  });
});

// Discriminating checks: the URL for an id must lead to THAT id's own file, not just "some svg".
const rawFiles = (glob: Record<string, string>): Map<string, string> =>
  new Map(
    Object.entries(glob).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]),
  );
const ITEM_FILES = rawFiles(
  import.meta.glob('/src/assets/sprites/items/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>,
);
const SKILL_FILES = rawFiles(
  import.meta.glob('/src/assets/sprites/skills/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>,
);
const UI_FILES = rawFiles(
  import.meta.glob('/src/assets/sprites/ui/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>,
);

/** Each path's fill colour and shape: stable across Vite's data-URL minifying, quoting and encoding. */
const shapes = (svg: string): string[] =>
  [...svg.matchAll(/<path\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const attr = (name: string): string =>
      new RegExp(`\\s${name}=['"]([^'"]+)['"]`).exec(tag)?.[1] ?? '';
    return `${attr('fill').toLowerCase()}|${attr('d')}`;
  });

/** What the URL serves: the same drawing as the file for a data: URL, otherwise a link to that file. */
function leadsTo(url: string | undefined, id: string, svg: string): boolean {
  if (!url || shapes(svg).length === 0) return false;
  if (url.startsWith('data:')) {
    const body = url.slice(url.indexOf(',') + 1);
    const text = url.includes(';base64,') ? atob(body) : decodeURIComponent(body);
    return JSON.stringify(shapes(text)) === JSON.stringify(shapes(svg));
  }
  return url.endsWith(`/${id}.svg`) || url.includes(`/${id}.svg?`);
}

describe('icon urls lead to their own file', () => {
  it('the icon folders hold exactly the ids the tests know about', () => {
    expect([...ITEM_FILES.keys()].sort()).toEqual([...WOODCUTTING_ITEM_IDS].sort());
    expect([...SKILL_FILES.keys()].sort()).toEqual([...SKILL_IDS].sort());
    expect([...UI_FILES.keys()]).toEqual(['bank']);
  });
  it.each(WOODCUTTING_ITEM_IDS)('item %s', (id) => {
    expect(leadsTo(itemIconUrl(id), id, ITEM_FILES.get(id) ?? '')).toBe(true);
  });
  it.each(SKILL_IDS)('skill %s', (id) => {
    expect(leadsTo(skillIconUrl(id), id, SKILL_FILES.get(id) ?? '')).toBe(true);
  });
  it('ui bank', () => {
    expect(leadsTo(uiIconUrl('bank'), 'bank', UI_FILES.get('bank') ?? '')).toBe(true);
  });
  it.each(['ban', 'ank', 'bank.svg', 'BANK', ' bank'])('ui name %j is not a partial match', (n) => {
    expect(uiIconUrl(n)).toBeUndefined();
  });
  it.each(['bronze', 'axe', 'LOGS', 'logs ', 'Logs'])(
    'item name %j is not a partial match',
    (n) => {
      expect(itemIconUrl(n)).toBeUndefined();
    },
  );
});

// Raw / cooked / burnt food must be told apart at a glance: each state is its own drawing.
const FOOD_STATES: Record<string, [string, string, string]> = {
  shrimp: ['raw_shrimp', 'shrimps', 'burnt_fish'],
  anchovies: ['raw_anchovies', 'anchovies', 'burnt_fish'],
  sardine: ['raw_sardine', 'sardine', 'burnt_fish'],
  herring: ['raw_herring', 'herring', 'burnt_fish'],
  trout: ['raw_trout', 'trout', 'burnt_fish'],
  mackerel: ['raw_mackerel', 'mackerel', 'burnt_fish'],
  chicken: ['raw_chicken', 'cooked_chicken', 'burnt_meat'],
  beef: ['raw_beef', 'cooked_beef', 'burnt_meat'],
};
/** Opaque pixels of an icon: sum of 'h<run>' widths over its path data. */
const opaquePixels = (svg: string): number =>
  [...svg.matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);

describe('food states are visibly different icons', () => {
  it.each(Object.entries(FOOD_STATES))('%s: raw, cooked and burnt differ', (_food, ids) => {
    const drawn = ids.map((id) => JSON.stringify(shapes(ITEM_FILES.get(id) ?? '')));
    expect(new Set(drawn).size).toBe(3);
    expect(new Set(ids.map((id) => itemIconUrl(id))).size).toBe(3);
  });
  it.each(Object.entries(FOOD_STATES))('%s: burnt is smaller than cooked', (_food, ids) => {
    const [, cooked, burnt] = ids.map((id) => opaquePixels(ITEM_FILES.get(id) ?? ''));
    expect(burnt).toBeLessThan(cooked ?? 0);
  });
});
