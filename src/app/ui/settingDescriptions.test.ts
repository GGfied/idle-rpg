import { describe, expect, it } from 'vitest';
import { PREF_DESCRIPTIONS, volumeDescription, type VolumeChannel } from './settingDescriptions';

describe('settingDescriptions', () => {
  it('describes every step of every volume channel, all distinct per channel', () => {
    for (const ch of ['master', 'sfx', 'ui', 'music', 'ambience'] as VolumeChannel[]) {
      const all = [0, 1, 2, 3, 4, 5].map((s) => volumeDescription(ch, s));
      all.forEach((d) => expect(d.length).toBeGreaterThan(0));
      expect(new Set(all).size).toBe(6);
    }
    expect(volumeDescription('master', 0)).toBe('All sound off');
    expect(volumeDescription('sfx', 3)).toBe('Normal');
  });
  it('music and ambience off lines', () => {
    expect(volumeDescription('music', 0)).toBe('No music');
    expect(volumeDescription('ambience', 0)).toBe('No ambience');
  });
  it('clamps out-of-range steps', () => {
    expect(volumeDescription('ui', 9)).toBe('Maximum');
    expect(volumeDescription('ui', -2)).toBe('No menu clicks');
  });
  it('every pref value has a non-empty description, and the two values differ', () => {
    for (const [path, values] of Object.entries(PREF_DESCRIPTIONS)) {
      const texts = Object.values(values);
      expect(texts.length, path).toBeGreaterThanOrEqual(2);
      texts.forEach((t) => expect(t.length, path).toBeGreaterThan(0));
      expect(new Set(texts).size, path).toBe(texts.length);
    }
  });
  it('area names describes on and off', () => {
    expect(PREF_DESCRIPTIONS['notifications.areaNames'].true).toBe(
      'Show the area name when you enter a new place',
    );
    expect(PREF_DESCRIPTIONS['notifications.areaNames'].false).toBe('Area names hidden');
  });
});
