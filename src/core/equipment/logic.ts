import { findDuplicates, isValidId } from '@core/utils';
import type { OwnedTool, ToolDef, ToolRegistry, ToolTable } from './types';

/** Validates a tool table at load time. Throws with a clear message. */
export function defineTools(table: Readonly<Record<string, ToolDef>>): ToolTable {
  const out = new Map<string, ToolDef>();
  for (const [id, def] of Object.entries(table)) {
    if (!isValidId(id)) throw new Error(`Invalid tool item id "${id}" (must be snake_case)`);
    if (def.kind.trim() === '') throw new Error(`Tool "${id}" has an empty kind`);
    if (def.skill.trim() === '') throw new Error(`Tool "${id}" has an empty skill`);
    if (!Number.isInteger(def.levelRequired) || def.levelRequired < 1 || def.levelRequired > 99) {
      throw new Error(`Tool "${id}" has invalid levelRequired ${def.levelRequired} (1..99 int)`);
    }
    if (!Number.isInteger(def.ticksSaved) || def.ticksSaved < 0) {
      throw new Error(`Tool "${id}" has invalid ticksSaved ${def.ticksSaved} (int >= 0)`);
    }
    out.set(id, def);
  }
  return out;
}

/** Merges tool tables from every module. Duplicate item ids across tables throw. */
export function createToolRegistry(...tables: readonly ToolTable[]): ToolRegistry {
  const entries = tables.flatMap((t) => [...t.entries()]);
  const dupes = findDuplicates(entries.map(([id]) => id));
  if (dupes.length > 0)
    throw new Error(`Duplicate tool item ids across tables: ${dupes.join(', ')}`);
  const byId = new Map(entries);
  return {
    get: (itemId) => byId.get(itemId),
    all: () => entries,
    itemIds: () => entries.map(([id]) => id),
  };
}

/**
 * Best tool of `kind` the player owns and has the level for: highest ticksSaved,
 * ties -> higher levelRequired, then first owned.
 */
export function bestTool(
  registry: ToolRegistry,
  kind: string,
  ownedItemIds: readonly string[],
  levelOf: (skill: string) => number,
): OwnedTool | null {
  let best: OwnedTool | null = null;
  for (const itemId of ownedItemIds) {
    const def = registry.get(itemId);
    if (!def || def.kind !== kind || levelOf(def.skill) < def.levelRequired) continue;
    if (
      best === null ||
      def.ticksSaved > best.def.ticksSaved ||
      (def.ticksSaved === best.def.ticksSaved && def.levelRequired > best.def.levelRequired)
    ) {
      best = { itemId, def };
    }
  }
  return best;
}

export function hasTool(
  registry: ToolRegistry,
  kind: string,
  ownedItemIds: readonly string[],
  levelOf: (skill: string) => number,
): boolean {
  return bestTool(registry, kind, ownedItemIds, levelOf) !== null;
}
