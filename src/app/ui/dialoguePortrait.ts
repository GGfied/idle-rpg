import * as render from '@render/index';

type PortraitFn = (lookId: string, sizePx: number) => string;

/** Look id for a dialogue speaker: the player, else the NPC id (looks are keyed by npc/sprite key). */
export function speakerLookId(speaker: string, npcLook?: string | null): string {
  return speaker === 'player' ? speaker : (npcLook ?? speaker);
}

/** Portrait data URL for a speaker, or null when graphics has none (fn missing, throws or returns ''). */
export function speakerPortrait(
  speaker: string,
  sizePx: number,
  fn: PortraitFn | null | undefined = (render as unknown as { portraitUrl?: PortraitFn })
    .portraitUrl,
  npcLook?: string | null,
): string | null {
  if (!fn || !speaker) return null;
  try {
    return fn(speakerLookId(speaker, npcLook), sizePx) || null;
  } catch {
    return null;
  }
}
