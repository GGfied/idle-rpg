import { describe, expect, it } from 'vitest';
import { evaluateRequirement, type RequirementContext } from './requirements';
import type { Requirement } from './types';

const ctx: RequirementContext = {
  skillLevel: (id) => (id === 'woodcutting' ? 5 : 20),
  itemCount: (id) => (id === 'oak_logs' ? 2 : 9),
  questDone: (id) => id === 'done_quest',
  flag: (id) => id === 'seen_king',
  name: (kind, id) => (kind === 'skill' ? id.charAt(0).toUpperCase() + id.slice(1) : titled(id)),
};
const titled = (id: string): string => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const cases: [
  string,
  Requirement,
  RequirementContext,
  boolean,
  string,
  number | string | undefined,
][] = [
  [
    'skill unmet',
    { type: 'skillLevel', skill: 'woodcutting', level: 15 },
    ctx,
    false,
    'Requires Woodcutting 15 (you: 5)',
    5,
  ],
  [
    'skill met',
    { type: 'skillLevel', skill: 'mining', level: 15 },
    ctx,
    true,
    'Requires Mining 15 (you: 20)',
    20,
  ],
  [
    'skill exact',
    { type: 'skillLevel', skill: 'woodcutting', level: 5 },
    ctx,
    true,
    'Requires Woodcutting 5 (you: 5)',
    5,
  ],
  [
    'item unmet',
    { type: 'item', itemId: 'oak_logs', count: 5 },
    ctx,
    false,
    'Requires 5 Oak logs (you: 2)',
    2,
  ],
  [
    'item met',
    { type: 'item', itemId: 'oak_logs', count: 2 },
    ctx,
    true,
    'Requires 2 Oak logs (you: 2)',
    2,
  ],
  [
    'item default count',
    { type: 'item', itemId: 'coal' },
    ctx,
    true,
    'Requires 1 Coal (you: 9)',
    9,
  ],
  [
    'quest unmet',
    { type: 'quest', questId: 'cooks_help' },
    ctx,
    false,
    'Requires Cooks help (you: not complete)',
    'not complete',
  ],
  [
    'quest met',
    { type: 'quest', questId: 'done_quest' },
    ctx,
    true,
    'Requires Done quest (you: complete)',
    'complete',
  ],
  [
    'flag unmet',
    { type: 'flag', flag: 'met_king' },
    ctx,
    false,
    'Requires Met king (you: no)',
    'no',
  ],
  [
    'flag met',
    { type: 'flag', flag: 'seen_king' },
    ctx,
    true,
    'Requires Seen king (you: yes)',
    'yes',
  ],
  [
    'no name resolver',
    { type: 'item', itemId: 'oak_logs', count: 5 },
    { ...ctx, name: undefined },
    false,
    'Requires 5 Oak logs (you: 2)',
    2,
  ],
  ['hidden unmet', { type: 'flag', flag: 'met_king', hidden: true }, ctx, false, '???', undefined],
  [
    'hidden unmet hint',
    { type: 'flag', flag: 'met_king', hidden: true, hint: 'Find the king' },
    ctx,
    false,
    'Find the king',
    undefined,
  ],
  [
    'hidden met reveals',
    { type: 'flag', flag: 'seen_king', hidden: true },
    ctx,
    true,
    'Requires Seen king (you: yes)',
    'yes',
  ],
];

describe('evaluateRequirement', () => {
  it.each(cases)('%s', (_n, req, c, met, text, current) => {
    const r = evaluateRequirement(req, c);
    expect(r.met).toBe(met);
    expect(r.text).toBe(text);
    expect(r.current).toBe(current);
  });
});
