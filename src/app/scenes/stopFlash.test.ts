import { describe, expect, it } from 'vitest';
import { gatherStoppedEvent } from '@core/skills';
import { createFishingSystem, startFailedEvent } from '@app/game/fishing';
import { flashEvent } from '@app/scenes/stopFlash';

const fish = (reason: string, extra: Record<string, unknown> = {}) => ({
  type: 'fishingStopped',
  spotId: 's1',
  defId: 'net_spot',
  reason,
  ...extra,
});

describe('fishing stop flash', () => {
  it('maps blocking reasons to the gatherStopped shape the vfx cues key on', () => {
    for (const reason of ['levelTooLow', 'noTool', 'noBait', 'inventoryFull']) {
      const f = flashEvent(fish(reason));
      expect(f.type).toBe('gatherStopped');
      expect(f.reason).toBe(reason);
      expect(f.nodeId).toBe('s1');
    }
  });

  it('has the same fields as the gather equivalent, so the same cue and label fire', () => {
    const g = gatherStoppedEvent('s1', 'net_spot', 'levelTooLow', {
      requiredLevel: 15,
    } as unknown as Parameters<typeof gatherStoppedEvent>[3]);
    const f = flashEvent(fish('levelTooLow', { requiredLevel: 15 }));
    expect(f).toMatchObject({ ...g });
    expect(flashEvent(fish('noTool', { tool: 'net' }))).toMatchObject({ tool: 'net' });
  });

  it('spotMoved and cancelled get no flash (event unchanged, never gatherStopped)', () => {
    for (const reason of ['spotMoved', 'cancelled']) {
      const e = fish(reason);
      expect(flashEvent(e)).toBe(e);
    }
  });

  it('a failed direct start carries the detail the flash needs', () => {
    const e = startFailedEvent('s1', 'net_spot', 'levelTooLow');
    expect(e.type === 'fishingStopped' && e.requiredLevel).toBeGreaterThanOrEqual(1);
    expect(typeof createFishingSystem).toBe('function');
  });
});
