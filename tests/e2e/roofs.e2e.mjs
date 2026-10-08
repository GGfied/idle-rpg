// Roof colours: every roofed building, desktop + phone, WebGL and CANVAS (lib renderer combos, one child each).
// Pixel oracle: no gold pixels on the roof, ridge/hip lines darker than the roof faces, faces have 2+ shades.
// Run: node tests/e2e/roofs.e2e.mjs   (SHOTS_DIR=... keeps screenshots; E2E_PORT overrides the base port)
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, waitStill, withGame } from './lib.mjs';

const PORT = 9251; // C6 block; 4 combos use 9251-9254
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

const ANALYSE = `window.__roof = async (id, b64) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const img = x.getImageData(0, 0, bm.width, bm.height), W = bm.width, H = bm.height;
  const M = await import('/src/render/buildingModel.ts'); const { isoProjection: P } = await import('/src/render/projection.ts');
  const WD = await import('/src/features/world/index.ts'); const b = WD.BUILDINGS.find((q) => q.id === id);
  const cv = window.__idleRpg.scene().camera.scene.game.canvas.getBoundingClientRect();
  const K = W / innerWidth; const cl = (p) => { const c = window.__e.toClient(p.x, p.y); return { x: c.x * K, y: c.y * K }; };
  const onCanvas = (px, py) => px >= 2 && py >= 2 && px < W - 2 && py < H - 2 && window.__e.topIsCanvas(px / K, py / K);
  const px = (i, j) => { const k = (j * W + i) * 4; return [img.data[k], img.data[k + 1], img.data[k + 2]]; };
  const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const inPoly = (pts, X, Y) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], q = pts[j];
    if ((a.y > Y) !== (q.y > Y) && X < ((q.x - a.x) * (Y - a.y)) / (q.y - a.y) + a.x) ins = !ins; } return ins; };
  const med = (a) => { const s = [...a].sort((m, n) => m - n); return s[s.length >> 1]; };
  const out = { cv: [cv.left, cv.top, cv.width, cv.height, W, H, window.devicePixelRatio], faces: [], gold: 0, total: 0, trim: [], base: M.roofStyleOf(b.roof).key };
  for (const f of M.roofFaces(b, P)) {
    const pts = f.points.map(cl); const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const shr = pts.map((p) => ({ x: cx + (p.x - cx) * 0.7, y: cy + (p.y - cy) * 0.7 }));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); const R = [], G = [], B = []; let n = 0;
    for (let j = Math.max(2, Math.floor(Math.min(...ys))); j < Math.min(H - 2, Math.ceil(Math.max(...ys))); j++)
      for (let i = Math.max(2, Math.floor(Math.min(...xs))); i < Math.min(W - 2, Math.ceil(Math.max(...xs))); i++) {
        if (!inPoly(shr, i + 0.5, j + 0.5) || !onCanvas(i, j)) continue;
        const [r, g, bl] = px(i, j); R.push(r); G.push(g); B.push(bl); n++;
        if (r > 200 && g > 160 && bl < 70 && r - bl > 140) out.gold++;
      }
    out.total += n;
    out.faces.push({ n, rgb: n ? [med(R), med(G), med(B)] : null, lum: n ? lum([med(R), med(G), med(B)]) : null });
  }
  const t = M.roofTrim(b, P); const tc = [(t.color >> 16) & 255, (t.color >> 8) & 255, t.color & 255]; out.trimRgb = tc;
  for (const [x0, y0, x1, y1] of t.lines)
    for (const u of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const m = cl({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u });
      const i = Math.round(m.x), j = Math.round(m.y);
      if (!onCanvas(i, j)) continue;
      let best = 1e9, bl = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const p = px(i + di, j + dj); bl = Math.min(bl, lum(p));
        best = Math.min(best, Math.hypot(p[0] - tc[0], p[1] - tc[1], p[2] - tc[2])); }
      out.trim.push({ lum: bl, dist: best, len: Math.hypot(x1 - x0, y1 - y0) });
    }
  return out;
};`;

const B = {
  willowbrook_bank: { door: [13, 14], in: [13, 11], rect: { x: 9, y: 7, w: 9, h: 8 } },
  old_hut: { door: [27, 8], in: [27, 6], rect: { x: 24, y: 4, w: 7, h: 5 } },
  fernhaven_bank: { door: [94, 67], in: [94, 64], rect: { x: 90, y: 60, w: 9, h: 8 } },
};
const SHOTS = process.env.SHOTS_DIR || '';

// Teleport, wait until the player VIEW stands on the tile, then until its screen point is still (camera done).
// g.settle() alone can return before a long teleport is picked up (CANVAS redraws chunks for a while).
const PLAYER_CLIENT = `(() => { const c = window.__idleRpg.scene().playerView.container; return { wx: c.x, wy: c.y, ...window.__e.toClient(c.x, c.y) }; })()`;
async function arrive(g, tx, ty) {
  await g.teleport(tx, ty, { settleMs: 0 });
  const w = await g.eval(
    `import('/src/render/projection.ts').then((m) => m.isoProjection.tileToWorld(${tx}, ${ty}))`,
  );
  await g.waitFor(
    async () => {
      const p = await g.eval(PLAYER_CLIENT);
      return Math.abs(p.wx - w.x) < 1 && Math.abs(p.wy - w.y) < 1;
    },
    { timeoutMs: 8000, label: `player view at ${tx},${ty}` },
  );
  await g.settle();
  await waitStill(() => g.eval(PLAYER_CLIENT), { intervalMs: 100, stable: 3 });
}

const bState = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.buildings.state(${JSON.stringify(id)})`);

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, mode) => {
    {
      await g.eval(ANALYSE);
      const rt = await g.eval('window.__idleRpg.scene().camera.scene.game.renderer.type');
      await check(`r-${mode}`, `renderer is ${mode}`, async () => {
        expect(rt === (mode === 'canvas' ? 1 : 2), `renderer.type ${rt}`);
        return `${vp}: renderer.type ${rt}`;
      });
      const count = await g.eval('window.__idleRpg.scene().camera.scene.buildings.count()');
      await check(`n-${mode}`, 'all 3 world buildings are drawn', async () => {
        expect(count === 3, `buildings.count ${count}`);
        return `${vp}: ${count}`;
      });
      for (const [id, b] of Object.entries(B)) {
        const tag = `${vp}-${mode}-${id}`;
        // stand just north of the building: its roof sits on screen below the player, fully faded in
        await arrive(g, b.door[0], b.rect.y - 2);
        await g.update('({ ...g, bankOpen: false })');
        // wait on the renderer's own fade state instead of a fixed 1.5 s + 0.5 s sleep
        await g
          .waitFor(
            async () => {
              const st = await bState(g, id);
              return st && !st.inside && st.roofAlpha > 0.999 && st.frontWallAlpha > 0.999;
            },
            { timeoutMs: 5000, label: `${id} roof faded in` },
          )
          .catch(() => {}); // the pixel check below reports a roof that never faded in
        await check(
          `px-${tag}`,
          `${id} ${mode}: roof pixels (no gold, dark ridges, 2+ shades)`,
          async () => {
            const shot = (
              await g.cdp.send('Page.captureScreenshot', {
                format: 'png',
                clip: {
                  x: 0,
                  y: 0,
                  width: await g.eval('innerWidth'),
                  height: await g.eval('innerHeight'),
                  scale: 1,
                },
              })
            ).data;
            if (SHOTS) {
              const { mkdirSync, writeFileSync } = await import('node:fs');
              const { Buffer } = await import('node:buffer');
              mkdirSync(SHOTS, { recursive: true });
              writeFileSync(`${SHOTS}/roof-${tag}.png`, Buffer.from(shot, 'base64'));
            }
            const r = await g.eval(`window.__roof(${JSON.stringify(id)}, ${JSON.stringify(shot)})`);
            const seen = r.faces.filter((f) => f.n >= 80);
            expect(
              seen.length >= 2,
              `only ${seen.length} faces visible: ${JSON.stringify(r.faces)}`,
            );
            expect(r.gold === 0, `${r.gold} gold-ish px on roof (trim rgb ${r.trimRgb})`);
            const lums = seen.map((f) => f.lum);
            const lo = Math.min(...lums);
            const hi = Math.max(...lums);
            expect(
              hi > lo * 1.12,
              `faces not 2 distinct shades: ${JSON.stringify(r.faces)} cv ${JSON.stringify(r.cv)}`,
            );
            expect(r.trim.length >= 2, `only ${r.trim.length} ridge points visible`);
            const darker = r.trim.filter((t) => t.lum < lo * 0.92);
            expect(
              darker.length === r.trim.length,
              `ridge not darker than darkest face ${lo | 0}: ${JSON.stringify(r.trim.map((t) => t.lum | 0))}`,
            );
            const nearTrim = r.trim.filter((t) => t.dist < 45).length;
            expect(nearTrim >= 1, `no pixel near trim colour ${r.trimRgb}`);
            if (id.endsWith('bank'))
              expect(r.faces[0].rgb && r.faces[0].rgb[2] >= 90, 'bank roof not slate-blue');
            return `${vp}/${mode}: faces ${seen.map((f) => f.lum | 0)} ridge ${r.trim.map((t) => t.lum | 0)} gold ${r.gold}`;
          },
        );
        await check(
          `in-${tag}`,
          `${id} ${mode}: walking inside still fades roof (0) and walls to 0.2`,
          async () => {
            await g.teleport(...b.in, { settleMs: 0 });
            // fade is FADE_MS 200 ms; wait on the state (old test slept 900 ms), then assert the exact values
            let s = null;
            await g
              .waitFor(
                async () => {
                  s = await bState(g, id);
                  return s.inside && s.roofAlpha < 0.01 && Math.abs(s.frontWallAlpha - 0.2) < 0.02;
                },
                { timeoutMs: 2000, label: `${id} inside fade` },
              )
              .catch(() => {});
            expect(
              s.inside && s.roofAlpha < 0.01 && Math.abs(s.frontWallAlpha - 0.2) < 0.02,
              JSON.stringify(s),
            );
            await g.screenshot(`roof-${tag}-inside`);
            return JSON.stringify(s);
          },
        );
      }
    }
  }),
);
