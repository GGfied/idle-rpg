export type DialogueKeyAction =
  { type: 'advance' } | { type: 'choose'; index: number } | { type: 'close' };

interface KeyView {
  choices: readonly { locked: boolean }[];
}

/**
 * Maps a key press to a dialogue intent. Say node: Space/Enter advance. Choice node: 1-9 pick the
 * matching choice (locked or missing ones do nothing). Escape always closes.
 */
export function dialogueKeyAction(key: string, view: KeyView): DialogueKeyAction | null {
  if (key === 'Escape') return { type: 'close' };
  const isChoice = view.choices.length > 0;
  if (!isChoice) return key === ' ' || key === 'Enter' ? { type: 'advance' } : null;
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  const choice = view.choices[index];
  return choice && !choice.locked ? { type: 'choose', index } : null;
}

/** Whether a tap on the panel itself advances (only say nodes; choices use their buttons). */
export const tapAdvances = (view: KeyView): boolean => view.choices.length === 0;
