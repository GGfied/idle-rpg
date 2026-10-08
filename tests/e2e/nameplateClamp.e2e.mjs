// Nameplates stay fully inside the visible camera view (clamped at the edges). Phone + desktop, WebGL + CANVAS.
// Fast base: 4 parallel combos (desktop/phone x webgl/canvas), ?tickMs=60, camera settle instead of fixed sleeps.
// Run: node tests/e2e/nameplateClamp.e2e.mjs   (SHOTS_DIR=... keeps screenshots)
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9215; // C5 port block 9201-9250; 4 combos use 9215-9218
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['phone', 'desktop'],
  renderers: ['webgl', 'canvas'], // label drawing is the subject: both renderers
  budgetMs: BUDGET_MS,
});
// visible nameplate texts: bounds in world px vs the camera view
const LABELS = `(() => { const sc = window.__idleRpg.scene().camera.scene; const cam = sc.cameras.main; const v = cam.worldView;
  const out = [];
  sc.children.list.forEach((c) => { (c.list || []).forEach((t) => { if (t.type === 'Text' && t.visible && t.text) {
    const m = t.getWorldTransformMatrix(); const hw = t.width / 2;
    out.push({ text: t.text, left: m.tx - hw - v.left, right: v.right - (m.tx + hw) }); } }); });
  return out; })()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp0, mode) => {
  const vp = `${vp0}-${mode}`;
  await check('n0', `${vp}: game runs on the ${mode} renderer`, async () => {
    const r = await g.rendererName();
    expect(r === mode, `renderer ${r}`);
    return `renderer ${r}`;
  });
  await check('n1', `${vp}: nameplates fully inside the view at the bank`, async () => {
    await g.teleportSettled(13, 11); // waits for the follow camera to stop (was a 1500 ms + 600 ms sleep)
    await g.screenshot(`${vp}-bank`); // only when SHOTS_DIR is set
    const ls = await g.eval(LABELS);
    expect(ls.length > 0, 'no nameplates found');
    const bad = ls.filter((l) => l.left < -0.5 || l.right < -0.5);
    expect(!bad.length, `clipped: ${JSON.stringify(bad)}`);
    return ls.map((l) => `${l.text} L${l.left | 0} R${l.right | 0}`).join(', ');
  });
});
