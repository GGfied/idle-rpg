import { err, findDuplicates, isValidId, ok } from '@core/utils';
import type { Result } from '@core/utils';
import type { ItemDef, ItemRegistry } from './types';

/** Validates a list of item definitions at load time. Throws with a clear message. */
export function defineItems(defs: readonly ItemDef[]): readonly ItemDef[] {
  for (const def of defs) {
    if (!isValidId(def.id)) throw new Error(`Invalid item id "${def.id}" (must be snake_case)`);
    if (def.name.trim() === '') throw new Error(`Item "${def.id}" has an empty name`);
    if (!Number.isInteger(def.value) || def.value < 0) {
      throw new Error(`Item "${def.id}" has invalid value ${def.value} (must be an integer >= 0)`);
    }
  }
  const dupes = findDuplicates(defs.map((d) => d.id));
  if (dupes.length > 0) throw new Error(`Duplicate item ids: ${dupes.join(', ')}`);
  return defs;
}

/** Merges item lists from every module into one lookup. Duplicate ids across lists throw. */
export function createItemRegistry(...lists: readonly (readonly ItemDef[])[]): ItemRegistry {
  const all = lists.flat();
  const dupes = findDuplicates(all.map((d) => d.id));
  if (dupes.length > 0) throw new Error(`Duplicate item ids across lists: ${dupes.join(', ')}`);
  const byId = new Map(all.map((d) => [d.id, d]));
  const require = (id: string): ItemDef => {
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown item id "${id}"`);
    return def;
  };
  return {
    get: (id) => byId.get(id),
    require,
    has: (id) => byId.has(id),
    all: () => all,
    isStackable: (id) => require(id).stackable,
  };
}

/** Generic content check: every id must exist in the registry. */
export function checkItemRefs(
  registry: ItemRegistry,
  ids: readonly string[],
  context: string,
): Result<void, string[]> {
  const errors = ids
    .filter((id) => !registry.has(id))
    .map((id) => `${context}: unknown item "${id}"`);
  return errors.length > 0 ? err(errors) : ok(undefined);
}
