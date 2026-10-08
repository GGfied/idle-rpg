// Oak tuning e2e: oak xp 45, normal tree xp 25, oak success band for successLow/High 48/150.
// Run: node tests/e2e/oakTuning.e2e.mjs   (3 parallel children on 9101-9103; E2E_PORT overrides the base)
// Fast base: runParallel children, ?tickMs=60 (rules unchanged, ticks 10x), wait-on-state, teleportSettled, budget.
import { check, forEachCombo, runParallel, withGame } from './lib.mjs';
import process from 'node:process';

process.env.SHOTS_DIR ??= new URL('./.shots-oak', import.meta.url).pathname;

const PORT = 9101;
const BUDGET_MS = 60e3;
const LEVEL = 40; // p = (1 + floor(48*59/98 + 150*39/98 + .5)) / 256 = 90/256 = 0.352
const P = 90 / 256;
const N_ATTEMPTS = 150;

const hook = `(() => {
  const s = window.__idleRpg.store;
  window.__ounsub?.();
  window.__o = { deltas: [], attempts: 0, lastTick: -1, last: s.getState().game.progression.xp.woodcutting };
  window.__ounsub = s.subscribe((n) => {
    const g = n.game, o = window.__o;
    const xp = g.progression.xp.woodcutting;
    if (xp !== o.last) { o.deltas.push(xp - o.last); o.last = xp; }
    if (g.tick !== o.lastTick) {
      o.lastTick = g.tick;
      if (g.gathering.session && g.gathering.session.cooldown === 1) o.attempts++;
    }
  });
})()`;
const stats = (g) => g.eval('({ ...window.__o })');

// Three parallel children: desktop (t1-t3), phone (t1-t3), and the viewport-independent statistical check t4.
// runParallel only knows viewports, so t4 rides the 'landscape' slot but runs at the desktop viewport (tap targets
// are reliable there); the slot name is only the child's label.
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const PLAN = COMBOS.map((c) => (c.startsWith('landscape') ? 'desktop:webgl' : c));
const RATE = new Set(COMBOS.map((c, i) => (c.startsWith('landscape') ? i : -1)));
let idx = -1;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(PLAN, async (g, vp) => {
    idx++;
    const doRate = RATE.has(idx);
    const chopOnce = async (kind) => {
      await g.setInventory(['bronze_axe']);
      const t = await g.targetOfKind(kind);
      await g.setLevel('woodcutting', LEVEL);
      await g.teleportSettled(t.x, t.y + 3);
      await g.eval(hook);
      const start = await g.state('movement.position');
      await g.tapObject(t.id);
      await g.waitFor(async () => (await stats(g)).deltas.length > 0, {
        timeoutMs: 30000,
        label: `${kind} xp`,
      });
      const end = await g.state('movement.position');
      const o = await stats(g);
      await g.screenshot(`oak-${vp}-${kind}`);
      await g.eval('window.__ounsub()');
      return { t, start, end, o };
    };

    if (!doRate) {
      await check('t1', 'tap an oak: player walks there and chops', async () => {
        const { t, start, end } = await chopOnce('oak_tree');
        g.expect(start.x !== end.x || start.y !== end.y, 'player did not move');
        return `${vp}: ${JSON.stringify(start)} -> ${JSON.stringify(end)} (oak ${t.x},${t.y})`;
      });
      await check('t2', 'each oak log grants exactly 45 Woodcutting XP', async () => {
        const { o } = await chopOnce('oak_tree');
        g.expect(
          o.deltas.every((d) => d === 45),
          `deltas ${JSON.stringify(o.deltas)}`,
        );
        return `${vp}: deltas ${JSON.stringify(o.deltas)}`;
      });
      await check('t3', 'normal tree still grants 25 XP', async () => {
        const { o } = await chopOnce('tree');
        g.expect(
          o.deltas.every((d) => d === 25),
          `deltas ${JSON.stringify(o.deltas)}`,
        );
        return `${vp}: deltas ${JSON.stringify(o.deltas)}`;
      });
    } else {
      await check('t4', `oak logs per attempt in band over ${N_ATTEMPTS} attempts`, async () => {
        const oaks = (await g.targets()).filter((x) => x.kind === 'oak_tree');
        await g.setLevel('woodcutting', LEVEL);
        await g.eval(hook);
        await g.setTickMs(30); // fastest the hook allows; attempts are tick-counted, so the rate is unchanged
        let i = 0;
        const t0 = Date.now();
        while ((await stats(g)).attempts < N_ATTEMPTS) {
          g.expect(Date.now() - t0 < 45000, 'timeout collecting attempts');
          await g.setInventory(['bronze_axe']);
          const t = oaks[i++ % oaks.length];
          // Re-sessions go through the store action the tap dispatches (the tap path itself is t1-t3's job): no camera
          // settle per re-session. The session starts after the walk, then ends when the oak depletes: wait on state.
          await g.teleport(t.x, t.y + 3, { settleMs: 0 });
          await g.store(`s.interactTree(${JSON.stringify(t.id)})`);
          await g.waitState('gathering', 'x => !!x.session', { timeoutMs: 8000 }).catch(() => {});
          await g.waitFor(
            async () =>
              !(await g.state('gathering.session')) || (await stats(g)).attempts >= N_ATTEMPTS,
            { timeoutMs: 30000, label: 'oak session over' },
          );
        }
        const o = await stats(g);
        await g.eval('window.__ounsub()');
        const logs = o.deltas.length;
        const rate = logs / o.attempts;
        const sd = Math.sqrt((P * (1 - P)) / o.attempts);
        g.expect(
          o.deltas.every((d) => d === 45),
          'non-45 delta',
        );
        g.expect(
          Math.abs(rate - P) < 4 * sd,
          `rate ${rate.toFixed(3)} vs ${P.toFixed(3)} +-${(4 * sd).toFixed(3)}`,
        );
        return `rate child: ${logs} logs / ${o.attempts} attempts = ${rate.toFixed(3)} (expected ${P.toFixed(3)}, 4sd ${(4 * sd).toFixed(3)}; unseeded run, 4-sigma band)`;
      });
    }
    // t5 (console errors) is covered by withGame's built-in 'console' check.
  }),
);
