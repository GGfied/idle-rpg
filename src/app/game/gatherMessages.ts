/** Chat text for gathering, per skill: woodcutting and mining each own their lines. */
import type { GatherStopReason } from '@core/skills';
import { MINING_MESSAGES, levelTooLowMessage as rockTooLow } from '@features/skills/mining';
import {
  WOODCUTTING_MESSAGES,
  levelTooLowMessage as treeTooLow,
} from '@features/skills/woodcutting';

type StopReason = GatherStopReason;

const isRock = (defId: string | undefined): boolean =>
  defId !== undefined && rockTooLow(defId) !== null;

/** "You chop/mine ..." line for a gathered item ('' when unknown). */
export const gatheredLine = (itemId: string): string =>
  WOODCUTTING_MESSAGES.gathered[itemId] ?? MINING_MESSAGES.gathered[itemId] ?? '';

/** The line for a gather that stopped, by the def being gathered. */
export function stoppedLine(defId: string | undefined, reason: StopReason): string {
  if (reason === 'levelTooLow' && defId) return treeTooLow(defId) ?? rockTooLow(defId) ?? '';
  return (isRock(defId) ? MINING_MESSAGES : WOODCUTTING_MESSAGES).stopped[reason];
}

/** The per-swing line for a def ('' means none). */
export const startedLine = (defId: string | undefined): string =>
  isRock(defId) ? MINING_MESSAGES.started : WOODCUTTING_MESSAGES.started;

/** Chat line for clicking a tree that is already a stump. */
export const NOTHING_TO_CHOP = "There's nothing left to chop.";

/** Chat line for clicking a node that is already empty. */
export const nothingLeft = (defId: string | undefined): string =>
  isRock(defId) ? 'There is no ore left in this rock.' : NOTHING_TO_CHOP;
