// QA slice: natural walk gait (contralateral arms, leg>arm amplitude, knee bend, 2 bobs/cycle, run, idle, Off) + art shots.
// Fast base: runParallel desktop + phone children (one page load each via withCombos), budget 60 s. g0-g4 and g6 sample
// real frames at REAL 600 ms ticks on purpose (g.realTime): the walk/run cycle period (~520/~340 ms) and the per-frame
// stride/bob shape at real tick pacing are what they measure. g5 (idle) and the chop shots use synthetic frames
// (g.synth), g8 drives the animator by hand, the walk shots run at fast ticks. WebGL only: every assertion reads rig
// rotations (renderer-independent); the shots are for a human eye. SHOTS_DIR for the screenshots.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/gait-shots';
const DEG = 180 / Math.PI;
const SAMPLER = `(() => {
  const H = window.__idleRpg, S = (window.__S = { rows: [], on: false });
  const pv = () => H.scene().playerView;
  const rig = () => pv().container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const nm = (r, n) => r.list.find((o) => o.name === n);
  S.sample = (t) => {
    const r = rig(), p = pv().container, uf = nm(r, 'armFrontUpper'), ub = nm(r, 'armBackUpper');
    const th = (c) => c.list.find((o) => o.type === 'Container');
    return { t, x: p.x, y: p.y, tb: r.list[0].rotation, tf: r.list[1].rotation,
      sb: th(r.list[0]).rotation, sf: th(r.list[1]).rotation, ub: ub.rotation, uf: uf.rotation,
      fb: nm(ub, 'armBackFore').rotation, ff: nm(uf, 'armFrontFore').rotation, bob: r.y };
  };
  /** Synthetic frames: step the frozen game to each offset (ms after freeze) and sample the rig after each frame. */
  S.synthRows = (offsets) => offsets.map((o) => { window.__e.synth.stepTo(o); return S.sample(o); });
  const loop = () => {
    if (S.on) S.rows.push(S.sample(performance.now()));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  S.go = () => { S.rows = []; S.on = true; }; S.stop = () => { S.on = false; return S.rows; };
  S.lane = async (dx, dy, K) => {
    const w = await import('/src/features/world/index.ts'); const grid = w.createWorldCollisionGrid();
    const p = H.store.getState().game.movement.position;
    for (let r = 0; r <= 30; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      let ok = true; const s = { x: p.x + ox, y: p.y + oy };
      for (let i = 0; i <= K && ok; i++) {
        const a = { x: s.x + dx * i, y: s.y + dy * i };
        ok = grid.isWalkable(a.x, a.y) && (i === 0 || (grid.isWalkable(a.x - dx, a.y) && grid.isWalkable(a.x, a.y - dy)));
      }
      if (ok) return { start: s, end: { x: s.x + dx * K, y: s.y + dy * K } };
    }
    return null;
  };
  S.player = () => { const c = pv().container; return window.__e.toClient(c.x, c.y); };
})()`;

const min = (a) => Math.min(...a);
const max = (a) => Math.max(...a);
const p2p = (a) => max(a) - min(a);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const corr = (a, b) => {
  const ma = mean(a),
    mb = mean(b);
  let n = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * db);
};
const f = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Moving frames only, trimmed 600 ms at each end of the walk. */
function movingWindow(rows) {
  const mv = rows.map(
    (r, i) =>
      i > 0 && (Math.abs(r.x - rows[i - 1].x) > 1e-6 || Math.abs(r.y - rows[i - 1].y) > 1e-6),
  );
  const first = mv.indexOf(true);
  const last = mv.lastIndexOf(true);
  expect(first >= 0, 'player never moved');
  const t0 = rows[first].t + 600;
  const t1 = rows[last].t - 600;
  return rows.filter((r) => r.t >= t0 && r.t <= t1);
}
/** Analyse the front thigh: cycle period (ms) from upward mean-crossings, and bob peaks per cycle. */
function cycles(w) {
  const m = mean(w.map((r) => r.tf));
  const ups = [];
  for (let i = 1; i < w.length; i++) if (w[i - 1].tf < m && w[i].tf >= m) ups.push(i);
  const period = median(ups.slice(1).map((v, i) => w[v].t - w[ups[i]].t));
  const bobs = w.map((r) => r.bob);
  const thr = 0.3 * p2p(bobs);
  const lo = min(bobs);
  // local maxima of rig.y (lowest body position) with hysteresis
  const peaks = [];
  let rising = true;
  let ext = bobs[0];
  let extI = 0;
  for (let i = 1; i < bobs.length; i++) {
    if (rising) {
      if (bobs[i] > ext) [ext, extI] = [bobs[i], i];
      else if (ext - bobs[i] > thr) {
        peaks.push(extI);
        rising = false;
        ext = bobs[i];
      }
    } else if (bobs[i] < ext) ext = bobs[i];
    else if (bobs[i] - ext > thr) {
      rising = true;
      ext = bobs[i];
      extI = i;
    }
  }
  const perCycle = [];
  for (let c = 1; c < ups.length; c++)
    perCycle.push(peaks.filter((p) => p >= ups[c - 1] && p < ups[c]).length);
  return { period, ups: ups.length, perCycle, lo, peaks: peaks.length };
}

const PORT = 9131; // C3 block 9101-9150 (children 9131, 9132)
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.eval(SAMPLER);
  const setAnim = (m) =>
    g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { animations: '${m}' } })`);
  const walk = async (dx, dy, K, { run = false, shot = null } = {}) => {
    const lane = await g.eval(`window.__S.lane(${dx}, ${dy}, ${K})`);
    expect(lane, `no ${K}-tile lane for ${dx},${dy}`);
    await g.teleportSettled(lane.start.x, lane.start.y); // camera settled = idle frames before the walk (was 1.7 s of sleeps)
    await g.setMovement(`running: ${run}, runEnergy: 10000`);
    await g.eval('window.__S.go()');
    await g.walkTo(lane.end.x, lane.end.y);
    if (shot) {
      // Mid-stride: 2+ tiles along the lane (was a fixed 2.3 s sleep).
      await g.waitState(
        'movement.position',
        `p => Math.max(Math.abs(p.x - ${lane.start.x}), Math.abs(p.y - ${lane.start.y})) >= 2`,
        { timeoutMs: 10000, label: 'mid-stride' },
      );
      await clip(g, shot);
    }
    await g.waitState('movement.position', `p => p.x === ${lane.end.x} && p.y === ${lane.end.y}`, {
      timeoutMs: 20000,
      label: 'arrive',
    });
    // Two more animation frames so the arrival frame is recorded (was a fixed 200 ms sleep).
    await g.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    return g.eval('window.__S.stop()');
  };
  await g.realTime(async () => {
    await setAnim('on');
    let walkRows;
    let wData;
    await check('g0', 'walk 10 tiles at 600 ms ticks (data for g1-g3)', async () => {
      // Side-on (tile +1,-1 faces e): the stride and knee bend only show as an arc there; on the diagonals and facing
      // s/n they are foreshortened on purpose (see g8).
      walkRows = await walk(1, -1, 10);
      wData = movingWindow(walkRows);
      expect(wData.length > 90, `only ${wData.length} moving frames`);
      return `${walkRows.length} frames, ${wData.length} moving`;
    });
    await check(
      'g1',
      'contralateral: arm shoulder anti-correlated with same-side thigh',
      async () => {
        const cf = corr(
          wData.map((r) => r.uf),
          wData.map((r) => r.tf),
        );
        const cb = corr(
          wData.map((r) => r.ub),
          wData.map((r) => r.tb),
        );
        expect(cf < -0.5 && cb < -0.5, `corr front ${f(cf)}, back ${f(cb)} (want < -0.5)`);
        return `corr front arm/thigh ${f(cf)}, back ${f(cb)}`;
      },
    );
    await check('g2', 'leg amplitude > arm amplitude', async () => {
      const tp = p2p(wData.map((r) => r.tf)) * DEG;
      const ap = p2p(wData.map((r) => r.uf)) * DEG;
      expect(tp > ap && ap > 1, `thigh p2p ${f(tp)} deg vs upper arm ${f(ap)} deg`);
      return `thigh p2p ${f(tp)} deg > upper arm p2p ${f(ap)} deg`;
    });
    await check('g3', 'knee bends in swing, ~0 at contact; 2 bob minima per cycle', async () => {
      const mx = max(wData.map((r) => Math.abs(r.sf)));
      expect(mx * DEG > 15, `max knee ${f(mx * DEG)} deg`);
      const tp = max(wData.map((r) => Math.abs(r.tf)));
      let swing = 0,
        swingBent = 0,
        stance = 0,
        stanceStraight = 0,
        contact = [];
      for (let i = 3; i < wData.length - 3; i++) {
        const dr = wData[i + 3].tf - wData[i - 3].tf; // rotation decreasing = leg swinging forward
        const bent = Math.abs(wData[i].sf) > 0.0175;
        if (Math.abs(dr) > 0.004) {
          if (dr < 0) {
            swing++;
            if (bent) swingBent++;
          } else {
            stance++;
            if (!bent) stanceStraight++;
          }
        }
        if (Math.abs(wData[i].tf) >= 0.98 * tp) contact.push(Math.abs(wData[i].sf));
      }
      expect(swingBent / swing > 0.85, `swing frames bent ${swingBent}/${swing}`);
      expect(stanceStraight / stance > 0.95, `stance frames straight ${stanceStraight}/${stance}`);
      expect(
        contact.length > 5 && max(contact) < 0.3 * mx,
        `contact knee max ${f(max(contact) * DEG)} deg vs peak ${f(mx * DEG)}`,
      );
      const c = cycles(wData);
      const good = c.perCycle.filter((n) => n === 2).length;
      expect(
        c.perCycle.length >= 5 && good / c.perCycle.length >= 0.8,
        `bob peaks per cycle ${JSON.stringify(c.perCycle)}`,
      );
      return `knee max ${f(mx * DEG)} deg, swing bent ${swingBent}/${swing}, stance straight ${stanceStraight}/${stance}, contact knee <= ${f(max(contact) * DEG)} deg, bob peaks/cycle ${JSON.stringify(c.perCycle)}`;
    });
    await check('g4', 'run on: shorter cycle + bigger amplitude', async () => {
      const runRows = await walk(1, -1, 10, { run: true });
      const rd = movingWindow(runRows);
      const wc = cycles(wData);
      const rc = cycles(rd);
      const wt = p2p(wData.map((r) => r.tf)) * DEG;
      const rt = p2p(rd.map((r) => r.tf)) * DEG;
      expect(Math.abs(wc.period - 520) < 80, `walk period ${f(wc.period, 0)} ms (want ~520)`);
      expect(Math.abs(rc.period - 340) < 60, `run period ${f(rc.period, 0)} ms (want ~340)`);
      expect(rt > wt * 1.2, `run thigh p2p ${f(rt)} vs walk ${f(wt)}`);
      return `period walk ${f(wc.period, 0)} ms, run ${f(rc.period, 0)} ms; thigh p2p walk ${f(wt)} deg, run ${f(rt)} deg`;
    });
    await g.setMovement('running: false');
  });
  // Synthetic frames from here on where time matters: no wall-clock sampling.
  await check('g5', 'idle: no limb swing', async () => {
    // The render trail interpolates on wall-clock frames: wait (real frames) until the player VIEW has stopped on its
    // tile, so the animator is told 'idle'. Then freeze, step 1200 ms of frames (walk -> idle blend settles) and sample
    // 1500 ms of 30 ms frames (was 1.2 s + 1.5 s of wall-clock sleeps/rAF sampling).
    await g.waitIdle();
    await waitStill(
      () =>
        g.eval(
          '(() => { const c = window.__idleRpg.scene().playerView.container; return { x: c.x, y: c.y }; })()',
        ),
      {
        intervalMs: 80,
        stable: 3,
      },
    );
    await g.synth.freeze();
    await g.eval(
      `window.__S.synthRows(${JSON.stringify(Array.from({ length: 40 }, (_, i) => (i + 1) * 30))})`,
    );
    const rows = await g.eval(
      `window.__S.synthRows(${JSON.stringify(Array.from({ length: 50 }, (_, i) => 1200 + (i + 1) * 30))})`,
    );
    await g.synth.thaw();
    const keys = ['tf', 'tb', 'sf', 'sb', 'uf', 'ub', 'ff', 'fb'];
    const worst = Math.max(...keys.map((k) => p2p(rows.map((r) => r[k])))) * DEG;
    expect(worst < 0.5, `idle limb range ${f(worst)} deg`);
    return `${rows.length} frames, max limb p2p ${f(worst, 3)} deg`;
  });
  await g.realTime(async () => {
    // Same real-tick moving window as g0 (> 40 moving frames after trimming 600 ms at each end).
    await check('g6', 'Animations Off: walking is still', async () => {
      await setAnim('off');
      const rows = movingWindow(await walk(1, -1, 6));
      const keys = ['tf', 'tb', 'sf', 'sb', 'uf', 'ub', 'ff', 'fb', 'bob'];
      const worst = Math.max(...keys.map((k) => p2p(rows.map((r) => r[k])))) * DEG;
      await setAnim('on');
      expect(rows.length > 40 && worst < 0.5, `${rows.length} frames, limb range ${f(worst)} deg`);
      return `${rows.length} moving frames, max limb p2p ${f(worst, 3)} deg`;
    });
  });
  // Swing axis (user 2026-10-08): limbs swing along the FACING, never across it. Drive the real animator per facing.
  await check(
    'g8',
    'limbs swing along the facing: arc side-on, none sideways facing s/n, arm in sync with opposite leg',
    async () => {
      const out = await g.eval(`(() => {
          const sc = window.__idleRpg.scene(), a = sc.animator, pv = sc.playerView;
          const orig = { s: a.setState, u: a.update };
          const rig = pv.container.list.find((o) => o.type === 'Container' && o.list.length === 4);
          const nm = (r, n) => r.list.find((o) => o.name === n);
          const res = {};
          try {
            for (const facing of ['e', 's', 'n', 'se']) {
              orig.s.call(a, 'walk', { facing, running: false });
              const rows = [];
              for (let t = 0; t < 520; t += 10) {
                orig.u.call(a, 1e6 + t);
                rows.push({ af: nm(rig, 'armFrontUpper').rotation, tb: rig.list[0].rotation, tf: rig.list[1].rotation });
              }
              const p2p = (k) => Math.max(...rows.map((r) => r[k])) - Math.min(...rows.map((r) => r[k]));
              const mean = (k) => rows.reduce((x, r) => x + r[k], 0) / rows.length;
              const ma = mean('af'), mt = mean('tb');
              let num = 0, da = 0, dt = 0;
              for (const r of rows) { num += (r.af - ma) * (r.tb - mt); da += (r.af - ma) ** 2; dt += (r.tb - mt) ** 2; }
              res[facing] = { arm: p2p('af'), leg: p2p('tf'), corr: dt > 1e-12 && da > 1e-12 ? num / Math.sqrt(da * dt) : null };
            }
          } finally {
            orig.s.call(a, 'idle', { facing: 'se' });
          }
          return res;
        })()`);
      const d = (r) => f(r * DEG);
      expect(
        out.e.arm * DEG > 15 && out.e.leg * DEG > 30,
        `side-on arc too small: ${JSON.stringify(out.e)}`,
      );
      for (const k of ['s', 'n'])
        expect(
          out[k].arm * DEG < 3 && out[k].leg * DEG < 3,
          `facing ${k} swings sideways: arm ${d(out[k].arm)} deg, leg ${d(out[k].leg)} deg`,
        );
      expect(out.e.corr > 0.95, `front arm not in sync with the back leg (corr ${out.e.corr})`);
      expect(
        out.se.corr > 0.9,
        `se: front arm not in sync with the back leg (corr ${out.se.corr})`,
      );
      return `arc e arm ${d(out.e.arm)} / leg ${d(out.e.leg)} deg; s arm ${d(out.s.arm)} / leg ${d(out.s.leg)}; n arm ${d(out.n.arm)} / leg ${d(out.n.leg)}; arm~back-leg corr e ${f(out.e.corr, 3)}, se ${f(out.se.corr, 3)}`;
    },
  );
  // Art shots: mid-stride front / side / back (150 ms ticks: a clean mid-walk moment, 6 tiles in ~1 s), then chopping.
  await g.setTickMs(150);
  for (const [name, dx, dy] of [
    ['front', 0, 1],
    ['side', 1, -1],
    ['back', 0, -1],
  ])
    await check(`g7-${name}`, `screenshot mid-stride ${name}`, async () => {
      await walk(dx, dy, 6, { shot: `${vp}-walk-${name}` });
      return `${SHOTS}/${vp}-walk-${name}.png`;
    });
  await check('g7-chop', 'screenshot while chopping (axe in hand)', async () => {
    const tree = await g.targetOfKind('tree');
    await g.teleportSettled(tree.x, tree.y + 2);
    await g.store(`s.interactTree(${JSON.stringify(tree.id)})`);
    await g.waitFor(() => g.state('gathering.session !== null'), { label: 'chop session' });
    await g.eval('window.__S.go()');
    await g.waitFor(
      async () => {
        const r = await g.eval('window.__S.rows.at(-1)');
        return r && Math.abs(r.uf) > 1.0;
      },
      { timeoutMs: 8000, label: 'mid swing' },
    );
    await g.eval('window.__S.stop()');
    // Six frames 180 ms apart on synthetic time (one screenshot per chosen frame; was a sleep loop).
    const p = await g.eval('window.__S.player()');
    const shots = await g.synth.frames([0, 180, 360, 540, 720, 900], {
      name: `${vp}-chop`,
      clip: {
        x: Math.max(0, p.x - 55),
        y: Math.max(0, p.y - 100),
        width: 110,
        height: 140,
        scale: 3,
      },
      keep: true,
    });
    await g.synth.thaw();
    mkdirSync(SHOTS, { recursive: true });
    shots.forEach((s, i) =>
      writeFileSync(resolve(SHOTS, `${vp}-chop${i}.png`), Buffer.from(s.b64, 'base64')),
    );
    // No byte-diff assertion: other things in the clip (tree sway) change too, so it would not prove the axe moves
    // (mutant M3 'chop pose frozen' stayed green with one). These shots are for a human eye only, as before.
    return `${SHOTS}/${vp}-chop0..5.png`;
  });
});

/** Screenshot clip around the player, 4x zoom. */
async function clip(g, name) {
  const p = await g.eval('window.__S.player()');
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, p.x - 55),
      y: Math.max(0, p.y - 100),
      width: 110,
      height: 140,
      scale: 3,
    },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}
