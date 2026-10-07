/** Starts, advances and closes the conversation held in `GameState.talk`. */
import type { Requirement } from '@core/contracts';
import { addItem } from '@core/inventory';
import { advance, getDialogue, startDialogue } from '@features/story';
import type { DialogueIntent, DialogueState } from '@features/story';
import type { Content } from '@app/registry';
import { addChat } from '@app/game/chat';
import { applyIntent } from '@app/game/intents';
import { meets } from '@app/game/requirements';
import type { GameState } from '@app/game/types';

const ctxFor = (game: GameState) => ({ meets: (r: Requirement) => meets(game, r) });

/** Begin a conversation with the NPC at `spawnId`. An unknown dialogue id changes nothing. */
export function startTalk(
  game: GameState,
  spawnId: string,
  dialogueId: string,
  vars?: Readonly<Record<string, string>>,
): GameState {
  if (!getDialogue(dialogueId)) return game;
  const dialogue: DialogueState = startDialogue(dialogueId, ctxFor(game), vars);
  return { ...game, talk: { spawnId, dialogue } };
}

export const closeTalk = (game: GameState): GameState =>
  game.talk ? { ...game, talk: null } : game;

/** Apply what a dialogue node asked for. TODO: setFlag, grantXp, startCombat once their owners expose them. */
function applyDialogueIntent(game: GameState, content: Content, i: DialogueIntent): GameState {
  if (i.type === 'openPanel') return applyIntent(game, i);
  if (i.type === 'giveItem') {
    const r = addItem(game.inventory, content.items, i.itemId, i.count ?? 1);
    return r.ok ? { ...game, inventory: r.value } : addChat(game, 'Your inventory is full.');
  }
  return game;
}

/** Continue (say node) or pick a choice by index. Finishing the dialogue closes the box. */
export function advanceTalk(game: GameState, content: Content, choiceIndex?: number): GameState {
  if (!game.talk) return game;
  // Re-bind the context so requirements are judged against the game as it is now.
  const current = { ...game.talk.dialogue, ctx: ctxFor(game) };
  const r = advance(current, choiceIndex);
  let next = game;
  for (const intent of r.intents) next = applyDialogueIntent(next, content, intent);
  return { ...next, talk: r.done ? null : { spawnId: game.talk.spawnId, dialogue: r.state } };
}
