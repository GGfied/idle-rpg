// QA anim-b: WALK/RUN limb swing runs along the facing in all 8 facings (runbook big-world items 15/16).
// Measures hand/foot END POINTS in screen space against the real travel direction: forward travel >> lateral travel,
// no limb end crosses the body midline, arm ~ opposite leg.
// FAST BASE: walk and run, desktop and phone = 4 parallel runParallel children (withCombos: one page load each), waits
// on state (camera settled, player moved, drawn player still) instead of sleeps, budget 60 s.
// Run: node tests/e2e/gaitB.e2e.mjs (base port 9576; E2E_PORT overrides)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { VIEWPORTS, check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const SHOTS = process.env.SHOTS_DIR ?? resolve(process.cwd(), 'tests/e2e/.shots-animB');
// The walk and run halves are independent (own lanes, own checks): each viewport runs them as two parallel children.
VIEWPORTS.desktopRun = { ...VIEWPORTS.desktop };
VIEWPORTS.phoneRun = { ...VIEWPORTS.phone };
const PORT = 9576;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'desktopRun', 'phone', 'phoneRun'],
  budgetMs: BUDGET_MS,
});
const SAMPLER = `(() => {
  const H = window.__idleRpg, S = (window.__S = { rows: [], on: false });
  const pv = () => H.scene().playerView;
  const rig = () => pv().container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const nm = (r, n) => r.list.find((o) => o.name === n);
  const th = (c) => c.list.find((o) => o.type === 'Container');
  const pt = (c, y) => { const m = c.getWorldTransformMatrix(); return [m.tx, m.ty, m.getX(0, y), m.getY(0, y)]; };
  const loop = () => {
    if (S.on) {
      const r = rig(), p = pv().container, rm = r.getWorldTransformMatrix();
      const uf = nm(r, 'armFrontUpper'), ub = nm(r, 'armBackUpper');
      S.rows.push({ t: performance.now(), x: p.x, y: p.y, o: [rm.tx, rm.ty],
        arf: pt(nm(uf, 'armFrontFore'), 6), arb: pt(nm(ub, 'armBackFore'), 6),
        lgf: pt(th(r.list[1]), 6), lgb: pt(th(r.list[0]), 6) });
    }
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

// 200 ms ticks, not real time: the gait cycle is wall-clock (WALK_CYCLE_MS 520, RUN_CYCLE_MS 340) and every number is a
// limb end relative to its body pivot, so travel speed does not change what is measured, only how long a lane takes.
// Lanes are long enough that the steady window (moving, minus one tick each end) still holds > 2 full cycles:
// walk 8 tiles = 8 ticks -> 1.2 s (2.3 walk cycles); run 12 tiles = 6 ticks -> 0.8 s (2.4 run cycles).
const TICK = 200;
const LANE_TILES = { walk: 8, run: 12 };
const LANES = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1], // tile axes = screen diagonals (se, sw, nw, ne)
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1], // tile diagonals = screen s / n / e / w
];
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const p2p = (a) => Math.max(...a) - Math.min(...a);
const f = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
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
function movingWindow(rows) {
  const mv = rows.map(
    (r, i) =>
      i > 0 && (Math.abs(r.x - rows[i - 1].x) > 1e-6 || Math.abs(r.y - rows[i - 1].y) > 1e-6),
  );
  const first = mv.indexOf(true),
    last = mv.lastIndexOf(true);
  expect(first >= 0, 'player never moved');
  return rows.filter((r) => r.t >= rows[first].t + TICK && r.t <= rows[last].t - TICK);
}
const compass = (dx, dy) =>
  ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][
    ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
  ];

/** Per-limb screen-space numbers against the real travel direction. */
function analyse(w) {
  const a = w[0],
    b = w.at(-1);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = [(b.x - a.x) / len, (b.y - a.y) / len],
    pp = [-d[1], d[0]];
  const dot = (v, u) => v[0] * u[0] + v[1] * u[1];
  const out = { facing: compass(d[0], d[1]), n: w.length };
  for (const k of ['arf', 'arb', 'lgf', 'lgb']) {
    const fwd = [],
      lat = [],
      abs = [];
    for (const r of w) {
      const L = r[k],
        piv = [L[0] - r.o[0], L[1] - r.o[1]];
      const rel = [L[2] - L[0], L[3] - L[1]],
        end = [L[2] - r.o[0], L[3] - r.o[1]];
      fwd.push(dot(rel, d));
      lat.push(dot(rel, pp));
      abs.push([end[0], piv[0]]);
    }
    const side = Math.sign(mean(abs.map((v) => v[1])));
    out[k] = {
      fwd: p2p(fwd),
      lat: p2p(lat),
      cross: Math.max(0, ...abs.map((v) => -side * v[0])),
      fwdS: fwd,
    };
  }
  return out;
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS, tickMs: TICK }, COMBOS, async (g, combo) => {
  const vp = combo.replace(/Run$/, '');
  const modes = combo.endsWith('Run') ? [true] : [false];
  await g.eval(SAMPLER);
  const drawn = () =>
    g.eval(
      `(() => { const c = window.__idleRpg.scene().playerView.container; return { x: c.x, y: c.y }; })()`,
    );
  const walk = async (dx, dy, K, run, shot) => {
    const lane = await g.eval(`window.__S.lane(${dx}, ${dy}, ${K})`);
    expect(lane, `no lane ${dx},${dy}`);
    // teleport, then wait for the camera and the drawn player to come to rest (was a fixed 400-900 ms)
    await g.teleportSettled(lane.start.x, lane.start.y);
    await g.setMovement(`running: ${run}, runEnergy: 10000`);
    await waitStill(drawn, { intervalMs: 60, stable: 2 });
    await g.eval('window.__S.go()');
    await g.walkTo(lane.end.x, lane.end.y);
    if (shot) {
      // mid-stride: 3 tiles into the lane (was a fixed 2 s / 700 ms)
      await g.waitState(
        'movement.position',
        `p => Math.max(Math.abs(p.x - ${lane.start.x}), Math.abs(p.y - ${lane.start.y})) >= 3`,
        { label: 'mid-lane' },
      );
      await clip(g, shot);
    }
    await g.waitFor(
      async () => {
        const p = await g.state('movement.position');
        return p.x === lane.end.x && p.y === lane.end.y;
      },
      { timeoutMs: 25000, label: 'arrive' },
    );
    // the drawn player trails the tile by a tick: sample until it has stopped (was a fixed 150 ms)
    await waitStill(drawn, { intervalMs: 60, stable: 2 });
    return analyse(movingWindow(await g.eval('window.__S.stop()')));
  };
  {
    for (const run of modes) {
      const res = [];
      for (const [dx, dy] of LANES) {
        const shot =
          !run && dx === 1 && dy === 0
            ? `${vp}-walk-se`
            : run && dx === -1 && dy === -1
              ? `${vp}-run-n`
              : null;
        res.push(await walk(dx, dy, run ? LANE_TILES.run : LANE_TILES.walk, run, shot));
      }
      const m = run ? 'run' : 'walk';
      const K4 = ['arf', 'arb', 'lgf', 'lgb'];
      const table = res
        .map(
          (r) =>
            `${r.facing} ` +
            K4.map((k) => `${k} ${f(r[k].fwd, 1)}/${f(r[k].lat, 1)}/x${f(r[k].cross, 1)}`).join(
              ' ',
            ),
        )
        .join(' | ');
      const by = Object.fromEntries(res.map((r) => [r.facing, r]));
      await check(
        `${m}-axis`,
        `${m}: side-on leg fwd >= 8 px, arm fwd >= max(3, 0.4*leg) px; diagonals lateral <= 3 px; s/n lateral <= 1 px; all fwd > 0.5 px`,
        async () => {
          expect(Object.keys(by).length === 8, `facings seen ${Object.keys(by)}`);
          const bad = [];
          for (const k of K4) {
            for (const fc of ['e', 'w']) {
              const legFwd = Math.max(by[fc].lgf.fwd, by[fc].lgb.fwd);
              if (k.startsWith('lg')) {
                if (by[fc][k].fwd < 8) bad.push(`${fc}:${k} fwd ${f(by[fc][k].fwd)}`);
              } else if (by[fc][k].fwd < Math.max(3, 0.4 * legFwd))
                bad.push(`${fc}:${k} fwd ${f(by[fc][k].fwd)} < max(3, 0.4*leg ${f(legFwd)})`);
            }
            for (const fc of ['se', 'sw', 'ne', 'nw'])
              if (by[fc][k].lat > 3) bad.push(`${fc}:${k} lat ${f(by[fc][k].lat)}`);
            for (const fc of ['s', 'n'])
              if (by[fc][k].lat > 1) bad.push(`${fc}:${k} lat ${f(by[fc][k].lat)}`);
            for (const fc of ['s', 'n', 'se', 'sw', 'ne', 'nw'])
              if (!(by[fc][k].fwd > 0.5))
                bad.push(`${fc}:${k} no forward swing ${f(by[fc][k].fwd)}`);
          }
          expect(bad.length === 0, bad.join('; ') + ' || ' + table);
          return 'fwd/lat/cross px: ' + table;
        },
      );
      await check(
        `${m}-midline`,
        `${m}: on diagonals no hand/foot crosses the vertical body midline (> 0.5 px)`,
        async () => {
          const bad = [];
          for (const fc of ['se', 'sw', 'ne', 'nw'])
            for (const k of K4)
              if (by[fc][k].cross > 0.5) bad.push(`${fc}:${k} ${f(by[fc][k].cross)}px`);
          expect(bad.length === 0, bad.join('; '));
          return (
            'diagonal max cross ' +
            f(
              Math.max(...['se', 'sw', 'ne', 'nw'].flatMap((fc) => K4.map((k) => by[fc][k].cross))),
            ) +
            ' px'
          );
        },
      );
      await check(
        `${m}-sync`,
        `${m}: arm forward with the OPPOSITE leg, not the same-side leg`,
        async () => {
          const [lo, hi] = run ? [0.2, -0.1] : [0.7, -0.7];
          const bad = [],
            ev = [];
          for (const r of res) {
            const opp = corr(r.arf.fwdS, r.lgb.fwdS),
              same = corr(r.arf.fwdS, r.lgf.fwdS),
              opp2 = corr(r.arb.fwdS, r.lgf.fwdS);
            ev.push(`${r.facing} ${f(opp)}/${f(same)}/${f(opp2)}`);
            if (!(opp > lo && opp2 > lo && same < hi))
              bad.push(`${r.facing} opp ${f(opp)} same ${f(same)} opp2 ${f(opp2)}`);
          }
          process.stdout.write(`CORR ${vp} ${m} (arf~lgb/arf~lgf/arb~lgf): ${ev.join(' | ')}\n`);
          expect(bad.length === 0, bad.join('; '));
          return ev.join(' | ');
        },
      );
      if (run)
        await check(
          'run-arms-ns',
          'run facing n/s: arm ~ opposite leg corr >= 0.7 (both arms), n hand swing >= 4 client px',
          async () => {
            const bad = [],
              ev = [];
            for (const fc of ['n', 's']) {
              const r = by[fc],
                c1 = corr(r.arf.fwdS, r.lgb.fwdS),
                c2 = corr(r.arb.fwdS, r.lgf.fwdS);
              ev.push(
                `${fc} corr ${f(c1)}/${f(c2)} hand swing ${f(r.arf.fwd, 1)}/${f(r.arb.fwd, 1)} px`,
              );
              if (!(c1 >= 0.7 && c2 >= 0.7)) bad.push(`${fc} corr ${f(c1)}/${f(c2)} < 0.7`);
              if (fc === 'n' && !(Math.max(r.arf.fwd, r.arb.fwd) >= 4))
                bad.push(`n hand swing ${f(r.arf.fwd)}/${f(r.arb.fwd)} < 4 px`);
            }
            expect(bad.length === 0, bad.join('; ') + ' || ' + ev.join(' | '));
            return ev.join(' | ');
          },
        );
    }
    await g.setMovement('running: false');
    await check('console-' + vp, 'no console errors', async () => {
      const e = g.consoleErrors();
      expect(e.length === 0, e.join(' | '));
      return '0 errors';
    });
    if (!modes[0])
      await check(
        'shot-se',
        'close-up screenshot mid-stride facing se',
        async () => `${SHOTS}/${vp}-walk-se.png`,
      );
  }
});

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
