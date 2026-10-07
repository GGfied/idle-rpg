import type { NpcDef, NpcOption } from './types';

/** Both bankers offer the same options; only the look and examine line differ. */
const BANKER_OPTIONS: NpcOption[] = [
  { id: 'talk_to', label: 'Talk-to', intent: { type: 'talk', dialogueId: 'banker_greeting' } },
  { id: 'bank', label: 'Bank', intent: { type: 'openPanel', panel: 'bankPanel' } },
];

export const NPC_DEFS: NpcDef[] = [
  {
    id: 'banker',
    name: 'Banker',
    examine: 'A calm clerk who guards the village strongbox and never loses a coin.',
    spriteKey: 'banker',
    size: 1,
    options: BANKER_OPTIONS,
    behaviour: { kind: 'idle' },
  },
  {
    id: 'banker_f',
    name: 'Banker',
    examine: 'A sharp-eyed clerk who keeps the ledgers balanced to the last coin.',
    spriteKey: 'banker_f',
    size: 1,
    options: BANKER_OPTIONS,
    behaviour: { kind: 'idle' },
  },
];

/** Dialogue ids this module references; `story` must provide them. */
export const REFERENCED_DIALOGUE_IDS: string[] = ['banker_greeting'];
/** Panel ids this module references; `app/ui` must provide them. */
export const REFERENCED_PANEL_IDS: string[] = ['bankPanel'];
