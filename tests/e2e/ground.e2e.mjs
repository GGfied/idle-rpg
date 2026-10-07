// Flowers (sway, Off pref, no tap blocking) + textured ground (variance, no magenta/black, no chunk seams).
// Run: node tests/e2e/ground.e2e.mjs  (own vite on :5195, ?tickMs=60 via lib.mjs)
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { check, expect, forEachViewport, waitStill, withGame } from './lib.mjs';

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

const shot = async (g) => {
  const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
  return g.eval(`window.__f.load(${JSON.stringify(data)})`);
};
const S = 'window.__f';
if (process.env.SHOTS_DIR) mkdirSync(process.env.SHOTS_DIR, { recursive: true });

await withGame(
  { port: 5195 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.eval(PAGE);
    const stats = () => g.eval(`${S}.stats()`);
    const px = async () => g.state('movement.position');

    await check('f1', 'flowers exist near spawn (total + on-screen)', async () => {
      const s = await stats();
      expect(s.total > 0 && s.visible > 0, `total ${s.total} visible ${s.visible}`);
      return `${vp}: ${s.total} flower images, ${s.visible} visible`;
    });

    await check('f2', 'Animations On: visible flower rotations change over 1 s', async () => {
      const a = await stats();
      await g.sleep(1000);
      const b = await stats();
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
      await g.teleport(d0.tx + 2, d0.ty + 2);
      await waitStill(() => g.tileClient(d0.tx, d0.ty));
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
      await waitStill(() => g.tileClient(f.tx, f.ty));
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
        await g.teleport(64, 48);
        await waitStill(() => g.eval(`${S}.worldView()`));
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
          // a same-tile teleport does not recentre the follow camera: hop away first
          await g.teleport(60, 44);
          await waitStill(() => g.eval(`${S}.worldView()`));
          await g.teleport(64, 48);
          await waitStill(() => g.eval(`${S}.worldView()`));
          const before = await g.eval(`${S}.worldView()`);
          for (let k = 0; k < 2; k++)
            await g.drag(cx - dx * span, cy - dy * span, cx + dx * span, cy + dy * span, 10);
          await g.sleep(250);
          const after = await g.eval(`${S}.worldView()`);
          const moved = Math.hypot(after.x - before.x, after.y - before.y);
          const sc = (await shot(g)).scale;
          const bad = await g.eval(`${S}.badPx(${JSON.stringify(r)}, ${sc})`);
          out.push(
            `${dx},${dy}: moved ${Math.round(moved)} mag ${bad.mag} black ${((100 * bad.black) / bad.n).toFixed(2)}%`,
          );
          expect(moved > 20, `drag ${dx},${dy} did not pan: ${moved}`);
          expect(bad.mag === 0, `magenta px ${bad.mag} after drag ${dx},${dy}`);
          expect(bad.black / bad.n < 0.02, `black ${bad.black}/${bad.n} after drag ${dx},${dy}`);
        }
        await g.teleport(64, 48);
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
          await g.teleport(s0.x, s0.y);
          await g.walkTo(s1.x, s1.y);
          await g.waitFor(
            async () => {
              const p = await px();
              return p.x === s1.x && p.y === s1.y;
            },
            { label: `walked across border ${axis}=${sp.b}`, timeoutMs: 25000 },
          );
          await g.teleport(at(0, 3).x, at(0, 3).y);
          await waitStill(() => g.tileClient(sp.b, sp.a));
          const sc = (await shot(g)).scale;
          if (process.env.SHOTS_DIR) {
            const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(
              `${process.env.SHOTS_DIR}/seam-${vp}-${axis}.png`,
              Buffer.from(data, 'base64'),
            );
          }
          const dir = async (o) => {
            const a = await g.tileClient(...Object.values(at(o, 3))),
              b = await g.tileClient(...Object.values(at(o + 1, 3)));
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            return { d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, a, b };
          };
          const measure = async (o) => {
            const { d } = await dir(o);
            const ps = [];
            for (let k = 0; k < 8; k++) {
              const t0 = at(o, k),
                t1 = at(o + 1, k);
              const a = await g.tileClient(t0.x, t0.y),
                b = await g.tileClient(t1.x, t1.y);
              for (const f of [0.2, 0.5, 0.8])
                ps.push({
                  x: a.x + (b.x - a.x) * 0.5 + (a.x - b.x) * 0 + f * 0,
                  y: (a.y + b.y) / 2,
                });
              ps.length -= 3;
              ps.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
            return g.eval(`${S}.seam(${JSON.stringify(ps)}, ${JSON.stringify(d)}, ${sc})`);
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
        const amp = async (mode) => {
          await g.eval(
            `window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on', animations: '${mode}' } })`,
          );
          await g.sleep(400);
          let max = 0;
          for (let i = 0; i < 40; i++) {
            const m = await g.eval(
              `(() => { const v = window.__idleRpg.scene().camera.worldView; let m = 0; for (const o of ${S}.flowers()) if (o.visible && o.x > v.x && o.x < v.right && o.y > v.y && o.y < v.bottom) m = Math.max(m, Math.abs(o.rotation)); return m; })()`,
            );
            max = Math.max(max, m);
            await g.sleep(100);
          }
          return (max * 180) / Math.PI;
        };
        await g.teleport(18, 15); // spawn meadow: flowers on screen
        await waitStill(() => g.eval(`${S}.worldView()`));
        const on = await amp('on');
        const red = await amp('reduced');
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
        await g.sleep(700);
        const s1 = await g.eval(
          `(() => { const a = ${S}.flowers().filter((o) => o.visible); return { n: a.length, nonzero: a.filter((o) => o.rotation !== 0).length }; })()`,
        );
        await g.sleep(500);
        const s2 = await g.eval(
          `(() => { const a = ${S}.flowers().filter((o) => o.visible); return { n: a.length, nonzero: a.filter((o) => o.rotation !== 0).length }; })()`,
        );
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
  await g.teleport(spot.x + 3, spot.y);
  await waitStill(() => g.tileClient(spot.x, spot.y));
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
