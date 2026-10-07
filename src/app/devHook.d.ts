import type { AppStore } from '@app/store';
import type { WorldScene } from '@app/scenes/WorldScene';

declare global {
  interface Window {
    /** DEV builds only: read-only handles for QA scripts. Absent in production. */
    __idleRpg?: {
      store: AppStore;
      scene: () => ReturnType<WorldScene['debugHandles']>;
    };
  }
}
