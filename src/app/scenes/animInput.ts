/** The animator input for the player this frame (pure): gathering OR fishing, with the tool kind in use. */
export interface AnimInputArgs {
  moving: boolean;
  /** Tool kind of the active gather session (undefined when none or unknown). */
  gatherToolKind: string | undefined;
  gathering: boolean;
  /** Tool kind of the active fishing method (undefined when not fishing). */
  fishToolKind: string | undefined;
  fishing: boolean;
  /** 'lighting' | 'cooking' while the player does that (their tool kind for the animator); null/absent otherwise. */
  fireAction?: 'lighting' | 'cooking' | null;
}

export interface PlayerAnimInput {
  moving: boolean;
  gathering: boolean;
  toolKind: string | undefined;
}

/** Fishing has its own session, so it counts as gathering with the method's tool kind; gather path is unchanged. */
export function playerAnimInput(a: AnimInputArgs): PlayerAnimInput {
  if (a.fireAction) return { moving: a.moving, gathering: true, toolKind: a.fireAction };
  if (a.fishing) return { moving: a.moving, gathering: true, toolKind: a.fishToolKind };
  return { moving: a.moving, gathering: a.gathering, toolKind: a.gatherToolKind };
}

/** True when this tick's events hold a fishing catch made with the rod (the player animator then plays its catch pulse). */
export function rodCatchLanded(
  events: readonly { type: string; skill?: string }[],
  fishToolKind: string | undefined,
): boolean {
  return (
    fishToolKind === 'rod' && events.some((e) => e.type === 'itemGathered' && e.skill === 'fishing')
  );
}
