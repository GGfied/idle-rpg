import { applySafeAreaVars } from '@platform/viewport';
import { clampTickMs } from '@app/game/retimeTicker';
import { createRuntime } from '@app/runtime';
import { frameAlpha } from '@app/scenes/renderTrail';
import { createGame } from '@app/scenes/createGame';
import { mountHud } from '@app/ui/mount';

const game = document.getElementById('game');
const hud = document.getElementById('hud');
if (!game || !hud) throw new Error('index.html is missing #game / #hud');

applySafeAreaVars();
const runtime = createRuntime();
const unmountHud = mountHud(hud, runtime);
const game$ = createGame(game, {
  store: runtime.store,
  alpha: () => frameAlpha(runtime.ticker, performance.now()),
  tick: () => runtime.ticker.tick,
  audio: runtime.audio,
  onEvents: runtime.onEvents,
});
const destroyGame = game$.destroy;
// Browsers only allow sound after a user gesture.
const unlockAudio = (): void => runtime.audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
const onEscape = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') runtime.store.getState().escape();
};
window.addEventListener('keydown', onEscape);
const stop = runtime.start();

// QA hook, DEV only: Vite replaces `import.meta.env.DEV` with false in production, so this is removed.
if (import.meta.env.DEV) {
  const setTickMs = (ms: number): void => runtime.ticker.retime(clampTickMs(ms), performance.now());
  const fromUrl = new URLSearchParams(location.search).get('tickMs');
  if (fromUrl !== null) setTickMs(Number(fromUrl));
  window.__idleRpg = {
    store: runtime.store,
    scene: () => game$.world.debugHandles(),
    setTickMs,
    tickMs: () => runtime.ticker.intervalMs,
  };
}

// Hot reload: tear the old runtime down (ticker, autosave, listeners, Phaser) so a stale copy can
// never keep running and writing its state over the new one.
import.meta.hot?.dispose(() => {
  stop();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('keydown', onEscape);
  destroyGame();
  unmountHud();
});
