import type { DialogueDef } from './types';

export const DIALOGUES: DialogueDef[] = [
  {
    id: 'banker_greeting',
    npcId: 'banker',
    npcName: 'Banker',
    start: 'hello',
    nodes: {
      hello: {
        type: 'say',
        speaker: 'npc',
        text: 'Good day! Welcome to Willowbrook Bank. How can I help?',
        next: 'menu',
      },
      menu: {
        type: 'choice',
        options: [
          { text: "I'd like to access my bank.", next: 'open' },
          { text: 'What is this place?', next: 'about' },
          { text: 'Nothing, thanks.', next: 'bye' },
        ],
      },
      open: { type: 'action', intent: { type: 'openPanel', panel: 'bankPanel' }, next: 'bye' },
      about: {
        type: 'say',
        speaker: 'npc',
        text: 'We keep your things safe, so your pack stays light.',
        next: 'menu',
      },
      bye: { type: 'end' },
    },
  },
];
