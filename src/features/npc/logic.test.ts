import { describe, expect, it } from 'vitest';
import { makeCtx } from '@test-utils/index';
import { createNpcState, intentFor, optionsFor, spawnNpcs, tickNpcs } from './logic';
import type { NpcSpawn } from './types';

const banker: NpcSpawn = { spawnId: 'bank_1', npcId: 'banker', x: 5, y: 6, wanderRadius: 0 };
const inst = (facing: string) => ({ spawnId: 'bank_1', npcId: 'banker', x: 5, y: 6, facing });

describe('spawnNpcs', () => {
  it.each([
    ['maps a spawn, default facing south', [banker], [inst('south')]],
    ['keeps a given facing', [{ ...banker, facing: 'west' as const }], [inst('west')]],
    ['skips unknown npc ids', [{ ...banker, npcId: 'nobody' }], []],
    ['empty list', [], []],
  ])('%s', (_name, spawns, expected) => {
    expect(spawnNpcs(spawns)).toEqual(expected);
  });
});

describe('options and intents', () => {
  it.each([
    ['banker', undefined, { type: 'talk', dialogueId: 'banker_greeting' }],
    ['banker', 'talk_to', { type: 'talk', dialogueId: 'banker_greeting' }],
    ['banker', 'bank', { type: 'openPanel', panel: 'bankPanel' }],
    ['banker', 'nope', undefined],
    ['nobody', undefined, undefined],
  ])('intentFor(%s, %s)', (npc, opt, expected) => {
    expect(intentFor(npc, opt)).toEqual(expected);
  });

  it('optionsFor unknown npc is empty', () => {
    expect(optionsFor('nobody')).toEqual([]);
    expect(optionsFor('banker')).toHaveLength(2);
  });
});

describe('tickNpcs', () => {
  it('idle NPCs do nothing', () => {
    const state = createNpcState([banker]);
    const result = tickNpcs(state, makeCtx(1));
    expect(result.events).toEqual([]);
    expect(result.state).toEqual(state);
  });
});
