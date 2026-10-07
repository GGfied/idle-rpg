import { registerEffect } from '@render/effects';
import { createTreeSway } from '@render/animation';
import type { TreeSway } from '@render/animation';

/** Effects that ship with the world scene. New render effects register here (or self-register at import). */
let sway: TreeSway | undefined;
registerEffect({
  id: 'treeSway',
  onSceneStart: (ctx) => {
    sway = createTreeSway(() => ctx.motion());
  },
  onChunksChanged: (loaded, ctx) => {
    for (const t of loaded.trees) {
      const v = ctx.tree(t.nodeId);
      if (v) sway?.add(t.nodeId, v);
    }
  },
  onFrame: (time) => sway?.update(time),
  onDestroy: () => {
    sway = undefined;
  },
});
