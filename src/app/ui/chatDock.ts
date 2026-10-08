import type { ChatLine } from '@app/game/types';

/** True when a line newer than `seenId` exists. */
export const hasUnread = (chat: readonly ChatLine[], seenId: number): boolean =>
  (chat[chat.length - 1]?.id ?? 0) > seenId;

/** The newest important (amber) line after `afterId`, for the small toast beside the chat button. */
export function peekLine(chat: readonly ChatLine[], afterId: number): ChatLine | null {
  for (let i = chat.length - 1; i >= 0; i--) {
    const line = chat[i];
    if (!line || line.id <= afterId) break;
    if (line.important) return line;
  }
  return null;
}
