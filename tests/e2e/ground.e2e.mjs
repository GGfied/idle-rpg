// Flowers (sway, Off pref, no tap blocking) + textured ground (variance, no magenta/black, no chunk seams).
// Run: node tests/e2e/ground.e2e.mjs  (base port E2E_PORT or 9055; desktop + phone x WebGL + CANVAS as parallel children)
// Fast base: ?tickMs=60, sway sampled on synthetic frames (g.synth) instead of seconds of wall clock, camera waits are
// waitStill/settle, teleports never sleep.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, waitStill, withGame } from './lib.mjs';

const PAGE = `(() => {
  const world = () => window.__idleRpg.scene().camera.scene;
  const cam = () => window.__idleRpg.scene().camera;
  const L = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  window.__f = {
    flowers: () => world().children.list.filter((o) => o.type === 'Image' && o.getData && o.getData('flower')),
    stats: () => { const v = cam().worldView; const all = window.__f.flowers();
      const vis = all.filter((o) => o.visible && o.active && o.x > v.x && o.x < v.right && o.y > v.y && o.y < v.bottom);
      return { total: all.length, visible: vis.length, rots: vis.slice(0, 40).map((o) => o.rotation), data: vis.slice(0, 40).map((o) => { const d = o.getData('flower'); return { tx: d.tx, ty: d.ty }; }) }; },
    worldView: () => { const v = cam().worldView; return { x: v.x, y: v.y }; },
    // find tile of kind with 3x3 (and radius r) of same kind; returns first from a spiral-free scan
    spots: async (kind, r, n) => { const w = await import('/src/features/world/index.ts'); const out = [];
      for (let y = 4; y < 92; y++) for (let x = 4; x < 124; x += 2) { let ok = true;
        for (let j = -r; j <= r && ok; j++) for (let i = -r; i <= r; i++) if (w.WORLD_DEF.terrainAt(x + i, y + j) !== kind) { ok = false; break; }
        if (ok) out.push({ x, y }); }
      return out.filter((_, i) => i % Math.max(1, Math.floor(out.length / n)) === 0).slice(0, n); },
    // border x: first (bx, y0) with 8 rows of grass 5 tiles either side; axis 'x' or 'y'
    seamSpot: async (axis) => { const w = await import('/src/features/world/index.ts'); const t = w.WORLD_DEF.terrainAt;
      // tall tree/object sprites would pollute the luminance samples: keep 4 tiles clear of them
      const solids = [...w.WORLD_TREES, ...w.WORLD_OBJECT_SPAWNS];
      const clear = (x0, y0, x1, y1) => !solids.some((o) => o.x >= x0 - 4 && o.x <= x1 + 4 && o.y >= y0 - 4 && o.y <= y1 + 4);
      const ok = (x, y) => t(x, y) === 'grass';
      for (const b of [32, 64, 96]) for (let a = 4; a < 88; a++) { let good = true;
        for (let k = 0; k < 8 && good; k++) for (let o = -6; o <= 5; o++) { const x = axis === 'x' ? b + o : a + k, y = axis === 'x' ? a + k : b + o; if (!ok(x, y)) { good = false; break; } }
        if (good) {
          const x0 = axis === 'x' ? b - 6 : a, x1 = axis === 'x' ? b + 5 : a + 7;
          const y0 = axis === 'x' ? a : b - 6, y1 = axis === 'x' ? a + 7 : b + 5;
          if (clear(x0, y0, x1, y1)) return { b, a };
        } }
      return null; },
    load: async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' })); const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      window.__px = x.getImageData(0, 0, bmp.width, bmp.height); return { w: bmp.width, h: bmp.height, scale: bmp.width / window.innerWidth }; },
    lum: (x, y) => { const p = window.__px; x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= p.width || y >= p.height) return NaN; const i = (y * p.width + x) * 4; return L(p.data[i], p.data[i + 1], p.data[i + 2]); },
    // luminance std + distinct quantised colours over the diamonds (client px centres cs, half w/h) at scale s
    variance: (cs, hw, hh, s) => { const p = window.__px; const vals = []; const set = new Set();
      for (const c of cs) for (let dy = -hh * 0.8; dy <= hh * 0.8; dy += 1 / s) for (let dx = -hw * 0.8; dx <= hw * 0.8; dx += 1 / s) {
        if (Math.abs(dx) / hw + Math.abs(dy) / hh > 0.8) continue; const x = Math.round((c.x + dx) * s), y = Math.round((c.y + dy) * s);
        const i = (y * p.width + x) * 4; vals.push(L(p.data[i], p.data[i + 1], p.data[i + 2])); set.add((p.data[i] >> 2) + ',' + (p.data[i + 1] >> 2) + ',' + (p.data[i + 2] >> 2)); }
      const m = vals.reduce((a, b) => a + b, 0) / vals.length; return { std: Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length), colours: set.size, n: vals.length }; },
    badPx: (rect, s) => { const p = window.__px; let mag = 0, black = 0, n = 0;
      for (let y = Math.round(rect.top * s); y < Math.round(rect.bottom * s); y += 2) for (let x = Math.round(rect.left * s); x < Math.round(rect.right * s); x += 2) {
        const i = (y * p.width + x) * 4, r = p.data[i], g = p.data[i + 1], b = p.data[i + 2]; n++;
        if (r > 220 && g < 60 && b > 220) mag++; if (r < 10 && g < 10 && b < 10) black++; }
      return { mag, black, n }; },
    // mean |lum(+1px) - lum(-1px)| across a border at client points ps along unit dir d
    seam: (ps, d, s) => { let sum = 0, n = 0; for (const q of ps) { const a = window.__f.lum((q.x - d.x * 1.5) * s, (q.y - d.y * 1.5) * s), b = window.__f.lum((q.x + d.x * 1.5) * s, (q.y + d.y * 1.5) * s); if (!isNaN(a) && !isNaN(b)) { sum += Math.abs(a - b); n++; } } return { mean: sum / n, n }; },
    canvasRect: () => { const r = document.querySelector('canvas:not(.minimap)').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; },
  };
})()`;

// half = a half-resolution capture (clip scale 0.5): 4x fewer pixels to encode/decode, for the coarse magenta/black scans
const shot = async (g, half = false) => {
  const { data } = await g.cdp.send(
    'Page.captureScreenshot',
    half
      ? {
          format: 'png',
          clip: {
            x: 0,
            y: 0,
            width: await g.eval('window.innerWidth'),
            height: await g.eval('window.innerHeight'),
            scale: 0.5,
          },
        }
      : { format: 'png' },
  );
  return g.eval(`window.__f.load(${JSON.stringify(data)})`);
};
const S = 'window.__f';
if (process.env.SHOTS_DIR) mkdirSync(process.env.SHOTS_DIR, { recursive: true });

const PORT = Number(process.env.E2E_PORT ?? 9055);
const BUDGET_MS = 60e3;
// Ground art is drawn: run both renderers (the user's black-water bug was CANVAS-only).
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
// Max |rotation| (deg) of on-screen flowers over `spanMs` of synthetic frames (every `dt` ms), loop frozen.
const SWAY_MAX = (
  spanMs,
  dt,
) => `(() => { const S = window.__e.synth, cam = window.__idleRpg.scene().camera; let m = 0;
  for (let t = 0; t <= ${spanMs}; t += ${dt}) { S.step(${dt}); const v = cam.worldView;
    for (const o of window.__f.flowers()) if (o.visible && o.x > v.x && o.x < v.right && o.y > v.y && o.y < v.bottom) m = Math.max(m, Math.abs(o.rotation)); }
  return (m * 180) / Math.PI; })()`;
const ZERO = `(() => { const a = window.__f.flowers().filter((o) => o.visible); return { n: a.length, nonzero: a.filter((o) => o.rotation !== 0).length }; })()`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, renderer) => {
    await g.eval(PAGE);
    vp = `${vp}/${renderer}`;
    const stats = () => g.eval(`${S}.stats()`);
    const px = async () => g.state('movement.position');

    await check('f1', 'flowers exist near spawn (total + on-screen)', async () => {
      const s = await stats();
      expect(s.total > 0 && s.visible > 0, `total ${s.total} visible ${s.visible}`);
      return `${vp}: ${s.total} flower images, ${s.visible} visible`;
    });

    await check('f2', 'Animations On: visible flower rotations change over 1 s', async () => {
      // 1 s of synthetic frames (20 x 50 ms, update + render) instead of a 1 s wall-clock sleep
      await g.synth.freeze();
      const a = await stats();
      await g.synth.step(50, 20);
      const b = await stats();
      await g.synth.thaw();
      const key = (s) => s.data.map((d) => d.tx + ',' + d.ty);
      const n = Math.min(a.rots.length, b.rots.length);
      let changed = 0;
      for (let i = 0; i < n; i++)
        if (key(a)[i] === key(b)[i] && Math.abs(a.rots[i] - b.rots[i]) > 1e-4) changed++;
      expect(changed > 0, `0/${n} rotations changed`);
      return `${vp}: ${changed}/${n} changed, e.g. ${a.rots[0].toFixed(4)} -> ${b.rots[0].toFixed(4)}`;
    });

    await check('f4', 'flowers do not block taps (tap on a flower and next to it)', async () => {
      // spawn flowers can sit under the phone HUD: stand 2 tiles from one first
      const s0 = await stats();
      const d0 = s0.data[0];
      await g.teleport(d0.tx + 2, d0.ty + 2, { settleMs: 0 });
      await g.settle();
      const s = await stats();
      const flowerPos = (d) =>
        g.eval(
          `(() => { const o = ${S}.flowers().find((o) => { const d = o.getData('flower'); return d.tx === ${d.tx} && d.ty === ${d.ty}; }); return window.__e.toClient(o.x, o.y - 3); })()`,
        );
      let f = null;
      let pos = null;
      for (const d of s.data) {
        const p = await flowerPos(d);
        if (await g.page(`topIsCanvas(${p.x}, ${p.y})`)) {
          f = d;
          pos = p;
          break;
        }
      }
      expect(f, 'no visible flower on the canvas');
      const me = await px();
      await g.tap(pos.x, pos.y);
      await g.waitFor(
        async () => {
          const p = await px();
          return p.x === f.tx && p.y === f.ty;
        },
        { label: `walk to flower tile ${f.tx},${f.ty}`, timeoutMs: 20000 },
      );
      await g.settle();
      let t = null;
      for (const [i, j] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const k = await g.eval(
          `import('/src/features/world/index.ts').then((w) => w.WORLD_DEF.terrainAt(${f.tx + i}, ${f.ty + j}))`,
        );
        const c = await g.tileClient(f.tx + i, f.ty + j);
        if ((k === 'grass' || k === 'flowers') && (await g.page(`topIsCanvas(${c.x}, ${c.y})`))) {
          t = { x: f.tx + i, y: f.ty + j };
          break;
        }
      }
      expect(t, 'no walkable neighbour on the canvas');
      await g.tapTile(t.x, t.y);
      await g.waitFor(
        async () => {
          const p = await px();
          return p.x === t.x && p.y === t.y;
        },
        { label: `walk to neighbour ${t.x},${t.y}`, timeoutMs: 20000 },
      );
      return `${vp}: from ${me.x},${me.y} -> flower ${f.tx},${f.ty} -> ${t.x},${t.y}`;
    });

    await check('g5a', 'grass ground is textured (luminance std, distinct colours)', async () => {
      const [spot] = await g.eval(`${S}.spots('grass', 1, 12).then((a) => a.slice(5, 6))`);
      return variance(g, vp, spot, 'grass');
    });
    await check('g5b', 'path and sand ground are textured', async () => {
      const path = (await g.eval(`${S}.spots('path', 0, 6)`))[0];
      const sand = (await g.eval(`${S}.spots('sand', 0, 6)`))[0];
      expect(path && sand, `spots path ${JSON.stringify(path)} sand ${JSON.stringify(sand)}`);
      return `${await variance(g, vp, path, 'path')} | ${await variance(g, vp, sand, 'sand')}`;
    });

    await check(
      'g5c',
      '8-way drag pan far: no magenta, no black ground, camera moved',
      async () => {
        await g.teleportSettled(64, 48);
        const r = await g.eval(`${S}.canvasRect()`);
        const cx = (r.left + r.right) / 2,
          cy = (r.top + r.bottom) / 2;
        // shrink until all 8 start/end points are bare canvas (chat box / HUD swallow drags)
        let span = Math.min(r.right - r.left, r.bottom - r.top) * 0.35;
        const clear = async (sp) => {
          for (const dx of [-1, 0, 1])
            for (const dy of [-1, 0, 1])
              if (!(await g.page(`topIsCanvas(${cx + dx * sp}, ${cy + dy * sp})`))) return false;
          return true;
        };
        while (span > 40 && !(await clear(span))) span *= 0.85;
        const out = [];
        for (const [dx, dy] of [
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [-1, -1],
          [0, -1],
          [1, -1],
        ]) {
          // a same-tile teleport does not recentre the follow camera: alternate between two tiles (one hop per direction)
          const wv0 = await g.eval(`${S}.worldView()`);
          await g.teleport(...(out.length % 2 ? [64, 48] : [60, 44]), { settleMs: 0 });
          // Before the first drag the follow camera is attached and recentres on the hop: wait until it has STARTED
          // moving (else a still-sample can pass first; phone:canvas went red that way), then settle. After a drag-pan
          // the camera stays detached until the player walks (camera.ts re-follow), so a store teleport does not move
          // it: the pans are cumulative, exactly as in the original file (whose 700 ms hop sleep did not recentre either).
          if (out.length === 0)
            await g.waitFor(
              async () => {
                const v = await g.eval(`${S}.worldView()`);
                return Math.hypot(v.x - wv0.x, v.y - wv0.y) > 5;
              },
              { timeoutMs: 5000, label: 'camera follows the first teleport' },
            );
          await waitStill(() => g.eval(`${S}.worldView()`), { intervalMs: 80, stable: 2, eps: 1 });
          const before = await g.eval(`${S}.worldView()`);
          for (let k = 0; k < 2; k++)
            await g.drag(cx - dx * span, cy - dy * span, cx + dx * span, cy + dy * span, 6); // same travel, fewer CDP moves
          // wait for the pan (and any ease after release) to stop instead of a fixed 250 ms
          const after = await waitStill(() => g.eval(`${S}.worldView()`), {
            intervalMs: 80,
            stable: 2,
          });
          const moved = Math.hypot(after.x - before.x, after.y - before.y);
          const sc = (await shot(g, true)).scale;
          const bad = await g.eval(`${S}.badPx(${JSON.stringify(r)}, ${sc})`);
          out.push(
            `${dx},${dy}: moved ${Math.round(moved)} mag ${bad.mag} black ${((100 * bad.black) / bad.n).toFixed(2)}%`,
          );
          expect(moved > 20, `drag ${dx},${dy} did not pan: ${moved}`);
          expect(bad.mag === 0, `magenta px ${bad.mag} after drag ${dx},${dy}`);
          expect(bad.black / bad.n < 0.02, `black ${bad.black}/${bad.n} after drag ${dx},${dy}`);
        }
        await g.teleport(64, 48, { settleMs: 0 });
        return `${vp}: ${out.join(' ; ')}`;
      },
    );

    for (const axis of ['x', 'y']) {
      await check(
        `g6${axis}`,
        `no hard line across a chunk border (${axis} border), after walking over it`,
        async () => {
          const sp = await g.eval(`${S}.seamSpot(${JSON.stringify(axis)})`);
          expect(sp, 'no all-grass border stretch found');
          const at = (o, k) =>
            axis === 'x' ? { x: sp.b + o, y: sp.a + k } : { x: sp.a + k, y: sp.b + o };
          const s0 = at(-4, 3),
            s1 = at(3, 3);
          await g.teleport(s0.x, s0.y, { settleMs: 0 });
          await g.walkTo(s1.x, s1.y);
          await g.waitFor(
            async () => {
              const p = await px();
              return p.x === s1.x && p.y === s1.y;
            },
            { label: `walked across border ${axis}=${sp.b}`, timeoutMs: 25000 },
          );
          await g.teleport(at(0, 3).x, at(0, 3).y, { settleMs: 0 });
          await g.settle();
          const sc = (await shot(g)).scale;
          if (process.env.SHOTS_DIR) {
            const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(
              `${process.env.SHOTS_DIR}/seam-${vp}-${axis}.png`,
              Buffer.from(data, 'base64'),
            );
          }
          // Same sample points as before (midpoint of tiles (o,k)-(o+1,k), k 0..7; direction from row 3), but all
          // client positions come from ONE page eval instead of ~18 round trips per measure.
          const measure = async (o) => {
            const pairs = [];
            for (let k = 0; k < 8; k++) pairs.push([at(o, k), at(o + 1, k)]);
            return g.eval(`(async () => { const tc = window.__e.tileClient; const pairs = ${JSON.stringify(pairs)};
              const cs = await Promise.all(pairs.map(async ([t0, t1]) => [await tc(t0.x, t0.y), await tc(t1.x, t1.y)]));
              const [a, b] = cs[3], l = Math.hypot(b.x - a.x, b.y - a.y), d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
              const ps = cs.map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
              return ${S}.seam(ps, d, ${sc}); })()`);
          };
          // border sits between offsets -1 and 0; controls are inside chunks
          const border = await measure(-1);
          const ctrl1 = await measure(-4),
            ctrl2 = await measure(2);
          const ctrl = (ctrl1.mean + ctrl2.mean) / 2;
          expect(
            border.mean <= ctrl * 1.6 + 2,
            `seam ${border.mean.toFixed(2)} vs control ${ctrl.toFixed(2)} (n ${border.n})`,
          );
          return `${vp}: ${axis}=${sp.b} seam ${border.mean.toFixed(2)} control ${ctrl.toFixed(2)} (n ${border.n})`;
        },
      );
    }

    await check(
      'f5',
      'Reduced sway < On sway, both within their amplitude (no double sway)',
      async () => {
        // Was 40 wall-clock samples x 100 ms per mode; now one full Reduced period (4000 ms) of synthetic 50 ms frames
        // per mode, sampling every frame (denser, so the max is at least as tight as before).
        const amp = async (mode) => {
          await g.eval(
            `window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on', animations: '${mode}' } })`,
          );
          await g.synth.step(50, 8); // 400 ms for the mode to apply (was a 400 ms sleep)
          return g.eval(SWAY_MAX(4000, 50));
        };
        await g.teleportSettled(18, 15); // spawn meadow: flowers on screen
        await g.synth.freeze();
        const on = await amp('on');
        const red = await amp('reduced');
        await g.synth.thaw();
        await g.eval(
          "window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on', animations: 'on' } })",
        );
        expect(on > 1.5 && on <= 7.05, `On max ${on.toFixed(2)} deg (want 1.5..7)`);
        expect(red > 0.05 && red <= 1.25, `Reduced max ${red.toFixed(2)} deg (want <=1.2)`);
        expect(red < on, `reduced ${red} not < on ${on}`);
        return `${vp}: On max ${on.toFixed(2)} deg, Reduced max ${red.toFixed(2)} deg`;
      },
    );

    await check(
      'f3',
      'Animations Off (real taps in Settings): every flower rotation is 0',
      async () => {
        const open = await g.page('rect(\'button[aria-label="Settings"]\')');
        await g.tap(open.x, open.y);
        const btn = async (text) =>
          g.eval(
            `(() => { const gr = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Animations'); const b = [...gr.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(text)}); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
        let p = await btn('Off');
        await g.tap(p.x, p.y);
        expect(
          (await g.eval('window.__idleRpg.store.getState().prefs.visuals.animations')) === 'off',
          'pref not off',
        );
        await g.eval('window.__idleRpg.store.getState().closeSettings()');
        // 700 ms then 500 ms more of synthetic frames (was two wall-clock sleeps)
        await g.synth.freeze();
        await g.synth.step(50, 14);
        const s1 = await g.eval(ZERO);
        await g.synth.step(50, 10);
        const s2 = await g.eval(ZERO);
        await g.synth.thaw();
        expect(s1.n > 0, 'no flowers');
        expect(
          s1.nonzero === 0 && s2.nonzero === 0,
          `non-zero rotations ${s1.nonzero}/${s2.nonzero} of ${s1.n}`,
        );
        return `${vp}: ${s2.n} flowers, 0 non-zero rotation (Off)`;
      },
    );
  }),
);

async function variance(g, vp, spot, kind) {
  expect(spot, `no ${kind} spot`);
  await g.teleport(spot.x + 3, spot.y, { settleMs: 0 });
  await g.settle();
  const sc = (await shot(g)).scale;
  const nb = [[0, 0]];
  const cs = [];
  for (const [i, j] of nb) cs.push(await g.tileClient(spot.x + i, spot.y + j));
  const a = await g.tileClient(spot.x, spot.y),
    b = await g.tileClient(spot.x + 1, spot.y);
  const hw = Math.abs(b.x - a.x) > 0 ? Math.abs(b.x - a.x) : 32;
  const hh = Math.abs(b.y - a.y) > 0 ? Math.abs(b.y - a.y) : 16;
  const v = await g.eval(`${S}.variance(${JSON.stringify(cs)}, ${hw}, ${hh}, ${sc})`);
  const full = `${vp} ${kind}@${spot.x},${spot.y}: std ${v.std.toFixed(2)}, ${v.colours} colours, ${v.n} px`;
  expect(v.std > 2.5 && v.colours > 12, full + ' (flat)');
  return full;
}
