// VISUAL SANITY smoke: visit key spots, screenshot (tests/e2e/.shots-visual/), and assert gross colour sanity of the
// WORLD canvas: water tiles blue + not dark, grass green, no big near-black area, no magenta, fire is warm.
// Thresholds are generous: this catches broken rendering (black water, missing textures), not art tweaks.
// Run: node tests/e2e/visualSmoke.e2e.mjs   (ports 9256-9259; LOOK at the shots after every run)
// Fast base: desktop/phone x webgl/canvas run as 4 parallel children (runParallel), ?tickMs=60, teleportSettled +
// frame waits instead of fixed sleeps, budget 60 s.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9256; // C6 block; 4 combos use 9256-9259
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

process.env.SHOTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '.shots-visual');

// In-page analyser: screenshot clip of the canvas -> per-tile samples + whole-canvas stats.
const INSTALL = `window.__vis = async (b64, rect, pts) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const d = x.getImageData(0, 0, bm.width, bm.height).data; const k = bm.width / rect.width;
  const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const dd = mx - mn; s = dd / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h = (h * 60 + 360) % 360; } return { h, s, l }; };
  let dark = 0, magenta = 0, n = bm.width * bm.height;
  for (let i = 0; i < d.length; i += 4) { const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum < 20) dark++; if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) magenta++; }
  const samples = pts.map((p) => { let r = 0, g = 0, b = 0, m = 0, warm = 0; const cx = Math.round((p.x - rect.left) * k), cy = Math.round((p.y - rect.top) * k), R = p.r ?? 2;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const j = ((cy + dy) * bm.width + cx + dx) * 4; if (j < 0 || j >= d.length) continue;
      r += d[j]; g += d[j + 1]; b += d[j + 2]; m++; const q = hsl(d[j], d[j + 1], d[j + 2]); if (q.s > 0.5 && q.h >= 5 && q.h <= 55 && q.l > 0.4) warm++; }
    r /= m; g /= m; b /= m; const q = hsl(r, g, b); return { kind: p.kind, h: q.h, s: q.s, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, warm, m }; });
  return { darkFrac: dark / n, magenta, samples };
};`;

// shot: file name for the canvas screenshot (the same clip the colour stats read; one capture per spot, not two).
const stats = async (g, shot, extra = []) => {
  const rect = await g.eval(
    `(() => { const r = document.querySelector('#game canvas, canvas:not(.minimap)').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
  );
  // tiles within +-11 of the player, classified by terrain, whose centre is visible on the canvas (not under HUD)
  const pts = await g.eval(`(async () => {
    const W = await import('/src/features/world/index.ts'); const p = window.__e.game().movement.position; const out = [];
    for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) { const tx = p.x + dx, ty = p.y + dy; const t = W.WORLD_DEF.terrainAt(tx, ty);
      const kind = t === 'water' ? 'water' : t === 'grass' || t === 'flowers' ? 'grass' : null; if (!kind) continue;
      const c = await window.__e.tileClient(tx, ty, 0);
      if (c.x < ${rect.left} + 6 || c.y < ${rect.top} + 6 || c.x > ${rect.left + rect.width} - 6 || c.y > ${rect.top + rect.height} - 6) continue;
      if (!window.__e.topIsCanvas(c.x, c.y)) continue; out.push({ kind, x: c.x, y: c.y, tx, ty }); }
    return out; })()`);
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height, scale: 1 },
  });
  mkdirSync(process.env.SHOTS_DIR, { recursive: true });
  writeFileSync(resolve(process.env.SHOTS_DIR, `${shot}.png`), Buffer.from(data, 'base64'));
  const res = await g.eval(
    `window.__vis(${JSON.stringify(data)}, ${JSON.stringify(rect)}, ${JSON.stringify([...pts, ...extra])})`,
  );
  const of = (k) => res.samples.filter((s) => s.kind === k);
  const okWater = (s) => s.h >= 170 && s.h <= 240 && s.lum > 50 && s.s > 0.15;
  const okGrass = (s) => s.h >= 65 && s.h <= 165 && s.lum > 40 && s.s > 0.12;
  const w = of('water'),
    gr = of('grass');
  const avg = (a, f) => (a.length ? Math.round(a.reduce((x, s) => x + s[f], 0) / a.length) : -1);
  return {
    ...res,
    nWater: w.length,
    nGrass: gr.length,
    waterOk: w.length ? w.filter(okWater).length / w.length : null,
    grassOk: gr.length ? gr.filter(okGrass).length / gr.length : null,
    waterHue: avg(w, 'h'),
    waterLum: avg(w, 'lum'),
    grassHue: avg(gr, 'h'),
    grassLum: avg(gr, 'lum'),
    fire: res.samples.filter((s) => s.kind === 'fire'),
    desc: `water ${w.length} tiles ok ${w.length ? Math.round((100 * w.filter(okWater).length) / w.length) : '-'}% (hue ${avg(w, 'h')} lum ${avg(w, 'lum')}), grass ${gr.length} ok ${gr.length ? Math.round((100 * gr.filter(okGrass).length) / gr.length) : '-'}% (hue ${avg(gr, 'h')} lum ${avg(gr, 'lum')}), dark ${(res.darkFrac * 100).toFixed(1)}%, magenta ${res.magenta}`,
  };
};

const SPOTS = [
  { id: 'spawn', at: [18, 15], grass: true },
  { id: 'bank', at: [13, 11], dark: 0.12 },
  { id: 'forest', at: [24, 21], grass: true },
  { id: 'mirror', water: true },
  { id: 'greatmere', at: [30, 52], water: true },
  { id: 'shore', at: [54, 52], water: true },
  { id: 'fire', at: [18, 15], grass: true, fire: true },
];

// Wait n rendered frames (replaces fixed sleeps after a store change that a view must draw).
const frames = (g, n) =>
  g.eval(
    `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
  );

// The 'canvas' renderer combo forces webgl contexts to null before boot (lib NOGL) -> Phaser falls back to the CANVAS
// renderer (the user's "WebGL off" case: black water, vanished fish). Both renderers get the same sanity checks.
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp0, mode) => {
  if (mode === 'canvas') {
    const t = await g.eval('window.__idleRpg.scene().camera.scene.game.renderer.type');
    await check('v-canvas-mode', 'CANVAS renderer active', async () => {
      expect(t === 1, `renderer.type ${t} (1 = CANVAS)`);
      return `renderer ${t}`;
    });
  }
  await runSpots(g, mode === 'canvas' ? `${vp0}-canvas` : vp0);
});

async function runSpots(g, vp) {
  await g.eval(INSTALL);
  await g.setInventory(['bronze_axe', 'tinderbox', { itemId: 'logs', quantity: 3 }]);
  for (const s of SPOTS) {
    await check(`v-${s.id}`, `visual sanity at ${s.id} (${vp})`, async () => {
      let at = s.at;
      if (s.id === 'mirror')
        at = await g.eval(`(async () => { const W = await import('/src/features/world/index.ts');
            for (let y = 8; y < 20; y++) for (let x = 34; x < 40; x++) if (W.WORLD_DEF.terrainAt(x, y) === 'water' && W.WORLD_DEF.terrainAt(x - 1, y) !== 'water') return [x - 1, y]; return [34, 15]; })()`);
      await g.setMovement('running: false');
      await g.teleportSettled(at[0], at[1]);
      const fx = at[0] + 2;
      if (s.fire) {
        await g.eval(`(() => { const st = window.__idleRpg.store; const gm = st.getState().game;
            const f = { id: 'fireV', tile: { x: ${fx}, y: ${at[1]} }, logsId: 'logs', expiresAtTick: gm.tick + 99999 };
            st.setState({ game: { ...gm, firemaking: { ...gm.firemaking, nextId: gm.firemaking.nextId + 1, fires: [f] } } }); })()`);
        await g.waitState('firemaking.fires', 'f => f.some((x) => x.id === "fireV")');
        await frames(g, 8);
      }
      await g.settle();
      const fp = s.fire ? await g.tileClient(fx, at[1], -10) : null;
      const st = await stats(
        g,
        `${vp}-${s.id}`,
        fp ? [{ kind: 'fire', x: fp.x, y: fp.y, r: 14 }] : [],
      );
      const problems = [];
      if (st.magenta > 20) problems.push(`magenta ${st.magenta}px`);
      if (st.darkFrac > (s.dark ?? 0.04))
        problems.push(`near-black ${(st.darkFrac * 100).toFixed(1)}% of canvas`);
      if (s.water) {
        if (st.nWater < 4) problems.push(`only ${st.nWater} water tiles in view`);
        else if (st.waterOk < 0.7)
          problems.push(`water not blue/bright: ${Math.round(st.waterOk * 100)}% ok`);
      }
      if (s.grass && st.nGrass >= 4 && st.grassOk < 0.7)
        problems.push(`grass not green: ${Math.round(st.grassOk * 100)}% ok`);
      if (s.fire && !(st.fire[0]?.warm > 8))
        problems.push(`no warm fire pixels (${st.fire[0]?.warm})`);
      expect(problems.length === 0, () => `${problems.join('; ')} | ${st.desc}`);
      return st.desc + (s.fire ? `, fire warm px ${st.fire[0]?.warm}` : '');
    });
  }
}
