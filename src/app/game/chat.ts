import type { ChatLine, GameState } from '@app/game/types';

/** Chat keeps only the newest lines. */
export const CHAT_LIMIT = 50;

/**
 * Which chat lines survive `notifications.gameMessages = false`. Routine game messages (gathering
 * progress, examine text, drops, bank receipts) are hidden; lines marked `important` always stay:
 * errors and warnings ("I can't reach that", level too low, inventory full, bank errors) and level-ups.
 * Rule: a line is important if the player must act on it or it reports a milestone.
 */
export const IMPORTANT_CHAT_RULE = 'errors, warnings and level-ups are never hidden';

function append(state: GameState, important: boolean, texts: string[]): GameState {
  const lines = texts.filter((t) => t !== '');
  if (lines.length === 0) return state;
  let id = state.chat[state.chat.length - 1]?.id ?? 0;
  const added: ChatLine[] = lines.map((text) =>
    important ? { id: ++id, text, important } : { id: ++id, text },
  );
  return { ...state, chat: [...state.chat, ...added].slice(-CHAT_LIMIT) };
}

/** Append routine lines (oldest dropped past CHAT_LIMIT). Empty strings are skipped. */
export function addChat(state: GameState, ...texts: string[]): GameState {
  return append(state, false, texts);
}

/** Append error, warning or level-up lines: these stay even when game messages are hidden. */
export function addImportantChat(state: GameState, ...texts: string[]): GameState {
  return append(state, true, texts);
}

/**
 * With game messages off, drops the routine lines added between `prev` and `next` (new lines have
 * ids above prev's newest). Important lines and earlier history are kept.
 */
export function filterNewChat(prev: GameState, next: GameState, gameMessages: boolean): GameState {
  if (gameMessages || next.chat === prev.chat) return next;
  const lastId = prev.chat[prev.chat.length - 1]?.id ?? 0;
  const chat = next.chat.filter((l) => l.id <= lastId || l.important === true);
  return chat.length === next.chat.length ? next : { ...next, chat };
}
