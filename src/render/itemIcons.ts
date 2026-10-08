// Item icon lookup for the HUD. Pure Vite asset URLs: no Phaser import, safe to use from any layer.
const ICON_URLS = import.meta.glob('/src/assets/sprites/items/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_ID = new Map<string, string>();
for (const [path, url] of Object.entries(ICON_URLS)) {
  const id = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
  BY_ID.set(id, url);
}

/** URL of the icon for an item id, or undefined when there is none (the slot falls back to text). */
export function itemIconUrl(id: string): string | undefined {
  return BY_ID.get(id);
}

/** Where an item's picture comes from, shared by EVERY view (inventory, bank, shop via ItemSlot, drag ghost, ground). */
export interface ItemIconSource {
  /** Stable texture key for engines that need one (Phaser); derived only from the item id. */
  key: string;
  url: string;
}

/** The one icon source for an item id, or undefined when it has no art. Built on itemIconUrl: never a second drawing. */
export function itemIconSource(id: string): ItemIconSource | undefined {
  const url = BY_ID.get(id);
  return url === undefined ? undefined : { key: `item_icon_${id}`, url };
}

/** Every item id that has icon art (for tests and previews). */
export function itemIconIds(): string[] {
  return [...BY_ID.keys()].sort();
}

const UI_URLS = import.meta.glob('/src/assets/sprites/ui/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** URL of a HUD icon by name (e.g. 'bank'), or undefined. */
export function uiIconUrl(name: string): string | undefined {
  const hit = Object.entries(UI_URLS).find(([p]) => p.endsWith(`/${name}.svg`));
  return hit?.[1];
}

const SKILL_URLS = import.meta.glob('/src/assets/sprites/skills/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const SKILL_BY_ID = new Map<string, string>();
for (const [path, url] of Object.entries(SKILL_URLS)) {
  SKILL_BY_ID.set(path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url);
}

/** URL of the icon for a skill id (attack, woodcutting, ...), or undefined when there is none. */
export function skillIconUrl(id: string): string | undefined {
  return SKILL_BY_ID.get(id);
}
