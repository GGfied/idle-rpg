import { MINING_MESSAGES, MINING_NODES } from './data';
import type { GatherDef } from '@core/skills';

export const getRockDef = (id: string): GatherDef | undefined =>
  MINING_NODES.find((d) => d.id === id);

/** The "need level N" chat line for a rock id, or null for an unknown rock. */
export function levelTooLowMessage(rockId: string): string | null {
  const def = getRockDef(rockId);
  return def
    ? MINING_MESSAGES.stopped.levelTooLow.replace('{level}', String(def.requiredLevel))
    : null;
}
