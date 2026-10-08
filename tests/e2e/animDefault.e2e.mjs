// QA slice B2(c): Animations/Effects default On and are never auto-set to Reduced by the browser (reduced-motion emulated ON).
// 1 fresh storage -> Settings On/On + full walk swing; 2 seeded prefs v1 'reduced' -> migrated to On; 3 explicit Reduced survives reload.
// Real Brave: CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser". Desktop + phone parallel children.
import process from 'node:process';
import { check, expect, runParallel, withCombos } from './lib.mjs';

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
const KEYS = ['tf', 'tb', 'uf', 'ub'];
const PORT = Number(process.env.E2E_PORT ?? 9391);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const emu = await g.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  expect(emu === true, 'reduced-motion emulation did not take');
  /** Reload keeping storage (g.load() would wipe it), wait for the game, re-install the sampler. */
  const reload = async () => {
    await g.eval('window.__preReload = 1');
    await g.cdp.send('Page.reload', {});
    await g.waitFor(
      () => g.eval(`window.__preReload === undefined && window.__e?.ready?.() === true`),
      {
        label: 'game ready after reload',
      },
    );
    await g.settle();
    await g.eval(SAMPLER);
  };
  const prefs = () => g.eval(`JSON.stringify(window.__idleRpg.store.getState().prefs.visuals)`);
  /** Radio state read from the real Settings panel (opens + closes it with taps). */
  const panel = async () => {
    await g.tapSelector('button[aria-label="Settings"]');
    await g.waitFor(() => g.eval(`!!document.querySelector('.settings')`), {
      label: 'settings open',
    });
    const r = await g.eval(`Object.fromEntries(['Effects', 'Animations'].map((n) => {
      const grp = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === n);
      return [n, grp ? [...grp.querySelectorAll('button[role=radio]')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent).join('|') : 'MISSING'];
    }))`);
    return r;
  };
  const closePanel = async () => {
    await g.tapSelector('button[aria-label="Close settings"]');
    await g.waitFor(() => g.eval(`!document.querySelector('.settings')`), {
      label: 'settings closed',
    });
    await g.settle();
  };
  const pick = async (label) => {
    const r = await g.eval(`(() => {
      const grp = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Animations');
      const b = [...grp.querySelectorAll('button[role=radio]')].find((x) => x.textContent === ${JSON.stringify(label)});
      b.scrollIntoView({ block: 'center' });
      const q = b.getBoundingClientRect();
      return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    })()`);
    await g.tap(r.x, r.y);
  };
  const walkRange = async () => {
    let rows;
    await g.realTime(async () => {
      const lane = await g.eval(`window.__S.lane(1, -1, 10)`);
      expect(lane, 'no lane');
      await g.teleportSettled(lane.start.x, lane.start.y);
      await g.setMovement(`running: false, runEnergy: 10000`);
      await g.eval('window.__S.go()');
      await g.walkTo(lane.end.x, lane.end.y);
      await g.waitState(
        'movement.position',
        `p => p.x === ${lane.end.x} && p.y === ${lane.end.y}`,
        {
          timeoutMs: 20000,
          label: 'arrive',
        },
      );
      await g.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const all = await g.eval('window.__S.stop()');
      const mv = all.map(
        (r, i) =>
          i > 0 && (Math.abs(r.x - all[i - 1].x) > 1e-6 || Math.abs(r.y - all[i - 1].y) > 1e-6),
      );
      const t0 = all[mv.indexOf(true)].t + 600,
        t1 = all[mv.lastIndexOf(true)].t - 600;
      rows = all.filter((r) => r.t >= t0 && r.t <= t1);
    });
    expect(rows.length > 60, `only ${rows.length} moving frames`);
    return Math.max(...KEYS.map((k) => p2p(rows.map((r) => r[k])) * DEG));
  };
  let onRange = 0;
  await g.eval(SAMPLER);
  await check(
    'c1',
    'fresh storage + reduced-motion ON: Settings Animations/Effects On, full walk swing',
    async () => {
      const store = await prefs();
      const ui = await panel();
      await closePanel();
      expect(store === '{"vfx":"on","animations":"on"}', `store visuals ${store}`);
      expect(ui.Animations === 'On' && ui.Effects === 'On', `Settings shows ${JSON.stringify(ui)}`);
      onRange = await walkRange();
      expect(onRange > 15, `walk swing only ${f(onRange)} deg (On expected well above reduced)`);
      return `${vp}: store ${store}, UI ${JSON.stringify(ui)}, emulated reduce=${emu}, walk max limb p2p ${f(onRange)} deg`;
    },
  );
  await check(
    'c2',
    'prefs v1 animations/vfx reduced seeded -> after reload shows On (migration)',
    async () => {
      const seeded = await g.eval(
        `(() => { localStorage.setItem('prefs', JSON.stringify({ version: 1, prefs: { visuals: { vfx: 'reduced', animations: 'reduced' } } })); return localStorage.getItem('prefs'); })()`,
      );
      await reload();
      const store = await prefs();
      const ui = await panel();
      await closePanel();
      expect(
        store === '{"vfx":"on","animations":"on"}',
        `after migration store ${store} (seeded ${seeded})`,
      );
      expect(ui.Animations === 'On' && ui.Effects === 'On', `Settings shows ${JSON.stringify(ui)}`);
      return `${vp}: seeded ${seeded} -> store ${store}, UI ${JSON.stringify(ui)}`;
    },
  );
  await check(
    'c3',
    'explicit Reduced in Settings survives a reload (and walks at reduced swing)',
    async () => {
      await panel();
      await pick('Reduced');
      const chosen = await prefs();
      await closePanel();
      expect(chosen.includes('"animations":"reduced"'), `pick did not stick: ${chosen}`);
      await reload();
      const store = await prefs();
      const ui = await panel();
      await closePanel();
      expect(store.includes('"animations":"reduced"'), `after reload store ${store}`);
      expect(ui.Animations === 'Reduced', `Settings shows ${JSON.stringify(ui)}`);
      const rr = await walkRange();
      const ratio = rr / onRange;
      expect(
        rr > 3 && ratio > 0.35 && ratio < 0.65,
        `reduced swing ${f(rr)} vs on ${f(onRange)} (ratio ${f(ratio)})`,
      );
      return `${vp}: after reload store ${store}, UI ${JSON.stringify(ui)}, walk ${f(rr)} deg vs on ${f(onRange)} (ratio ${f(ratio)})`;
    },
  );
});
