/** Boots the game: save load, store, the 600 ms tick loop, autosave and lifecycle. No UI, no Phaser. */
import { createRng, createTicker, startTicker } from '@core/engine';
import type { Ticker } from '@core/engine';
import {
  createAutosave,
  createLocalStorageAdapter,
  createPreferencesStore,
  createSaveManager,
} from '@core/persistence';
import type { StorageAdapter } from '@core/persistence';
import { createAudio } from '@audio/index';
import type { AudioSystem } from '@audio/index';
import type { AudioControl } from '@app/game/soundSettings';
import { areaAt } from '@features/world';
import { onAppHidden, onAppVisible } from '@platform/lifecycle';
import { CONTENT, SAVE_SCHEMA } from '@app/registry';
import type { AppEvent } from '@app/registry';
import { addChat } from '@app/game/chat';
import { fromSave, newGame } from '@app/game/newGame';
import { progressChanged } from '@app/game/saveTrigger';
import { step } from '@app/game/step';
import { AREA_BANNER_MS, createAppStore } from '@app/store';
import type { AppStore } from '@app/store';

export interface Runtime {
  store: AppStore;
  ticker: Ticker;
  audio: AudioSystem;
  /** Subscribe to the events every game tick produced (for sound, animation, vfx). */
  onEvents(cb: (events: AppEvent[]) => void): () => void;
  /** Give up on an unreadable save and let saving resume (banner button). */
  startFresh(): void;
  /** Begin ticking and autosaving. Returns a function that undoes everything. */
  start(): () => void;
}

/** Poll the ticker often so `ticker.alpha()` moves smoothly between ticks. */
const POLL_MS = 16;
const AUTOSAVE_MS = 30_000;

/** Wait this long after inventory/xp change before saving, so a burst becomes one write. */
const SAVE_DEBOUNCE_MS = 1000;
/** Storage key (inside the save adapter's namespace) naming the one runtime allowed to write saves. */
export const LEASE_KEY = 'session';
/** Browser hooks; tests pass fakes because the test environment has no document. */
export interface RuntimeEnv {
  onHidden(cb: () => void): () => void;
  onVisible(cb: () => void): () => void;
  /** Whether the device asks for reduced motion (the default for the visual preferences). */
  prefersReducedMotion?(): boolean;
}

const browserEnv: RuntimeEnv = {
  onHidden: onAppHidden,
  onVisible: onAppVisible,
  prefersReducedMotion: () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};

/** globalThis key holding the disposer of the page's live audio system. */
const AUDIO_SLOT = '__idleRpgAudioDispose';

export function createRuntime(
  storage: StorageAdapter = createLocalStorageAdapter(),
  env: RuntimeEnv = browserEnv,
): Runtime {
  const manager = createSaveManager({ schema: SAVE_SCHEMA, storage, now: () => Date.now() });
  const loaded = manager.load();

  let savingEnabled = loaded.ok;
  let game = newGame(CONTENT);
  if (loaded.ok && loaded.value) game = addChat(fromSave(loaded.value, CONTENT), 'Welcome back.');
  // Preferences load before the first render, from the same storage as the save.
  const prefs = createPreferencesStore({
    storage,
    prefersReducedMotion: env.prefersReducedMotion?.() ?? false,
  });
  const store = createAppStore(game, CONTENT, prefs);
  if (!loaded.ok) {
    store.getState().setBanner({
      text: `Your save could not be loaded: ${loaded.error}. You are playing a new game that will not be saved.`,
      canStartFresh: true,
    });
  }

  // Newest runtime wins: it claims the lease on boot, and an older runtime (another tab, a copy left
  // by a hot reload) that still holds a stale state sees the lease changed and stops writing.
  const leaseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  if (loaded.ok) storage.set(LEASE_KEY, leaseId);
  let superseded = false;

  const save = (): void => {
    if (!savingEnabled || superseded) return;
    const lease = storage.get(LEASE_KEY);
    if (lease.ok && lease.value !== null && lease.value !== leaseId) {
      superseded = true;
      store.getState().setBanner({
        text: 'The game was opened in another tab or window, so this one stopped saving. Reload to continue here.',
        canStartFresh: false,
      });
      return;
    }
    const r = manager.save(store.getState().game);
    const banner = store.getState().banner;
    if (!r.ok)
      store.getState().setBanner({ text: `Could not save: ${r.error}`, canStartFresh: false });
    else if (banner && !banner.canStartFresh) store.getState().setBanner(null);
  };

  const startFresh = (): void => {
    const r = manager.startFresh();
    if (r.ok) {
      savingEnabled = true;
      storage.set(LEASE_KEY, leaseId);
      store.getState().setBanner(null);
      save();
    } else {
      store
        .getState()
        .setBanner({ text: `Could not start fresh: ${r.error}`, canStartFresh: true });
    }
  };

  const sound = prefs.get().sound;
  // One live audio system per page: a previous runtime that was never torn down (HMR, a leaked
  // copy) is disposed first, so its AudioContext and scheduled scenes cannot keep playing.
  const slot = globalThis as unknown as Record<string, (() => void) | undefined>;
  slot[AUDIO_SLOT]?.();
  const audio = createAudio({ initialVolumes: sound.volumes, initialMuted: sound.muted });
  let audioDisposed = false;
  const disposeAudio = (): void => {
    if (audioDisposed) return;
    audioDisposed = true;
    audio.dispose();
    if (slot[AUDIO_SLOT] === disposeAudio) slot[AUDIO_SLOT] = undefined;
  };
  slot[AUDIO_SLOT] = disposeAudio;
  // Whether a user gesture has unlocked audio (any caller of `audio.unlock()` counts). Only then may
  // a page becoming visible resume the context; the first creation stays on a real gesture.
  let unlocked = false;
  const resumeAudio = audio.unlock.bind(audio);
  audio.unlock = () => {
    if (audioDisposed) return; // a stale listener must never create a second context
    unlocked = true;
    resumeAudio();
  };
  const control = audio as unknown as AudioControl;
  store.getState().attachAudio(control);
  // Audio is built with the loaded values; later changes reach it from the store's prefs subscription.

  // Area music/ambience follows the player's tile. `setArea` is a no-op for the same kind, but the
  // chat line must appear once per area change, so we track the area id here.
  let areaId: string | null = null;
  const followArea = (announce: boolean): void => {
    const p = store.getState().game.movement.position;
    const area = areaAt(p.x, p.y);
    if (area.id === areaId) return;
    areaId = area.id;
    audio.setArea(area.kind);
    if (!announce) return;
    store.getState().say(`You enter ${area.name}.`);
    const banner = store.getState().showAreaBanner(area.name);
    if (banner) setTimeout(() => store.getState().clearAreaBanner(banner.shownAt), AREA_BANNER_MS);
  };
  followArea(false);

  const listeners = new Set<(events: AppEvent[]) => void>();
  const rng = createRng(Date.now() >>> 0);
  const ticker = createTicker({
    onTick: (tick) => {
      const next = step(store.getState().game, { tick, rng });
      store.getState().setGame(next.state);
      followArea(true);
      for (const e of next.events) audio.handleEvent({ ...e });
      store.getState().noteEvents(next.events);
      listeners.forEach((l) => l(next.events));
    },
  });
  const autosave = createAutosave({ save, intervalMs: AUTOSAVE_MS });

  return {
    store,
    ticker,
    audio,
    onEvents(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    startFresh,
    start() {
      let stopTicker: (() => void) | null = startTicker(ticker, undefined, POLL_MS);
      autosave.start();
      // Save soon after progress changes (not only every 30 s), reading the store at save time.
      let timer: ReturnType<typeof setTimeout> | null = null;
      let last = store.getState().game;
      const unsubscribe = store.subscribe((s) => {
        const prev = last;
        last = s.game;
        if (!progressChanged(prev, s.game)) return;
        timer ??= setTimeout(() => {
          timer = null;
          save();
        }, SAVE_DEBOUNCE_MS);
      });
      const offHidden = env.onHidden(() => {
        // Audio is never muted for backgrounding: `muted` is only the user's choice. No ticks run
        // while hidden, so no game sounds are triggered anyway.
        audio.suspend(); // pauses the audio context only; never touches mute or prefs
        stopTicker?.(); // no ticks while hidden
        stopTicker = null;
        autosave.flush();
      });
      const offVisible = env.onVisible(() => {
        // Resume only a context a user gesture already created; never create one on pageshow.
        if (unlocked) resumeAudio();
        stopTicker ??= startTicker(ticker, undefined, POLL_MS); // resets the accumulated time
      });
      return () => {
        stopTicker?.();
        autosave.stop();
        unsubscribe();
        disposeAudio();
        if (timer !== null) clearTimeout(timer);
        offHidden();
        offVisible();
      };
    },
  };
}
