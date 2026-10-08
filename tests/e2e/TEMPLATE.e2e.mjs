// Template: copy to tests/e2e/<feature>.e2e.mjs, pick an unused port BASE (combos use BASE, BASE+1, ...), run
//   node tests/e2e/<feature>.e2e.mjs        (foreground; exits by itself; prints a [timing] line + a budget check)
// Fast base defaults (see the header of lib.mjs): parallel viewport x renderer children, ?tickMs=60, wait-on-state
// helpers, synthetic time via g.synth, and a < 60 s budget that FAILS the run. Write checks, not plumbing.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 7599; // unique base port; lsof -nP -iTCP:<port> must print nothing
const BUDGET_MS = 60e3; // user rule: every e2e file < 60 s, measured
// Add 'canvas' to renderers when the feature draws (it then runs as extra parallel children: no extra wall time).
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

await withGame(
  // tickMs defaults to 60. realTime: true (600 ms) only when real timing is what's tested.
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, renderer) => {
    await check('t1', 'tap a tree, walk there and chop a log', async () => {
      await g.setInventory(['bronze_axe']);
      await g.setLevels({ woodcutting: 1 }); // preconditions via the store, never grinding
      const tree = await g.targetOfKind('tree');
      await g.teleportSettled(tree.x, tree.y + 4); // waits on the camera, not a fixed 700 ms sleep
      await g.tapObject(tree.id); // real input
      const line = await g.waitChat(/log/i); // wait on state, not sleep()
      expect(line, 'no log chat line');
      return `${vp}/${renderer}: ${JSON.stringify(await g.state('movement.position'))} "${line}"`;
    });

    // Gather sessions end in ~1 s at 60 ms ticks: slow the tick for the phase, or re-tap as a keep-alive.
    //   await g.setTickMs(150);  /  const stop = g.every(300, () => g.tapObject(tree.id)); ... stop();

    // Anything that changes over time: freeze the loop, step chosen frames, ONE screenshot per frame.
    //   const frames = await g.synth.frames([0, 120, 240], { name: `chop-${vp}` });
    //   expect(frames[0].bytes !== frames[2].bytes, 'frames differ');
    //   await g.synth.thaw();
  }),
);
