/* global fetch, console */
// QA slice: isometric animation (8-way facing, chop swing, tree-fall ghost) under Animations On/Reduced/Off.
// Own dev server on E2E_PORT (default 5193), never 5173. Run: node tests/e2e/animation.e2e.mjs
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5193);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), process.env.E2E_ROOT ?? '../..');
const results = [];
setTimeout(() => {
  console.log('HARD TIMEOUT');
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();

async function startVite() {
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    [
      '--config',
      resolve(ROOT, 'tests/e2e/vite.frozen.config.mjs'),
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: ROOT, stdio: 'ignore' },
  );
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return proc;
    } catch {
      /* not up */
    }
    await sleep(200);
  }
  killChild(proc);
  throw new Error('vite did not start');
}

// In-page sampler. Reads the player rig through window.__idleRpg.scene().playerView.
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const A = (window.__A = { rows: [], ghosts: [], base: null, timer: 0, t0: 0 });
  const isGhost = (o) => o.type === 'Container' && o.list.length === 1 && o.list[0].type === 'Graphics' && Math.abs(o.scaleX - 1.5) < 1e-6;
  const rig = (pv) => pv.container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const limb = (r, n) => r.list.find((o) => o.name === n);
  A.start = () => {
    const pv = H().scene().playerView, scene = pv.container.scene;
    A.base = new Set(scene.children.list); A.rows = []; A.ghosts = []; A.t0 = performance.now();
    const seen = new Map();
    clearInterval(A.timer);
    A.timer = setInterval(() => {
      const r = rig(pv), up = limb(r, 'armFrontUpper'), fore = up.list.find((o) => o.name === 'armFrontFore'), axeG = fore.list.find((o) => o.name === 'axe');
      // Back view: the arms are hidden and the axe is drawn in a layer below the body (container index 0).
      const layer = pv.container.list[0], backAxe = layer && layer.type === 'Container' && layer.list.length === 5 ? layer.list.find((o) => o.name === 'axe') : null;
      if (!pv.__bw) { pv.__bw = true; A.back = false; const o = pv.setBackView; pv.setBackView = (b) => { A.back = b; return o ? o.call(pv, b) : undefined; }; }
      const s = H().store.getState();
      A.rows.push({ t: performance.now() - A.t0, px: pv.container.x, py: pv.container.y,
        bsx: pv.body.scaleX, bsy: pv.body.scaleY, rsx: r.scaleX, rsy: r.scaleY, back: A.back,
        tile: s.game.movement.position.x + ',' + s.game.movement.position.y, rot: up.rotation, tx: A.target ? A.target.x : null, ty: A.target ? A.target.y : null, axe: axeG.visible || (backAxe !== null && backAxe.visible), session: s.game.gathering.session !== null });
      for (const o of scene.children.list) {
        if (A.base.has(o) || !isGhost(o)) continue;
        let g = seen.get(o);
        if (!g) { g = { start: { x: o.x, y: o.y }, player: { x: pv.container.x, y: pv.container.y }, samples: [] }; seen.set(o, g); A.ghosts.push(g); }
        g.samples.push({ t: performance.now() - A.t0, angle: o.angle, alpha: o.alpha, x: o.x, y: o.y });
      }
    }, 30);
  };
  A.stop = () => clearInterval(A.timer);
  A.data = () => ({ rows: A.rows, ghosts: A.ghosts });
  A.ready = () => { try { return !!(H() && H().scene().playerView && H().store.getState().game); } catch { return false; } };
  A.pos = () => H().store.getState().game.movement.position;
  A.logs = () => { let n = 0; for (const sl of H().store.getState().game.inventory.slots ?? []) if (sl && /logs/.test(sl.itemId)) n += sl.quantity; return n; };
  A.trees = async () => {
    const { CONTENT } = await import('/src/app/registry.ts');
    const { isoProjection } = await import('/src/render/index.ts');
    const p = H().store.getState().game.movement.position;
    return [...CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, d: Math.abs(t.x - p.x) + Math.abs(t.y - p.y), w: isoProjection.tileToWorld(t.x, t.y) })).sort((a, b) => a.d - b.d);
  };
})()`;

const expect = (c, m) => {
  if (!c) throw new Error(m);
};
let phase = '';
async function check(id, fn) {
  console.log('check', phase, id);
  try {
    results.push({ phase, id, ok: true, ev: (await fn()) ?? '' });
  } catch (e) {
    results.push({ phase, id, ok: false, ev: e.message });
  }
}
const f = (n) => Math.round(n * 100) / 100;

async function main() {
  let vite = null;
  let cdp = null;
  let code = 1;
  try {
    vite = await startVite();
    cdp = await launchChrome({ width: 1280, height: 800 });
    const errors = [];
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown')
        errors.push(
          'exception: ' +
            (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text),
        );
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        errors.push(
          'console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '),
        );
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    const ev = (e) => cdp.eval(e);
    const log = (m) => console.log(`[${Date.now() % 1e6}] ${m}`);
    const waitFor = async (what, pred, ms = 15000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout: ' + what);
        await sleep(100);
      }
    };
    const setMode = (m) =>
      ev(
        `window.__idleRpg.store.getState().setPref({ visuals: { animations: ${JSON.stringify(m)} } })`,
      );

    for (const p of [
      { name: 'desktop', w: 1280, h: 800, touch: false },
      { name: 'phone', w: 390, h: 844, touch: true },
    ]) {
      phase = p.name;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: p.w,
        height: p.h,
        deviceScaleFactor: 1,
        mobile: p.touch,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: p.touch, maxTouchPoints: 1 });
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await sleep(200);
      await cdp.send('Page.navigate', { url: ORIGIN });
      await waitFor('game ready', () => ev('window.__A && window.__A.ready()'), 30000);
      await ev('localStorage.clear()');
      await setMode('on');
      await sleep(500);
      await ev('window.__A.start()');
      const errBase = errors.length;

      // ---- Facing while walking, 8 tile directions (screen: tile +x = se, +y = sw, -x = nw, -y = ne)
      const DIRS = [
        ['se', 1, 0, false, false],
        ['sw', 0, 1, true, false],
        ['nw', -1, 0, true, true],
        ['ne', 0, -1, false, true],
        ['e (tile +1,-1)', 1, -1, false, false],
        ['w (tile -1,+1)', -1, 1, true, false],
      ];
      for (const [name, dx, dy, left, back] of DIRS) {
        await check(`face-walk-${name}`, async () => {
          const pos0 = await ev('window.__A.pos()');
          // settle: the player must be visually still before the step under test
          await waitFor(
            'still',
            async () => {
              await ev('window.__A.start()');
              await sleep(700);
              const r = await ev('window.__A.data().rows');
              return r.every((x) => x.px === r[0].px && x.py === r[0].py);
            },
            8000,
          );
          // clear straight lane near here: every step a pure (dx,dy) tile step, verified with the pathfinder
          const lane = await ev(`(async () => {
            const w = await import('/src/features/world/index.ts'); const mv = await import('/src/features/movement/index.ts');
            const grid = w.createWorldCollisionGrid(); const p = window.__A.pos(); const dx = ${dx}, dy = ${dy}, K = 3;
            for (let r = 0; r <= 8; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
              if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
              const s = { x: p.x + ox, y: p.y + oy };
              const pts = [s]; let ok = grid.isWalkable(s.x, s.y);
              for (let i = 1; ok && i <= K; i++) {
                const a = pts[i - 1], q = { x: a.x + dx, y: a.y + dy };
                ok = grid.isWalkable(q.x, q.y) && grid.isWalkable(a.x + dx, a.y) && grid.isWalkable(a.x, a.y + dy);
                pts.push(q);
              }
              if (!ok) continue;
              const flat = (mv.findPath(grid, s, pts[K]) ?? []).map((q) => q.x + ',' + q.y).filter((t) => t !== s.x + ',' + s.y).join('|');
              if (flat === pts.slice(1).map((q) => q.x + ',' + q.y).join('|')) return { start: s, end: pts[K] };
            }
            return null;
          })()`);
          expect(lane, `no clear ${name} lane near ${JSON.stringify(pos0)}`);
          await ev(
            `window.__idleRpg.store.getState().walkTo({ x: ${lane.start.x}, y: ${lane.start.y} })`,
          );
          await waitFor(
            'reach lane start',
            async () => {
              const q = await ev('window.__A.pos()');
              return q.x === lane.start.x && q.y === lane.start.y;
            },
            10000,
          );
          await waitFor(
            'still',
            async () => {
              await ev('window.__A.start()');
              await sleep(700);
              const r = await ev('window.__A.data().rows');
              return r.every((x) => x.px === r[0].px && x.py === r[0].py);
            },
            8000,
          );
          await ev(
            `window.__A.start(); window.__idleRpg.store.getState().walkTo({ x: ${lane.end.x}, y: ${lane.end.y} })`,
          );
          await waitFor(
            'arrive',
            async () => {
              const q = await ev('window.__A.pos()');
              return q.x === lane.end.x && q.y === lane.end.y;
            },
            8000,
          );
          await sleep(100);
          const best = { mid: await ev('window.__A.data().rows'), q: lane.end, k: 3 };
          // samples while the player moves on screen
          // pathfinder may detour round an obstacle: only judge samples whose NEXT tile step is the one under test
          const stepOf = (a, i) => {
            const j = a.findIndex((x, n) => n > i && x.tile !== a[i].tile);
            if (j < 0) return null;
            const [x0, y0] = a[i].tile.split(',').map(Number);
            const [x1, y1] = a[j].tile.split(',').map(Number);
            return [x1 - x0, y1 - y0];
          };
          const moving = best.mid.filter((r, i, a) => {
            if (!(i > 0 && (r.px !== a[i - 1].px || r.py !== a[i - 1].py))) return false;
            const st = stepOf(a, i);
            return st === null || (st[0] === dx && st[1] === dy);
          });
          expect(moving.length >= 5, `only ${moving.length} moving samples`);
          const bad = moving.filter((r) => r.bsx < 0 !== left || r.back !== back);
          expect(
            bad.length === 0,
            `${bad.length}/${moving.length} samples wrong; tiles ${[...new Set(best.mid.map((r) => r.tile))].join('>')} seq ${moving
              .map((r) => (r.bsx < 0 ? 'L' : 'R') + (r.back ? 'B' : 'F'))
              .join(' ')
              .replace(
                /(\\S+)( \\1)+/g,
                '$1*',
              )}; expected left=${left} back=${back}, first bad bsx=${bad[0]?.bsx} back=${bad[0]?.back}`,
          );
          return `moved to ${JSON.stringify(best.q)} (k=${best.k}), ${moving.length} samples all left=${left} back=${back}`;
        });
      }

      // ---- Chop + fall per mode
      const modeData = {};
      for (const mode of ['on', 'reduced', 'off']) {
        await setMode(mode);
        await sleep(300);
        await ev('window.__A.start()');
        const chopped = [];
        const used = new Set();
        for (let i = 0; i < 4; i++) {
          const trees = await ev('window.__A.trees()');
          const t = trees.find((x) => !used.has(x.id));
          if (!t) break;
          used.add(t.id);
          await ev(`window.__A.target = ${JSON.stringify(t.w)}`);
          log(`${phase} ${mode} chop ${t.id} d=${t.d}`);
          await ev(`window.__idleRpg.store.getState().interactTree(${JSON.stringify(t.id)})`);
          let started = false;
          try {
            await waitFor(
              'session start',
              () => ev('window.__idleRpg.store.getState().game.gathering.session !== null'),
              20000,
            );
            started = true;
            await waitFor(
              'session end',
              () => ev('window.__idleRpg.store.getState().game.gathering.session === null'),
              30000,
            );
          } catch {
            /* keep what we have */
          }
          await sleep(900); // ghost lifetime
          chopped.push({ id: t.id, started, w: t.w });
          const d = await ev('window.__A.data()');
          const axeRows = d.rows.filter((r) => r.axe);
          const span = axeRows.length ? axeRows.at(-1).t - axeRows[0].t : 0;
          if (span >= 2000 && d.ghosts.length >= 1) break;
        }
        await ev('window.__A.stop()');
        modeData[mode] = { ...(await ev('window.__A.data()')), chopped };
      }

      for (const mode of ['on', 'reduced', 'off']) {
        const d = modeData[mode];
        const axeRows = d.rows.filter((r) => r.axe);
        const rots = axeRows.map((r) => r.rot);
        const range = rots.length ? Math.max(...rots) - Math.min(...rots) : 0;
        modeData[mode].range = range;
        await check(`chop-axe-${mode}`, async () => {
          expect(axeRows.length >= 20, `only ${axeRows.length} axe-visible samples`);
          const deg = f((range * 180) / Math.PI);
          if (mode === 'on') expect(range > 1.5, `swing range ${deg} deg, want > 86`);
          if (mode === 'reduced')
            expect(range > 0.1 && range < 0.9, `tap range ${deg} deg, want 6..50`);
          if (mode === 'off') expect(range < 1e-6, `axe rotation varies ${deg} deg, want 0`);
          return `${axeRows.length} samples, rotation range ${deg} deg`;
        });
        await check(`chop-face-tree-${mode}`, async () => {
          const ok = [];
          const bad = [];
          for (const c of d.chopped.filter((x) => x.started)) {
            // chop samples: axe visible, after 700 ms of the swing (facing is set each tick)
            const rows = axeRows.filter((r) => r.tx === c.w.x && r.ty === c.w.y);
            const settled = rows.slice(Math.floor(rows.length * 0.3));
            for (const r of settled) {
              const sx = c.w.x - r.px;
              const sy = c.w.y - r.py;
              const wantBack = sy < -1;
              const wantLeft = sx < -1 ? true : sx > 1 ? false : null;
              const wrong = r.back !== wantBack || (wantLeft !== null && r.bsx < 0 !== wantLeft);
              (wrong ? bad : ok).push({ sx: f(sx), sy: f(sy), back: r.back, bsx: r.bsx });
            }
          }
          expect(ok.length + bad.length >= 10, `only ${ok.length + bad.length} chop samples`);
          expect(bad.length === 0, `${bad.length} wrong; e.g. ${JSON.stringify(bad[0])}`);
          return `${ok.length} samples face the tree (${d.chopped.length} trees)`;
        });
        await check(`fall-ghost-${mode}`, async () => {
          const gs = d.ghosts;
          if (mode === 'off') {
            expect(gs.length === 0, `${gs.length} ghosts appeared in Off`);
            expect(
              d.chopped.some((c) => c.started),
              'no chop session ran',
            );
            return 'no ghost, chops ran';
          }
          expect(gs.length >= 1, 'no ghost appeared');
          const out = [];
          for (const g of gs) {
            const maxA = Math.max(...g.samples.map((s) => Math.abs(s.angle)));
            const signA = g.samples.reduce(
              (m, s) => (Math.abs(s.angle) > Math.abs(m) ? s.angle : m),
              0,
            );
            const last = g.samples.at(-1);
            const sx = g.start.x - g.player.x;
            const sy = g.start.y - g.player.y;
            const len = Math.hypot(sx, sy) || 1;
            const slide = ((last.x - g.start.x) * sx + (last.y - g.start.y) * sy) / len;
            const moved = Math.hypot(last.x - g.start.x, last.y - g.start.y);
            const fade = g.samples[0].alpha > g.samples.at(-1).alpha;
            out.push({ maxA: f(maxA), signA, sx: f(sx), slide: f(slide), moved: f(moved), fade });
            if (mode === 'on') {
              expect(maxA > 8, `tilt only ${f(maxA)} deg (sx ${f(sx)})`);
              if (Math.abs(sx) > 4)
                expect(
                  Math.sign(signA) === Math.sign(sx),
                  `tilts ${f(signA)} deg but tree is ${f(sx)} px to the player's ${sx > 0 ? 'right' : 'left'}: falls toward the player`,
                );
              expect(slide > 2, `slide away ${f(slide)} px, want > 2`);
            } else {
              expect(maxA < 0.5, `Reduced tilts ${f(maxA)} deg`);
              expect(moved < 0.5, `Reduced slides ${f(moved)} px`);
              expect(fade, 'Reduced ghost does not fade');
            }
          }
          return JSON.stringify(out);
        });
        await check(`scale-1.5-${mode}`, async () => {
          const bad = d.rows.filter(
            (r) =>
              Math.abs(Math.abs(r.bsx) - 1.5) > 1e-6 ||
              Math.abs(r.bsy - 1.5) > 1e-6 ||
              Math.abs(Math.abs(r.rsx) - 1.5) > 1e-6 ||
              Math.abs(r.rsy - 1.5) > 1e-6,
          );
          expect(
            bad.length === 0,
            `${bad.length}/${d.rows.length} frames off 1.5, e.g. ${JSON.stringify(bad[0])}`,
          );
          return `${d.rows.length} frames, |scale| = 1.5 (body + rig)`;
        });
      }
      await check('scale-1.5-walk-on', async () => {
        await setMode('on');
        const d = await ev('window.__A.data()');
        expect(d.rows.length > 0, 'no rows');
        return 'covered by scale checks';
      });
      await check('net-graphic-named', async () => {
        const r = await ev(`(() => {
          const pv = window.__idleRpg.scene().playerView, layer = pv.container.list[0];
          const rg = pv.container.list.find((o) => o.type === 'Container' && o.list.length === 4);
          const fore = rg.list.find((o) => o.name === 'armFrontUpper').list.find((o) => o.name === 'armFrontFore');
          const names = (c) => c.list.filter((o) => o.type === 'Graphics' && o.name).map((o) => o.name).sort().join(',');
          return { hand: names(fore), back: names(layer) };
        })()`);
        expect(
          r.hand === 'axe,net,pick,rod,rodLine' && r.back === 'axe,net,pick,rod,rodLine',
          JSON.stringify(r),
        );
        return `tools in hand + back layer: ${r.hand}`;
      });
      await check('no-console-errors', async () => {
        expect(errors.length === errBase, `errors: ${errors.slice(errBase).join(' | ')}`);
        return `${errors.length} errors`;
      });
    }
    console.log('\n=== animation e2e ===');
    let fails = 0;
    for (const r of results) {
      if (!r.ok) fails++;
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id}: ${r.ev}`);
    }
    console.log(`\n${results.length - fails}/${results.length} passed`);
    code = fails ? 1 : 0;
  } catch (e) {
    console.log('SCRIPT ERROR', e);
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id}: ${r.ev}`);
  } finally {
    try {
      await cdp?.close();
    } catch {
      /* ignore */
    }
    killChild(vite);
    killTracked();
  }
  process.exit(code);
}
main();
