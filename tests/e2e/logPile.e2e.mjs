// Fire art: spawn fire views (burning + dying) and an ash heap next to the player via the dev hook,
// check they exist / sort / hit-test, and screenshot desktop + phone at zoom 1 and 3.
// Fast base: runParallel desktop + phone x webgl + canvas (drawn art: both renderers), fast ticks, teleportSettled,
// screenshots via g.synth.frames (frozen loop, one stepped frame per zoom) instead of 500/400 ms sleeps, budget 60 s.
// Run: node tests/e2e/logPile.e2e.mjs
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9471; // combos use 9471..9474
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

process.env.SHOTS_DIR ??= new URL('./.shots-logpile/', import.meta.url).pathname;

const SPAWN = `(async () => {
  const m = await import('/src/render/fireViews.ts');
  const scene = window.__idleRpg.scene().camera.scene;
  const p = window.__e_pos;
  const pile = m.createLogPileView(scene, { x: p.x + 1, y: p.y }, 'logs');
  const oak = m.createLogPileView(scene, { x: p.x + 3, y: p.y }, 'oak_logs');
  const fire = m.createFireView(scene, { x: p.x + 5, y: p.y });
  window.__fires = { pile, oak, fire, scene };
  return { tex: scene.textures.exists('logpile_logs') && scene.textures.exists('logpile_oak_logs'),
    hit: pile.hit ?? null, depth: pile.container.depth };
})()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  const label = `${vp}-${renderer}`;
  await g.teleportSettled(48, 15);
  await check('lp1', 'log piles (logs, oak) and a fire spawn', async () => {
    const pos = await g.state('movement.position');
    await g.eval(`window.__e_pos = ${JSON.stringify(pos)}`);
    const r = await g.eval(SPAWN);
    g.expect(r.tex, 'flame textures uploaded');
    g.expect(r.tex, 'log pile textures uploaded');
    g.expect(r.hit === null, 'no hit area');
    return `${label}: depth ${r.depth}`;
  });
  await check('lp2', 'screenshots at zoom 1 and 3', async () => {
    // frozen loop: each shot is one stepped frame (update + render) at the new zoom, no settle sleep
    await g.eval(`window.__fires.scene.cameras.main.setZoom(${vp === 'phone' ? 2.2 : 1.6}), 0`);
    const near = await g.synth.frames([17], { name: `logpile-${label}-near` });
    await g.eval(`window.__fires.scene.cameras.main.setZoom(4), 0`);
    const close = await g.synth.frames([34], { name: `logpile-${label}-close` });
    await g.synth.thaw();
    return `${label}: ${near[0].file} ${close[0].file}`;
  });
  await g.eval(`Object.values(window.__fires).forEach((v) => v.destroy && v.destroy()), 0`);
});
