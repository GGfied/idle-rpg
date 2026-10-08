// Lake water + bridge: walk over the bridge, water not walkable, water animates (Animations On) and is still (Off),
// no magenta/fallback colours, phone frame time at the lake. Run: node tests/e2e/water.e2e.mjs (ports 9264-9267)
// Fast base: desktop/phone x webgl/canvas as 4 parallel children (the water overlay is a Graphics layer, drawn by both
// renderers; canvas was the user's black-water case), ?tickMs=60, teleportSettled, synthetic frames (g.synth.frames)
// for the "changes over time" checks instead of a 500 ms wall-clock gap, budget 60 s.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9264; // C6 block; 4 combos use 9264-9267
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

const T = (g, expr) =>
  g.eval(
    `(async () => { const W = await import('/src/features/world/index.ts'); return ${expr}; })()`,
  );
const terrain = (g, x, y) => T(g, `W.WORLD_DEF.terrainAt(${x}, ${y})`);
const pos = (g) => g.state('movement.position');
const pathLen = (g) => g.state('movement.path.length');

/** Screenshot clip -> RGBA stats helper installed in-page. */
const INSTALL = `window.__px = async (b64, b64b) => {
  const dec = async (s) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
  const a = await dec(b64); let diff = 0, magenta = 0;
  const b = b64b ? await dec(b64b) : null;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] > 200 && a[i + 1] < 70 && a[i + 2] > 200) magenta++;
    if (b && (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 1] - b[i + 1]) > 6 || Math.abs(a[i + 2] - b[i + 2]) > 6)) diff++;
  }
  return { diff, magenta, n: a.length / 4 };
};`;

const SEAM = `window.__seam = async (b64, pairs) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const k = bm.width / window.innerWidth; let sum = 0;
  for (const [a, b] of pairs) { const pa = x.getImageData(Math.round(a[0] * k), Math.round(a[1] * k), 1, 1).data, pb = x.getImageData(Math.round(b[0] * k), Math.round(b[1] * k), 1, 1).data;
    sum += Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]); }
  return sum / pairs.length;
};`;
const SHOTS = process.env.SHOTS_DIR || '';
const save = (name, b64) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(b64, 'base64'));
};
const shot = async (g, clip) =>
  (
    await g.cdp.send('Page.captureScreenshot', {
      format: 'png',
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    })
  ).data;
const px = (g, a, b) =>
  g.eval(`window.__px(${JSON.stringify(a)}, ${b ? JSON.stringify(b) : 'null'})`);

async function waterClip(g, tx, ty) {
  const p = await g.tileClient(tx, ty);
  const r = {
    x: Math.max(0, Math.round(p.x - 40)),
    y: Math.max(0, Math.round(p.y - 30)),
    width: 80,
    height: 60,
  };
  expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `water tile ${tx},${ty} not on canvas`);
  return r;
}
async function setAnimations(g, label) {
  await g.eval(
    `(() => { const s = window.__idleRpg.store; s.setState({ settingsOpen: false }); })()`,
  );
  await g.tapSelector('button[aria-label="Settings"]');
  await g.eval(`(() => { const grp = [...document.querySelectorAll('[role=radiogroup]')].find((r) => document.getElementById(r.getAttribute('aria-labelledby'))?.textContent === 'Animations');
    document.querySelectorAll('[data-qa]').forEach((e) => e.removeAttribute('data-qa'));
    [...grp.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(label)}).setAttribute('data-qa', 'anim'); })()`);
  await g.tapSelector('[data-qa=anim]');
  const on = await g.eval(`document.querySelector('[data-qa=anim]').getAttribute('aria-checked')`);
  expect(on === 'true', `Animations ${label} not selected (aria-checked=${on})`);
  await g.tapSelector('button[aria-label="Settings"]'); // close
  await g.waitFor(() => g.store('!s.settingsOpen'), { timeoutMs: 4000, label: 'settings closed' });
}
/**
 * Two clip screenshots 500 ms apart on the SYNTHETIC clock (loop frozen, frames stepped by hand), then thaw.
 * The follow camera is pinned for the pair (lerp 1 = scroll sits exactly on the idle player): with lerp 0.15 it keeps
 * easing by sub-pixel amounts long after it looks settled (phone after the Settings tap: scrollY 478.6721 -> .6706
 * over two frames), which re-samples the baked water and made t4 read 52-448 px "changed" with Animations Off (seen
 * 5x). Pinned, the only thing that can change between the two frames is what is drawn: the water layer.
 */
async function pair(g, clip) {
  const cam = 'window.__idleRpg.scene().camera';
  const lerp = await g.eval(`[${cam}.lerp.x, ${cam}.lerp.y]`);
  await g.eval(`${cam}.lerp.set(1, 1), 0`);
  try {
    const [a, b] = await g.synth.frames([0, 500], { clip, keep: true });
    return [a.b64, b.b64];
  } finally {
    await g.synth.thaw();
    await g.eval(`${cam}.lerp.set(${lerp[0]}, ${lerp[1]}), 0`);
  }
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp0, renderer) => {
  const vp = renderer === 'canvas' ? `${vp0}-canvas` : vp0;
  await g.eval(INSTALL);
  await g.eval(SEAM);
  // bridge extent on row 15 from terrainAt
  const row = await T(
    g,
    `Array.from({ length: 30 }, (_, i) => [30 + i, W.WORLD_DEF.terrainAt(30 + i, 15)])`,
  );
  const bridge = row.filter(([, k]) => k === 'bridge').map(([x]) => x);
  const west = Math.min(...bridge) - 1;
  const east = Math.max(...bridge) + 1;

  await check('t1', 'tap bridge tiles: walk onto it and across to the far shore', async () => {
    expect(bridge.length === 5 && bridge[0] === 35, `bridge tiles ${bridge}`);
    await g.teleportSettled(west, 15);
    await g.settle();
    await g.tapTile(west + 2, 15); // 37: a bridge tile
    await g.waitFor(async () => (await pathLen(g)) === 0 && (await pos(g)).x >= west + 2, {
      label: 'on bridge',
    });
    const onBridge = await pos(g);
    expect(
      (await terrain(g, onBridge.x, onBridge.y)) === 'bridge',
      `stood on ${JSON.stringify(onBridge)}`,
    );
    const xs = [onBridge.x];
    for (let i = 0; i < 8 && (await pos(g)).x <= east; i++) {
      const here = await pos(g);
      await g.settle();
      await g.tapTile(Math.min(here.x + 2, east + 1), 15);
      await g.waitFor(async () => (await pathLen(g)) === 0, { label: 'arrive' });
      xs.push((await pos(g)).x);
    }
    const end = await pos(g);
    expect(
      end.x > east && (await terrain(g, end.x, end.y)) !== 'water',
      `end ${JSON.stringify(end)}`,
    );
    return `${vp}: bridge x${bridge[0]}..${bridge.at(-1)}, stops ${xs}, end ${end.x},${end.y} (${await terrain(g, end.x, end.y)}), far shore x>${east}`;
  });

  await check('t2', 'tapping water beside the bridge never puts the player in water', async () => {
    await g.teleportSettled(west + 2, 15);
    await g.settle();
    const out = [];
    for (const [tx, ty] of [
      [west + 2, 14],
      [west + 3, 16],
      [west + 3, 13],
    ]) {
      expect((await terrain(g, tx, ty)) === 'water', `${tx},${ty} is ${await terrain(g, tx, ty)}`);
      await g.tapTile(tx, ty);
      await g.waitTicks(3); // a walk (if any) has started; then wait until it has finished
      await g.waitIdle();
      const p = await pos(g);
      expect((await terrain(g, p.x, p.y)) !== 'water', `player in water at ${JSON.stringify(p)}`);
      expect(!(p.x === tx && p.y === ty), `player on water tile ${tx},${ty}`);
      out.push(`${tx},${ty}->${p.x},${p.y}`);
    }
    return `${vp}: ${out.join(' ')}`;
  });

  // water-only clip: tile (west+3, 13) is 2 tiles above the bridge row
  await g.teleportSettled(west + 1, 15);
  await g.settle();
  const clip = await waterClip(g, west + 3, 13);

  await check('t3', 'Animations On: water pixels change within ~0.5 s', async () => {
    const [a, b] = await pair(g, clip);
    const r = await px(g, a, b);
    expect(r.diff > 20, `only ${r.diff}/${r.n} px changed`);
    return `${vp}: ${r.diff}/${r.n} px differ`;
  });

  await check('t4', 'Animations Off (real taps in Settings): water is identical', async () => {
    await setAnimations(g, 'Off');
    // Phone: the Settings tap re-lays the HUD sheet and the camera inset glides; wait for the world to stop
    // moving, then re-derive the clip (the water tile may have shifted on screen).
    await g.settle();
    const clip4 = await waterClip(g, west + 3, 13);
    const [a, b] = await pair(g, clip4);
    save(`t4a-${vp}`, a);
    save(`t4b-${vp}`, b);
    save(`t4full-${vp}`, await shot(g));
    const r = await px(g, a, b);
    const pref = await g.eval(`window.__idleRpg.store.getState().prefs.visuals.animations`);
    expect(r.diff === 0, `${r.diff}/${r.n} px still change (prefs.visuals.animations=${pref})`);
    return `${vp}: ${r.diff}/${r.n} px differ`;
  });

  await check('t5', 'no magenta / fallback colour over lake + bridge', async () => {
    await setAnimations(g, 'On');
    await g.teleportSettled(west + 1, 15);
    await g.settle();
    const full = await shot(g);
    save(`lake-${vp}`, full);
    const r = await px(g, full);
    expect(r.magenta === 0, `${r.magenta} magenta px of ${r.n}`);
    return `${vp}: 0 magenta of ${r.n}`;
  });

  await check(
    't6',
    'frame time at the lake, Animations On (p95 <= 17 ms; phone is the gate)',
    async () => {
      // real frames on purpose: frame time is what is measured (180 rAF intervals, ~3 s)
      const ft = await g.eval(
        `new Promise((res) => { const d = []; let last = performance.now(); const f = (t) => { d.push(t - last); last = t; if (d.length < 180) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); res({ p50: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1] }); } }; requestAnimationFrame(f); })`,
      );
      const msg = `${vp}: p50 ${ft.p50.toFixed(1)} p95 ${ft.p95.toFixed(1)} max ${ft.max.toFixed(1)} ms`;
      if (vp === 'phone') expect(ft.p95 <= 17, msg);
      return msg;
    },
  );

  await check(
    't7',
    'water/shore continuous across the chunk border y=31|32 (adjacent-pixel jump ~ control)',
    async () => {
      await setAnimations(g, 'Off');
      // CHUNK_SIZE: the lake straddles the chunk borders x=31|32 and y=31|32
      // border water-water edges: [axis, tileOnPositiveSide x, y]; stand on dry land within 2 tiles of one
      const edges = await T(
        g,
        `(() => { const w = (x, y) => W.WORLD_DEF.terrainAt(x, y) === 'water'; const e = [], d = [];
            for (let t = 0; t < 64; t++) { if (w(31, t) && w(32, t)) e.push(['x', 32, t]); if (w(t, 31) && w(t, 32)) e.push(['y', t, 32]); }
            for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) if (!w(x, y) && W.WORLD_DEF.terrainAt(x, y) !== 'wall' && e.some(([, ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) <= 3)) d.push([x, y]);
            return { e, d }; })()`,
      );
      expect(
        edges.e.length > 20 && edges.d.length > 0,
        `edges ${edges.e.length} dry ${edges.d.length}`,
      );
      // Same sampling as before, computed in ONE page eval (was ~120 CDP round trips per call).
      // stand = [tx, ty]: PREDICT the client points for a settled camera on that tile instead of the live camera (the
      // follow camera keeps the player at one screen point, so client = playerPoint + (world - standWorld) * scale).
      const pairsAt = (shift, stand = null) =>
        g.eval(`(async () => {
          const W = await import('/src/features/world/index.ts'); const { isoProjection } = await import('/src/render/projection.ts');
          const live = (tx, ty) => { const w = isoProjection.tileToWorld(tx, ty); return window.__e.toClient(w.x, w.y); };
          const stand = ${JSON.stringify(stand)}; let tc = live;
          if (stand) { const p = window.__e.game().movement.position, P = live(p.x, p.y), w0 = isoProjection.tileToWorld(p.x, p.y);
            const k = window.__e.toClient(w0.x + 100, w0.y).x / 100 - window.__e.toClient(w0.x, w0.y).x / 100, s = isoProjection.tileToWorld(stand[0], stand[1]);
            tc = (tx, ty) => { const w = isoProjection.tileToWorld(tx, ty); return { x: P.x + (w.x - s.x) * k, y: P.y + (w.y - s.y) * k }; }; }
          const w = (x, y) => W.WORLD_DEF.terrainAt(x, y) === 'water'; const shift = ${shift}; const out = [];
          for (const [axis, ex, ey] of ${JSON.stringify(edges.e)}) {
            // control edges: same water edge shifted away from the border (interior water) when asked
            const [cx, cy] = shift ? (axis === 'x' ? [ex + shift, ey] : [ex, ey + shift]) : [ex, ey];
            if (shift && (!w(cx, cy) || !w(axis === 'x' ? cx - 1 : cx, axis === 'x' ? cy : cy - 1))) continue;
            for (let f = 0.1; f < 1; f += 0.4) {
              const a = axis === 'x' ? tc(cx - 0.04, cy + f) : tc(cx + f, cy - 0.04);
              const b = axis === 'x' ? tc(cx + 0.04, cy + f) : tc(cx + f, cy + 0.04);
              if (![a, b].every((q) => q.x > 5 && q.y > 5 && q.x < 370 && q.y < 440)) continue;
              out.push([[a.x, a.y], [b.x, b.y]]);
            }
          }
          return out; })()`);
      let stand = null;
      const log = [];
      const cands = edges.d
        .sort(
          (p, q) =>
            Math.abs(p[0] - 14) + Math.abs(p[1] - 20) - Math.abs(q[0] - 14) - Math.abs(q[1] - 20),
        )
        .slice(0, 12);
      // Same candidates, same order; candidates predicted to show < 4 samples go last instead of costing a
      // teleport + camera settle each (desktop tried 9 spots, ~13 s). The real count is still measured after
      // settling, so a wrong prediction only costs time.
      const pred = [];
      for (const c of cands) pred.push((await pairsAt(0, c)).length);
      const order = [
        ...cands.filter((_, i) => pred[i] >= 4),
        ...cands.filter((_, i) => pred[i] < 4),
      ];
      for (const [x, y] of order) {
        await g.teleportSettled(x, y);
        await g.settle();
        const n = (await pairsAt(0)).length;
        log.push(`${x},${y}:${n}`);
        if (n >= 4) {
          stand = [x, y];
          break;
        }
      }
      expect(stand, `no standing spot shows >=4 border water samples (${log.join(' ')})`);
      const full = await shot(g);
      save(`chunk-border-${vp}`, full);
      const call = async (edge, min = 4) => {
        const pairs = await pairsAt(edge);
        expect(pairs.length >= min, `edge ${edge}: only ${pairs.length} water samples`);
        return g.eval(`window.__seam(${JSON.stringify(full)}, ${JSON.stringify(pairs)})`);
      };
      const border = await call(0);
      let ctrl = null;
      for (const sh of [2, -2, 3, -3])
        if (ctrl === null && (await pairsAt(sh)).length >= 3) ctrl = await call(sh, 3);
      expect(ctrl !== null, 'no control water edge');
      expect(
        border <= ctrl * 1.6 + 6,
        `border jump ${border.toFixed(1)} vs control ${ctrl.toFixed(1)}`,
      );
      return `${vp}: mean pixel jump border ${border.toFixed(1)} vs control ${ctrl.toFixed(1)} (stand ${stand}, tried ${log.join(' ')}; predicted ${pred})`;
    },
  );
});
