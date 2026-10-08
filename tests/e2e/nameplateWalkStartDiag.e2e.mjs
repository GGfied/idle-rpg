/* global console */
// Diagnosis (not a pass/fail gate): which of body / label / camera jumps in the first frames of a walk?
// Samples per rendered frame: walker container x, label world x, camera scrollX/worldView.x, player tile; prints the
// first ~12 frames after the walker starts moving and the biggest per-frame deltas. Run: node tests/e2e/nameplateWalkStartDiag.e2e.mjs
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9201; // C5 port block 9201-9250
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: (process.env.VPS || 'desktop,landscape').split(','),
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SAMPLER = `(() => { const sc = window.__idleRpg.scene().camera.scene; const cam = sc.cameras.main;
  window.__wn = window.__wn || 0; const L = (window.__wd = { on: false, f: [] });
  sc.events.on('render', () => { if (!L.on) return; const v = cam.worldView; const t0 = performance.now();
    const rows = []; sc.children.list.forEach((c) => { if (!c.list || !c.visible) return; const i = c.__wid ?? (c.__wid = ++window.__wn); const t = c.list.find((o) => o.type === 'Text' && o.visible && o.text); if (!t) return;
      const m = t.getWorldTransformMatrix(); rows.push({ i, n: t.text, cx: c.x, lx: m.tx, cy: c.y }); });
    const p = window.__idleRpg.store.getState().game.movement.position;
    const rc = sc.game.canvas.getBoundingClientRect(); L.f.push({ t: t0, sx: cam.scrollX, vx: v.x, vw: v.width, z: cam.zoom, cl: rc.left, cw: rc.width, px: p.x, py: p.y, rows }); }); })()`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    await g.eval(SAMPLER);
    // Timing IS the subject (per-frame body/label/camera deltas while walking): 300 ms ticks keep ~18 real frames per
    // tile step so the walk-start window has enough samples; 60 ms ticks would cross a tile every ~4 frames.
    await g.setTickMs(300);
    await g.teleportSettled(82, 68);
    await g.eval('window.__wd.f = []; window.__wd.on = true');
    await g.walkTo(94, 68);
    if (process.env.SHOT) {
      await g.waitState('movement.position', 'p => p.x >= 85', { label: 'walked 3 tiles' });
      await g.eval('window.__wd.shotAt = window.__wd.f.length');
      await g.screenshot(`diag-${vp}`);
      console.log(`${vp} screenshot taken at sample ${await g.eval('window.__wd.shotAt')}`);
    }
    // sample the whole walk: stop when the walker arrives (was a fixed 4.5 s sleep)
    await g.waitState('movement.position', 'p => p.x === 94', { label: 'arrived at 94,68' });
    await g.waitIdle();
    await g.eval('window.__wd.on = false');
    const f = await g.eval('window.__wd.f');
    // walker = the container with the largest x travel
    const trav = new Map();
    for (const fr of f)
      for (const r of fr.rows) {
        const a = trav.get(r.i) ?? { min: 1e9, max: -1e9 };
        a.min = Math.min(a.min, r.cx);
        a.max = Math.max(a.max, r.cx);
        trav.set(r.i, a);
      }
    let wi = -1,
      best = -1;
    // the entity with the largest single-frame LABEL jump (the symptom), not the largest traveller
    const byId = new Map();
    f.forEach((fr, k) =>
      fr.rows.forEach((r) => {
        const a = byId.get(r.i) ?? [];
        a.push({ k, ...r });
        byId.set(r.i, a);
      }),
    );
    const jumpers = [];
    for (const [i, a] of byId) {
      let m = 0;
      for (let j = 1; j < a.length; j++)
        m = Math.max(m, Math.abs(a[j].lx - a[j - 1].lx - (f[a[j].k].vx - f[a[j - 1].k].vx)));
      jumpers.push(`${a[0].n}#${i}:${m.toFixed(1)}`);
      if (m > best) {
        best = m;
        wi = i;
      }
    }
    console.log(`${vp} max label jump per entity: ${jumpers.join(' ')}`);
    const S = f
      .map((fr, k) => {
        const r = fr.rows.find((x) => x.i === wi);
        return r
          ? {
              k,
              dt: k ? fr.t - f[k - 1].t : 0,
              body: r.cx,
              label: r.lx,
              vx: fr.vx,
              vw: fr.vw,
              z: fr.z,
              scr: fr.cl + ((r.lx - fr.vx) / fr.vw) * fr.cw,
              scroll: fr.sx,
              tile: fr.px,
            }
          : null;
      })
      .filter(Boolean);
    const k0 = S.findIndex((s, k) => k && Math.abs(s.body - S[k - 1].body) > 0.05);
    let kj = 1,
      bj = 0;
    S.forEach((s, j) => {
      if (j && Math.abs(s.label - S[j - 1].label) > bj) {
        bj = Math.abs(s.label - S[j - 1].label);
        kj = j;
      }
    });
    const win = S.slice(Math.max(1, kj - 6), kj + 6);
    const rows = win.map((s) => {
      const p = S[S.indexOf(s) - 1];
      return `f${s.k} dt${s.dt.toFixed(0)} body ${s.body.toFixed(1)} (d${(s.body - p.body).toFixed(1)}) label ${s.label.toFixed(1)} (d${(s.label - p.label).toFixed(1)}) scrollX ${s.scroll.toFixed(1)} (d${(s.scroll - p.scroll).toFixed(1)}) view.x ${s.vx.toFixed(1)} w ${s.vw.toFixed(1)} zoom ${s.z.toFixed(3)} screenX ${s.scr.toFixed(1)} tile ${s.tile}${s.tile !== p.tile ? ' <TILE CHANGE' : ''}`;
    });
    const mx = (key) => Math.max(...S.slice(1).map((s, j) => Math.abs(s[key] - S[j][key])));
    console.log(
      `--- ${vp} walker idx ${wi}, frames ${S.length}, first body move at sample ${k0}, biggest label jump at sample ${kj}\n` +
        rows.join('\n'),
    );
    await check(
      'diag',
      `${vp}: walk-start per-frame max delta (first 20 frames after start)`,
      async () => {
        const w = S.slice(Math.max(0, k0 - 1), k0 + 12);
        const d = (key) =>
          Math.max(...w.slice(1).map((s, j) => Math.abs(s[key] - w[j][key]))).toFixed(1);
        expect(w.length > 10, 'few frames');
        return `body ${d('body')} label ${d('label')} scrollX ${d('scroll')} | whole-run max body ${mx('body').toFixed(1)} label ${mx('label').toFixed(1)} scroll ${mx('scroll').toFixed(1)}`;
      },
    );
  }),
);
