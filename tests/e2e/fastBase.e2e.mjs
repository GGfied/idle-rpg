// Self-test of the fast base (lib.mjs): renderer option, synthetic time, wait-on-state, parallel combos.
// Run: node tests/e2e/fastBase.e2e.mjs   (4 parallel children on 7511-7514)
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT ?? 7511);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
const SAMPLE = `(t) => { const pv = window.__idleRpg.scene().playerView; return { t, y: pv.container.y, a: pv.container.list.length }; }`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, renderer) => {
    await check('renderer', `Phaser booted with ${renderer}`, async () => {
      const got = await g.rendererName();
      expect(got === renderer, `asked ${renderer}, got ${got}`);
      return got;
    });
    await check('waits', 'teleportSettled + waitState + waitChat replace sleeps', async () => {
      const t0 = Date.now();
      await g.teleportSettled(20, 15);
      await g.waitState('movement.position', 'p => p.x === 20 && p.y === 15');
      await g.update(`({ ...g, chat: [...g.chat, { id: 987654, text: 'fastbase-ping' }] })`);
      const line = await g.waitChat('fastbase-ping');
      const ms = Date.now() - t0;
      expect(line === 'fastbase-ping' && ms < 1500, `line ${line} in ${ms} ms`);
      await g.setLevels({ woodcutting: 30 });
      await g.waitState('progression.xp.woodcutting', 'x => x > 1000');
      return `${ms} ms`;
    });
    await check(
      'synth',
      'frozen loop: stepping advances frames deterministically, one shot per frame',
      async () => {
        const tick0 = await g.eval('window.__idleRpg.tickMs()');
        await g.synth.freeze();
        expect((await g.eval('window.__idleRpg.tickMs()')) === 600, 'tick not slowed to 600');
        const NOW = 'window.__idleRpg.scene().camera.scene.time.now';
        const f0 = await g.eval(NOW);
        await g.synth.step(16.7, 5);
        const f1 = await g.eval(NOW);
        expect(
          Math.abs(f1 - f0 - 83.5) < 0.01,
          `5 steps moved scene clock ${f1 - f0} ms, want 83.5`,
        );
        const t0 = Date.now();
        const shots = await g.synth.frames([0, 100, 200], {
          name: `fb-${vp}-${renderer}`,
          keep: true,
        });
        const rows = await g.synth.animSeries(
          'chop',
          { facing: 'e', toolItemId: 'bronze_axe' },
          [0, 100, 200, 300],
          SAMPLE,
        );
        expect(
          shots.length === 3 && shots.every((s) => s.bytes > 2000),
          `shots ${JSON.stringify(shots.map((s) => s.bytes))}`,
        );
        expect(rows.length === 4, 'animSeries rows');
        await g.synth.thaw();
        const tick1 = await g.eval('window.__idleRpg.tickMs()');
        expect(tick1 === tick0, `tick ${tick0} -> ${tick1}`);
        return `5 frames stepped, 3 shots in ${Date.now() - t0} ms, tick restored ${tick1}`;
      },
    );
    await check('live', 'after thaw the game runs again (loop awake, tick back)', async () => {
      const f0 = await g.eval('window.__idleRpg.scene().camera.scene.game.loop.frame');
      await g.sleep(300);
      const f1 = await g.eval('window.__idleRpg.scene().camera.scene.game.loop.frame');
      expect(f1 - f0 >= 5, `only ${f1 - f0} frames in 300 ms`);
      return `${f1 - f0} frames/300 ms`;
    });
  }),
);
