import { createRoot } from 'react-dom/client';
import type { Runtime } from '@app/runtime';
import { Hud } from '@app/ui/Hud';
import { RuntimeContext } from '@app/ui/context';
import '@app/ui/styles.css';

/** Render the HUD into `el`. Returns an unmount function. */
export function mountHud(el: HTMLElement, runtime: Runtime): () => void {
  const root = createRoot(el);
  root.render(
    <RuntimeContext.Provider value={runtime}>
      <Hud />
    </RuntimeContext.Provider>,
  );
  return () => root.unmount();
}
