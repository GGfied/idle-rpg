import type { NpcDef } from './types';

export const NPC_DEFS: NpcDef[] = [
  {
    id: 'banker',
    name: 'Banker',
    examine: 'A calm clerk who guards the village strongbox and never loses a coin.',
    spriteKey: 'banker',
    size: 1,
    options: [
      {
        id: 'talk_to',
        label: 'Talk-to',
        intent: { type: 'talk', dialogueId: 'banker_greeting' },
      },
      { id: 'bank', label: 'Bank', intent: { type: 'openPanel', panel: 'bankPanel' } },
    ],
    behaviour: { kind: 'idle' },
  },
];

/** Dialogue ids this module references; `story` must provide them. */
export const REFERENCED_DIALOGUE_IDS: string[] = ['banker_greeting'];
/** Panel ids this module references; `app/ui` must provide them. */
export const REFERENCED_PANEL_IDS: string[] = ['bankPanel'];
