import { describe, expect, it } from 'vitest';
import { nextAnimState } from '@render/animation';
import { playerAnimInput, rodCatchLanded } from '@app/scenes/animInput';

const base = {
  moving: false,
  gathering: false,
  gatherToolKind: undefined,
  fishing: false,
  fishToolKind: undefined,
};

describe('playerAnimInput', () => {
  it('net fishing = gathering with the net kind -> fishNet pose', () => {
    const i = playerAnimInput({ ...base, fishing: true, fishToolKind: 'net' });
    expect(i).toEqual({ moving: false, gathering: true, toolKind: 'net' });
    expect(nextAnimState('idle', i)).toBe('fishNet');
  });

  it('rod fishing = gathering with the rod kind -> fishRod pose', () => {
    const i = playerAnimInput({ ...base, fishing: true, fishToolKind: 'rod' });
    expect(nextAnimState('idle', i)).toBe('fishRod');
  });

  it('not fishing: the old gather input, unchanged', () => {
    expect(playerAnimInput({ ...base, gathering: true, gatherToolKind: 'axe' })).toEqual({
      moving: false,
      gathering: true,
      toolKind: 'axe',
    });
    expect(playerAnimInput(base)).toEqual({ moving: false, gathering: false, toolKind: undefined });
  });

  it('walking still wins over fishing', () => {
    const i = playerAnimInput({ ...base, moving: true, fishing: true, fishToolKind: 'net' });
    expect(nextAnimState('fishNet', i)).toBe('walk');
  });
});

describe('fire actions feed the animator', () => {
  it('lighting and cooking = gathering with that tool kind', () => {
    const l = playerAnimInput({ ...base, fireAction: 'lighting' });
    expect(l).toEqual({ moving: false, gathering: true, toolKind: 'lighting' });
    expect(nextAnimState('idle', l)).toBe('lighting');
    expect(nextAnimState('idle', playerAnimInput({ ...base, fireAction: 'cooking' }))).toBe(
      'cooking',
    );
  });
  it('walking wins; no action returns to idle', () => {
    const w = playerAnimInput({ ...base, moving: true, fireAction: 'cooking' });
    expect(nextAnimState('cooking', w)).toBe('walk');
    expect(nextAnimState('cooking', playerAnimInput({ ...base, fireAction: null }))).toBe('idle');
  });
});

describe('rodCatchLanded', () => {
  const caught = [{ type: 'itemGathered', skill: 'fishing' }];
  it('rod catch -> pulse', () => expect(rodCatchLanded(caught, 'rod')).toBe(true));
  it('net catch -> no pulse', () => expect(rodCatchLanded(caught, 'net')).toBe(false));
  it('a miss (attempt only) -> no pulse', () =>
    expect(rodCatchLanded([{ type: 'fishingAttempt' }], 'rod')).toBe(false));
  it('a non-fishing catch -> no pulse', () =>
    expect(rodCatchLanded([{ type: 'itemGathered', skill: 'mining' }], 'rod')).toBe(false));
});
