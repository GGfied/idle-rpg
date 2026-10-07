import { describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import { createAppStore } from '@app/store';
import type { AudioControl } from '@app/game/soundSettings';

const fakeAudio = (channels: boolean): AudioControl & { calls: unknown[][] } => {
  const calls: unknown[][] = [];
  const a: AudioControl & { calls: unknown[][] } = {
    calls,
    setMuted: (m) => calls.push(['mute', m]),
    setVolume: (v) => calls.push(['volume', v]),
    play: (id) => calls.push(['play', id]),
  };
  if (channels) a.setChannelVolume = (c, v) => calls.push(['channel', c, v]);
  return a;
};

describe('sound store actions', () => {
  it('setSoundVolume clamps, updates state and drives the channel', () => {
    const store = createAppStore(newGame(CONTENT));
    const audio = fakeAudio(true);
    store.getState().attachAudio(audio);
    store.getState().setSoundVolume('sfx', 3);
    expect(store.getState().sound.volumes.sfx).toBe(1);
    store.getState().setSoundVolume('ui', 0.4);
    expect(store.getState().sound.volumes).toMatchObject({ ui: 0.4 });
    // sfx clamps to 1, which is already its value: no change, no audio call.
    expect(audio.calls).toEqual([['channel', 'ui', 0.4]]);
  });
  it('without setChannelVolume, master maps to setVolume and other channels are ignored', () => {
    const store = createAppStore(newGame(CONTENT));
    const audio = fakeAudio(false);
    store.getState().attachAudio(audio);
    store.getState().setSoundVolume('master', 0.5);
    store.getState().setSoundVolume('sfx', 0.2);
    expect(audio.calls).toEqual([['volume', 0.5]]);
    expect(store.getState().sound.volumes.sfx).toBe(0.2);
  });
  it('toggleMute flips state and audio; playTestSound plays logGained', () => {
    const store = createAppStore(newGame(CONTENT));
    const audio = fakeAudio(true);
    store.getState().attachAudio(audio);
    store.getState().toggleMute();
    expect(store.getState().sound.muted).toBe(true);
    store.getState().toggleMute();
    expect(store.getState().sound.muted).toBe(false);
    store.getState().playTestSound();
    expect(audio.calls).toEqual([
      ['mute', true],
      ['mute', false],
      ['play', 'logGained'],
    ]);
  });
  it('works before audio is attached, and settings open/close', () => {
    const store = createAppStore(newGame(CONTENT));
    const spy = vi.fn();
    store.getState().playTestSound();
    store.getState().toggleMute();
    expect(store.getState().sound.muted).toBe(true);
    store.subscribe(spy);
    store.getState().openSettings();
    expect(store.getState().settingsOpen).toBe(true);
    store.getState().closeSettings();
    expect(store.getState().settingsOpen).toBe(false);
  });
});
