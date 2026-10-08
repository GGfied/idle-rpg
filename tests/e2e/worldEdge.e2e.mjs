// WORLD EDGE: the diamond map must fade out into the backdrop, not end in a hard near-black diagonal.
// For 4 edge spots + the first river crossing, samples pixels along the outward normal of the map edge
// and asserts (a) no hard seam between the last tiles inside and the first tile outside, (b) nothing within the
// fade is near-black, (c) the fade is monotone (each ring is not brighter than the previous one, +tolerance).
// Runs on WebGL and on the CANVAS renderer (webgl forced null), desktop + phone. Shots: SHOTS_DIR.
// Run: node tests/e2e/worldEdge.e2e.mjs   (E2E_PORT, default 6600)
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 7801; // children use PORT+0..3
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
const SHOTS =
  process.env.SHOTS_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '.shots-edge');
const TAG = process.env.TAG || 'after';
const SEAM_MEAN_MAX = 30;
const SEAM_SD_MIN = 0.6;
const COLS = 128;
const ROWS = 96;
const SAMPLE = `window.__px = async (b64, pts) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  return pts.map((p) => { const R = 3; let r = 0, g = 0, b = 0, m = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = x.getImageData(Math.round(p.x * p.k) + dx, Math.round(p.y * p.k) + dy, 1, 1).data; r += d[0]; g += d[1]; b += d[2]; m++; }
    return { r: r / m, g: g / m, b: b / m }; }); };`;
// Window stats: mean rgb + luminance stddev (texture grain) of a w x h px box centred on each point.
const WIN = `window.__win = async (b64, pts) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  return pts.map((p) => { const w = Math.round(p.w * p.k), h = Math.round(p.h * p.k);
    const d = x.getImageData(Math.round(p.x * p.k - w / 2), Math.round(p.y * p.k - h / 2), w, h).data;
    let r = 0, g = 0, b = 0, l = 0, l2 = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; l += v; l2 += v * v; }
    const m = l / n; return { r: r / n, g: g / n, b: b / n, sd: Math.sqrt(Math.max(0, l2 / n - m * m)) }; }); };`;
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

// [name, standing tile, edge tile, outward normal in tile space]
const SPOTS = [
  ['west', [3, 48], [0, 48], [-1, 0]],
  ['north', [64, 3], [64, 0], [0, -1]],
  ['east', [124, 48], [127, 48], [1, 0]],
  ['south', [64, 92], [64, 95], [0, 1]],
];

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, rend) => {
    {
      await g.eval(SAMPLE);
      await g.eval(WIN);
      const type = await g.eval('window.__idleRpg.scene().camera.scene.game.renderer.type');
      expect(type === (rend === 'canvas' ? 1 : 2), `${vp}/${rend}: renderer.type ${type}`);
      // river crossings on the border: first water tile of each side (the edge must continue them outward)
      const water =
        await g.eval(`(async () => { const W = await import('/src/features/world/index.ts'); const o = [];
        let x0 = -1, x1 = -1; for (let x = 0; x < ${COLS}; x++) { if (W.WORLD_DEF.terrainAt(x, 0) === 'water') { if (x0 < 0) x0 = x; x1 = x; } else if (x0 >= 0) break; }
        if (x0 >= 0) { const m = Math.round((x0 + x1) / 2); o.push(['water-n', [m, 3], [m, 0], [0, -1], 3]); }
        for (let y = 0; y < ${ROWS}; y++) { if (W.WORLD_DEF.terrainAt(${COLS - 1}, y) === 'water') { o.push(['water-e', [${COLS - 4}, y], [${COLS - 1}, y], [1, 0]]); break; } }
        return o; })()`);
      const rect = await g.eval(
        `(() => { const r = document.querySelector('canvas:not(.minimap)').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`,
      );
      for (const [name, stand, edge, n, maxD = 16] of [...SPOTS, ...water]) {
        await check(`${vp}-${rend}-${name}`, `${vp} ${rend}: ${name} edge fades out`, async () => {
          await g.teleportSettled(stand[0], stand[1]);
          // Walk straight up/down the SCREEN from the edge tile (phones are too narrow for the diagonal normal):
          // 32 screen px = one tile of distance from the edge, up for the west/north edges, down for east/south.
          // the camera follow lerps: wait until the edge tile stops moving on screen (slow under load)
          let base, sign, at0, ps, data, k, vis, topOk, cols, s, inside, out;
          // the screen can still be settling under load (CANVAS repaints slowly): retry the capture a few times
          for (let attempt = 0; attempt < 4; attempt++) {
            base = await g.tileClient(edge[0], edge[1], 0);
            await new Promise((r) => setTimeout(r, 150));
            for (let n = 0, still = 0; n < 80 && still < 3; n++) {
              await new Promise((r) => setTimeout(r, 50));
              const nb = await g.tileClient(edge[0], edge[1], 0);
              still = Math.hypot(nb.x - base.x, nb.y - base.y) < 0.5 ? still + 1 : 0;
              base = nb;
            }
            sign = n[0] + n[1] < 0 ? -1 : 1;
            at0 = (d) => ({ x: base.x, y: base.y + sign * 32 * d });
            // d = -1.5 (inside), then outward 1..16 tiles
            const ds = [-1.5, ...Array.from({ length: maxD }, (_, i) => i + 1)];
            ps = [];
            for (const d of ds) ps.push({ d, ...at0(d) });
            ({ data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' }));
            {
              mkdirSync(SHOTS, { recursive: true });
              writeFileSync(
                `${SHOTS}/edge-${TAG}-${vp}-${rend}-${name}.png`,
                Buffer.from(data, 'base64'),
              );
            }
            k = await g.eval('window.devicePixelRatio');
            vis = ps.filter(
              (p) =>
                p.x > rect.left + 8 &&
                p.y > rect.top + 8 &&
                p.x < rect.left + rect.w - 8 &&
                p.y < rect.top + rect.h - 8,
            );
            topOk = [];
            for (const p of vis)
              if (await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`)) topOk.push(p);
            cols = await g.eval(
              `window.__px(${JSON.stringify(data)}, ${JSON.stringify(topOk.map((p) => ({ x: p.x, y: p.y, k })))})`,
            );
            s = topOk.map((p, i) => ({ d: p.d, c: cols[i] }));
            inside = s.find((q) => q.d === -1.5);
            out = s.filter((q) => q.d > 0);
            if (out.length >= 3) break;
            await new Promise((r) => setTimeout(r, 600));
          }
          expect(out.length >= 3, `only ${out.length} outside samples on screen`);
          const first = out[0];
          if (inside) {
            const seam = dist(inside.c, first.c);
            expect(
              seam < 45,
              `hard seam: inside vs 1 tile out RGB distance ${seam.toFixed(0)} (${JSON.stringify(inside.c)} -> ${JSON.stringify(first.c)})`,
            );
          }
          const near = out.filter((q) => q.d <= 8);
          const minL = Math.min(...near.map((q) => lum(q.c)));
          expect(
            minL > 30,
            `near-black within 8 tiles of the edge: min luminance ${minL.toFixed(0)}`,
          );
          // Real terrain has grain, so no per-step monotone test: no big jump up, and the far samples are darker.
          // (water-n samples straight up the screen leave the river for the brighter bank: natural, not a seam)
          for (let i = 1; i < out.length && name !== 'water-n'; i++)
            expect(
              lum(out[i].c) <= lum(out[i - 1].c) + 30,
              `fade jumps up at ${out[i].d}: ${lum(out[i - 1].c).toFixed(0)} -> ${lum(out[i].c).toFixed(0)}`,
            );
          if (out.length >= 6) {
            const mean = (a) => a.reduce((t, q) => t + lum(q.c), 0) / a.length;
            expect(
              mean(out.slice(-3)) < mean(out.slice(0, 3)) - 8,
              `fade does not darken outward: ${mean(out.slice(0, 3)).toFixed(0)} -> ${mean(out.slice(-3)).toFixed(0)}`,
            );
          }
          // SEAM: texture grain + mean colour of a strip just inside vs just outside the edge (+-0.75 tile).
          const WD = { w: 40, h: 14 };
          const wp = [-0.75, 0.75].map((d) => ({ d, ...at0(d) }));
          const okW = [];
          for (const p of wp)
            if (await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`)) okW.push(p);
          if (okW.length === 2) {
            const [a, b] = await g.eval(
              `window.__win(${JSON.stringify(data)}, ${JSON.stringify(okW.map((p) => ({ x: p.x, y: p.y, k, ...WD })))})`,
            );
            const dm = dist(a, b);
            const ratio = b.sd / Math.max(a.sd, 0.5);
            process.stdout.write(
              `SEAM ${vp}/${rend}/${name}: mean dist ${dm.toFixed(1)} sd in ${a.sd.toFixed(1)} out ${b.sd.toFixed(1)} ratio ${ratio.toFixed(2)}\n`,
            );
            expect(
              dm < SEAM_MEAN_MAX,
              `seam: mean colour jumps ${dm.toFixed(1)} (max ${SEAM_MEAN_MAX})`,
            );
            expect(
              a.sd < 4 || ratio > SEAM_SD_MIN,
              `seam: grain collapses ${a.sd.toFixed(1)} -> ${b.sd.toFixed(1)} (ratio ${ratio.toFixed(2)} < ${SEAM_SD_MIN})`,
            );
          } else expect(false, 'seam strips are off screen / covered');
          return `${out.length} samples, seam ${inside ? dist(inside.c, first.c).toFixed(0) : 'n/a'}, lum ${out.map((q) => lum(q.c).toFixed(0)).join(',')}`;
        });
      }
    }
  }),
);
