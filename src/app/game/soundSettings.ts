import type { Preferences } from '@core/persistence';

export type SoundChannel = keyof Preferences['sound']['volumes'];

export const SOUND_CHANNELS: readonly SoundChannel[] = ['master', 'sfx', 'ui', 'music', 'ambience'];

/** The sound slice of the preferences (the one source of truth is core/persistence). */
export type SoundSettings = Preferences['sound'];

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** What the store needs from the audio system; `setChannelVolume` is absent on older audio builds. */
export interface AudioControl {
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  setChannelVolume?(channel: SoundChannel, volume: number): void;
  play(id: 'logGained'): void;
}

/** Pushes one channel to audio, mapping master to `setVolume` when channels are unsupported. */
export function applyChannel(audio: AudioControl, channel: SoundChannel, v: number): void {
  if (typeof audio.setChannelVolume === 'function') audio.setChannelVolume(channel, v);
  else if (channel === 'master') audio.setVolume(v);
}
