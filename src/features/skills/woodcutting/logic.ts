import { WOODCUTTING_MESSAGES, WOODCUTTING_NODES } from './data';
import type { GatherDef } from '@core/skills';

export const getTreeDef = (id: string): GatherDef | undefined =>
  WOODCUTTING_NODES.find((d) => d.id === id);

/** The "need level N" chat line for a tree id, or null for an unknown tree. */
export function levelTooLowMessage(treeId: string): string | null {
  const def = getTreeDef(treeId);
  return def
    ? WOODCUTTING_MESSAGES.stopped.levelTooLow.replace('{level}', String(def.requiredLevel))
    : null;
}
