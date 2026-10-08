// QA slice B1-qa: Animations On / Reduced / Off, set through the REAL Settings panel (taps), walking leg/arm range.
// On = full range, Reduced = about half (REDUCED_WALK_SCALE 0.5, clearly > 0), Off = 0; idle breathing 0 in Reduced + Off.
// Desktop + phone as parallel children (runParallel). Walk samples run at real 600 ms ticks (g.realTime) = what a player sees.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const SHOTS = process.env.SHOTS_DIR ?? resolve(process.cwd(), 'tests/e2e/.shots-animReduced');
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

const p2p = (a) => Math.max(...a) - Math.min(...a);
const f = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const KEYS = ['tf', 'tb', 'sf', 'sb', 'uf', 'ub', 'ff', 'fb'];

const PORT = Number(process.env.E2E_PORT ?? 9371);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.eval(SAMPLER);
  const LABEL = { on: 'On', reduced: 'Reduced', off: 'Off' };
  /** Real taps: gear -> radio in the "Animations" group -> close button. Returns the stored pref. */
  const setAnim = async (m) => {
    await g.tapSelector('button[aria-label="Settings"]');
    await g.waitFor(() => g.eval(`!!document.querySelector('.settings')`), {
      label: 'settings open',
    });
    const r = await g.eval(`(() => {
      const grp = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Animations');
      const b = [...grp.querySelectorAll('button[role=radio]')].find((x) => x.textContent === ${JSON.stringify(LABEL[m])});
      b.scrollIntoView({ block: 'center' });
      const q = b.getBoundingClientRect();
      return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    })()`);
    await g.tap(r.x, r.y);
    const pref = await g.eval(`window.__idleRpg.store.getState().prefs.visuals.animations`);
    await g.tapSelector('button[aria-label="Close settings"]');
    await g.waitFor(() => g.eval(`!document.querySelector('.settings')`), {
      label: 'settings closed',
    });
    await g.settle();
    return pref;
  };
  const walk = async (dx, dy, K, { shot = null, trim = 600 } = {}) => {
    const lane = await g.eval(`window.__S.lane(${dx}, ${dy}, ${K})`);
    expect(lane, `no ${K}-tile lane`);
    await g.teleportSettled(lane.start.x, lane.start.y);
    await g.setMovement(`running: false, runEnergy: 10000`);
    await g.eval('window.__S.go()');
    await g.walkTo(lane.end.x, lane.end.y);
    if (shot) {
      await g.waitState(
        'movement.position',
        `p => Math.max(Math.abs(p.x - ${lane.start.x}), Math.abs(p.y - ${lane.start.y})) >= 2`,
        { timeoutMs: 10000, label: 'mid-stride' },
      );
      await shot();
    }
    await g.waitState('movement.position', `p => p.x === ${lane.end.x} && p.y === ${lane.end.y}`, {
      timeoutMs: 20000,
      label: 'arrive',
    });
    await g.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const rows = await g.eval('window.__S.stop()');
    const mv = rows.map(
      (r, i) =>
        i > 0 && (Math.abs(r.x - rows[i - 1].x) > 1e-6 || Math.abs(r.y - rows[i - 1].y) > 1e-6),
    );
    const a = mv.indexOf(true),
      b = mv.lastIndexOf(true);
    // trim 600 ms at each end (start-up/stop blend)
    const t0 = rows[a].t + trim,
      t1 = rows[b].t - trim;
    return rows.filter((r) => r.t >= t0 && r.t <= t1);
  };
  const range = (rows) =>
    Object.fromEntries(KEYS.map((k) => [k, p2p(rows.map((r) => r[k])) * DEG]));
  const res = {};
  for (const m of ['on', 'reduced', 'off']) {
    await check(`r-${m}`, `Animations ${m} via Settings taps: walk limb range`, async () => {
      const pref = await setAnim(m);
      expect(pref === m, `store pref is ${pref}, expected ${m}`);
      let rows;
      await g.realTime(async () => {
        rows = await walk(1, -1, 10);
      });
      expect(rows.length > 60, `only ${rows.length} moving frames`);
      const rg = range(rows);
      res[m] = {
        rg,
        legs: Math.max(rg.tf, rg.tb),
        arms: Math.max(rg.uf, rg.ub),
        all: Math.max(...Object.values(rg)),
        n: rows.length,
      };
      return `${vp} ${m}: frames ${rows.length}, thigh p2p f/b ${f(rg.tf)}/${f(rg.tb)}, arm p2p f/b ${f(rg.uf)}/${f(rg.ub)} deg, max ${f(res[m].all)}`;
    });
    await check(`b-${m}`, `idle breathing in ${m}`, async () => {
      await g.waitIdle();
      await waitStill(
        () =>
          g.eval(
            '(() => { const c = window.__idleRpg.scene().playerView.container; return { x: c.x, y: c.y }; })()',
          ),
        { intervalMs: 80, stable: 3 },
      );
      await g.synth.freeze();
      await g.eval(
        `window.__S.synthRows(${JSON.stringify(Array.from({ length: 30 }, (_, i) => (i + 1) * 60))})`,
      );
      const rows = await g.eval(
        `window.__S.synthRows(${JSON.stringify(Array.from({ length: 50 }, (_, i) => 1800 + (i + 1) * 60))})`,
      );
      await g.synth.thaw();
      const bob = p2p(rows.map((r) => r.bob));
      const limb = Math.max(...KEYS.map((k) => p2p(rows.map((r) => r[k])))) * DEG;
      res[m].bob = bob;
      if (m === 'on') expect(bob > 0.05, `idle breath missing in on: ${bob}`);
      else expect(bob < 1e-6, `idle breathing ${bob} px in ${m}`);
      expect(limb < 0.5, `idle limb range ${limb}`);
      return `${vp} ${m}: idle bob p2p ${f(bob, 4)} px, limb ${f(limb, 3)} deg`;
    });
  }
  await check('ratio', 'reduced is about half of on, clearly > 0; off is 0', async () => {
    const { on, reduced, off } = res;
    const lr = reduced.legs / on.legs,
      ar = reduced.arms / on.arms;
    expect(
      reduced.legs > 5 && reduced.arms > 2,
      `reduced legs ${f(reduced.legs)} arms ${f(reduced.arms)} deg not clearly > 0`,
    );
    expect(
      lr > 0.35 && lr < 0.65 && ar > 0.35 && ar < 0.65,
      `ratio legs ${f(lr)} arms ${f(ar)} not ~0.5`,
    );
    expect(off.all < 0.5, `off range ${f(off.all)} deg`);
    return `${vp}: on legs/arms ${f(on.legs)}/${f(on.arms)}, reduced ${f(reduced.legs)}/${f(reduced.arms)} (ratio ${f(lr)}/${f(ar)}), off ${f(off.all, 3)} deg`;
  });
  await check(
    'shot',
    'screenshot mid-walk in reduced (legs apart, no black/blank/magenta)',
    async () => {
      await setAnim('reduced');
      await g.setTickMs(150);
      const rows = await walk(1, -1, 6, {
        trim: 100,
        shot: async () => {
          mkdirSync(SHOTS, { recursive: true });
          // Freeze on the first frame whose thighs are >= 20 deg apart (widest stride) so the shot shows the legs apart.
          const sp = await g.eval(`new Promise((res) => {
            let n = 0;
            const tick = () => {
              const s = window.__S.sample(0), d = Math.abs(s.tf - s.tb) * ${DEG};
              if (d >= 20 || ++n > 120) { window.__e.synth.freeze(); res(d); } else requestAnimationFrame(tick);
            };
            tick();
          })`);
          const p = await g.eval('window.__S.player()');
          expect(sp >= 20, `never saw thighs 20 deg apart (last ${sp})`);
          await g.screenshot(`${vp}-reduced-full`);
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
          writeFileSync(resolve(SHOTS, `${vp}-reduced-clip.png`), Buffer.from(data, 'base64'));
          await g.synth.thaw();
        },
      });
      const apart = Math.max(...rows.map((r) => Math.abs(r.tf - r.tb))) * DEG;
      expect(apart > 3, `thighs only ${f(apart)} deg apart mid-stride`);
      return `${vp}: thigh spread ${f(apart)} deg; ${SHOTS}/${vp}-reduced-{full,clip}.png`;
    },
  );
});
