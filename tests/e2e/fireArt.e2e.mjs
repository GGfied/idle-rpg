// Fire art: spawn fire views (burning + dying) and an ash heap next to the player via the dev hook,
// check they exist / sort / hit-test, and screenshot desktop + phone at zoom 1 and 3.
// Fast base: runParallel desktop + phone x webgl + canvas (drawn art: both renderers), fast ticks, teleportSettled,
// screenshots via g.synth.frames (frozen loop, one stepped frame per zoom) instead of 500/400 ms sleeps, budget 60 s.
// Run: node tests/e2e/fireArt.e2e.mjs
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9467; // combos use 9467..9470
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

process.env.SHOTS_DIR ??= new URL('./.shots-fire/', import.meta.url).pathname;

const SPAWN = `(async () => {
  const m = await import('/src/render/fireViews.ts');
  const scene = window.__idleRpg.scene().camera.scene;
  const p = window.__e_pos;
  const fire = m.createFireView(scene, { x: p.x + 2, y: p.y });
  const dying = m.createFireView(scene, { x: p.x, y: p.y + 2 });
  dying.setDying(true);
  const ash = m.createAshesView(scene, { x: p.x + 2, y: p.y + 2 });
  const same = m.createFireView(scene, { x: p.x + 2, y: p.y + 2 });
  const sameDepth = same.container.depth;
  same.destroy();
  window.__fires = { fire, dying, ash, scene };
  return { depth: sameDepth, dyingDepth: dying.container.depth, ashDepth: ash.container.depth,
    hit: fire.hit, tex: scene.textures.exists('fire_flame_core'), intensity: [fire.intensity, dying.intensity],
    embers: [fire.flames.embers.visible, dying.flames.embers.visible] };
})()`;

// Decode a shot in-page, sample a 24x24 grid: share of green-dominant lit pixels (grass) and mean luminance.
const GROUND = (b64) => `(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,${b64}';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  let n = 0, green = 0, lum = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    const d = x.getImageData(Math.floor((i + 0.5) * c.width / 24), Math.floor((j + 0.5) * c.height / 24), 1, 1).data;
    const l = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    n++; lum += l; if (d[1] > d[0] && d[1] > d[2] && l > 50) green++;
  }
  return { green: +(green / n).toFixed(2), meanLum: Math.round(lum / n) };
})()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  const label = `${vp}-${renderer}`;
  await g.teleportSettled(48, 15);
  await check('f1', 'fire, dying fire and ashes spawn', async () => {
    const pos = await g.state('movement.position');
    await g.eval(`window.__e_pos = ${JSON.stringify(pos)}`);
    const r = await g.eval(SPAWN);
    g.expect(r.tex, 'flame textures uploaded');
    g.expect(r.intensity[0] === 1 && r.intensity[1] < 1, 'intensity ' + r.intensity);
    g.expect(!r.embers[0] && r.embers[1], 'embers only when dying');
    g.expect(r.ashDepth < r.depth, 'ashes sort under a fire on the same row');
    g.expect(r.hit.w >= 32 && r.hit.h > 40, 'hit box ' + JSON.stringify(r.hit));
    return `${label}: ${JSON.stringify(r.hit)}`;
  });
  await check('f2', 'screenshots at zoom 1 and 3', async () => {
    // frozen loop: each shot is one stepped frame (update + render) at the new zoom, no settle sleep
    await g.eval(`window.__fires.scene.cameras.main.setZoom(${vp === 'phone' ? 2.2 : 1.6}), 0`);
    const near = await g.synth.frames([17], { name: `fire-${label}-near`, keep: true });
    await g.eval(`window.__fires.scene.cameras.main.setZoom(4), 0`);
    const close = await g.synth.frames([34], { name: `fire-${label}-close`, keep: true });
    await g.synth.thaw();
    // ground sanity: grass is green-dominant and lit. Dark/black ground (C10 sighting, desktop canvas) fails here.
    const stats = [];
    for (const s of [near[0], close[0]]) {
      const st = await g.eval(GROUND(s.b64));
      stats.push(st);
      g.expect(st.green >= 0.25 && st.meanLum >= 50, `${label} ground dark: ${JSON.stringify(st)}`);
    }
    return `${label}: ${near[0].file} ${close[0].file} ground ${JSON.stringify(stats)}`;
  });
  await g.eval(`Object.values(window.__fires).forEach((v) => v.destroy && v.destroy()), 0`);
});
