import type { AppStore } from '@app/store';
import type { WorldScene } from '@app/scenes/WorldScene';

declare global {
  interface Window {
    /** DEV builds only: read-only handles for QA scripts. Absent in production. */
    __idleRpg?: {
      store: AppStore;
      scene: () => ReturnType<WorldScene['debugHandles']>;
      /** Set the game tick interval (clamped 30-600 ms); `?tickMs=60` does it at boot. */
      setTickMs: (ms: number) => void;
      tickMs: () => number;
    };
  }
}
