// Phaser CANVAS renderer (WebGL unavailable: GPU blocklisted/crashed). The page's webgl contexts are forced to
// null before boot, exactly the user's black-water case, so Phaser.AUTO falls back to CANVAS.
// Run: node tests/e2e/canvasRender.e2e.mjs   (SHOTS_DIR=... to keep screenshots)
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9203; // C5 port block 9201-9250
const BUDGET_MS = 60e3;
// CANVAS is the subject: lib's renderer 'canvas' injects the same pre-boot webgl-null as the old local NOGL script.
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['canvas'],
  budgetMs: BUDGET_MS,
});
const SHOTS = process.env.SHOTS_DIR || '';
const MEAN = `window.__mean = async (b64) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const d = x.getImageData(0, 0, bm.width, bm.height).data; let r = 0, g = 0, b = 0, light = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; if (d[i] + d[i + 1] + d[i + 2] > 420) light++; }
  return { r: r / n, g: g / n, b: b / n, light: light / n };
};`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS, renderer: 'canvas' },
  forEachCombo(COMBOS, async (g, vp) => {
    await g.eval(MEAN);
    const mean = async (tx, ty, half = 24) => {
      const p = await g.tileClient(tx, ty);
      const clip = {
        x: Math.max(0, p.x - half),
        y: Math.max(0, p.y - half / 2),
        width: half * 2,
        height: half,
        scale: 1,
      };
      const b64 = (await g.cdp.send('Page.captureScreenshot', { format: 'png', clip })).data;
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        writeFileSync(`${SHOTS}/canvas-${vp}-${tx}-${ty}.png`, Buffer.from(b64, 'base64'));
      }
      return g.eval(`window.__mean(${JSON.stringify(b64)})`);
    };
    await check('c1', 'game runs on the CANVAS renderer', async () => {
      const t = await g.eval('window.__idleRpg.scene().camera.scene.game.renderer.type');
      expect(t === 1, `renderer.type ${t} (1 = CANVAS); the WebGL block did not apply`);
      return `${vp}: renderer ${t}`;
    });
    await check('c2', 'open water is blue (not the black CANVAS gradient fallback)', async () => {
      await g.teleportSettled(48, 52); // south shore: lake tiles at y 49..50
      const m = await mean(48, 49);
      expect(m.b > 90 && m.b > m.r + 40 && m.b > m.g, `water mean rgb ${JSON.stringify(m)}`);
      return `${vp}: water mean rgb(${m.r | 0},${m.g | 0},${m.b | 0})`;
    });
    await check('c3', 'fishing spot is lighter than the water around it', async () => {
      await g.teleportSettled(56, 52);
      const spot = await mean(56, 51, 20);
      const water = await mean(56, 48, 20);
      // the water around the spot must itself be blue: a black (gradient-fallback) lake makes any spot "lighter"
      expect(
        water.b > 90 && water.b > water.r + 40 && water.b > water.g,
        `water around spot not blue: ${JSON.stringify(water)}`,
      );
      expect(
        spot.light > water.light + 0.03,
        `spot ${JSON.stringify(spot)} water ${JSON.stringify(water)}`,
      );
      return `${vp}: light px spot ${spot.light.toFixed(2)} vs water ${water.light.toFixed(2)}`;
    });
    await check('c4', 'grass keeps its tint (green, not black or washed out)', async () => {
      const m = await mean(56, 54, 30);
      expect(m.g > m.r + 20 && m.g > m.b + 20 && m.g < 190, `grass mean rgb ${JSON.stringify(m)}`);
      return `${vp}: grass mean rgb(${m.r | 0},${m.g | 0},${m.b | 0})`;
    });
  }),
);
