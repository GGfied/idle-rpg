/* global fetch, console */
// Shared e2e kit on top of cdp.mjs. A feature test is: withGame(opts, g => { check(...); ... report() }).
//   import { withGame, forEachViewport, check, report } from './lib.mjs';
// Page-side helpers live in window.__e (installed before every page load). All state setters go through
// the DEV hook window.__idleRpg (preconditions only); behaviour under test is driven with g.tap*/drag/wheel.
//
// FAST BASE (start every new test from TEMPLATE.e2e.mjs; budget < 60 s, enforced by `budgetMs`):
//   runParallel(import.meta.url, port, {viewports, renderers, budgetMs})
//       One child process per viewport x renderer ("desktop:webgl", "phone:canvas"...), each on port+i with its own
//       vite + Chrome; wall time = slowest combo. Returns this process's combos; feed them to forEachCombo.
//   forEachCombo(combos, async (g, vp, renderer) => {...})   fresh load per combo (viewport + renderer applied).
//   withCombos(opts, combos, async (g, vp, renderer) => {...})   withGame + forEachCombo with ONE page load per child
//       (forEachCombo reloads after withGame's own boot); falls back to forEachCombo when several combos run here.
//       One vite is started by the parent and shared by all children (E2E_URL). {split:false} = tiny file: combos run
//       sequentially in one process (no per-child Chrome/boot floor). OPT-IN for now (default = old per-child): E2E_SHARED_VITE=1 / E2E_SHARED_CHROME=1.
//       The parent also starts ONE Chrome; children attach with an own browser context (E2E_CHROME_PORT).
//   withGame({port, budgetMs, tickMs, realTime, renderer, initScripts}, fn)   ?tickMs=60 by default (10x ticks, rules unchanged).
//       initScripts: [pageSource] spies registered before the first load (no extra Page.reload per spy).
//       realTime:true (600 ms ticks) ONLY when timing is what's tested; or g.realTime(fn) / g.setTickMs(n) for one
//       phase. Gather sessions end in ~1 s at 60 ms: use g.setTickMs(150) or the g.every(ms, tapAgain) keep-alive.
//       renderer:'canvas' injects the pre-boot WebGL-getContext-null so Phaser.AUTO falls back to CANVAS.
//       budgetMs adds a failing 'budget' check if the whole script (vite+Chrome boot included) runs longer.
//   g.synth: synthetic time. g.synth.freeze() sleeps Phaser's loop (game tick only slowed to 600 ms: hook clamps 30-600); g.synth.step(ms) runs full frames
//       (update+render) at chosen times; g.synth.frames([t...], {name}) = ONE screenshot per chosen frame (screenshots
//       stall rendering ~650 ms, so never loop them on wall-clock); g.synth.animSeries(...) drives the animator by hand
//       (animE approach); g.synth.thaw() restores. Use for animations, VFX, anything that "changes over time".
//   g.waitFor(pred) / g.waitState(path, 'v => ...') / g.waitChat(/re/) / g.waitIdle() / g.settle() (camera still)
//       replace fixed sleeps. g.teleportSettled(x, y) = teleport + settle (no 700 ms sleep).
//   Preconditions, never grinding: g.teleport/teleportSettled, g.setInventory, g.setLevels({skill: lvl}), g.setXp.
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  activity,
  hardTimeout,
  killChild,
  launchChrome,
  startChrome,
  runMain,
  sleep,
  spawnTracked,
  waitFor,
} from './cdp.mjs';

// Pre-boot: WebGL contexts return null, so Phaser.AUTO falls back to the CANVAS renderer (the user's black-water case).
const NOGL = `(() => { const o = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; })();`;
export const RENDERERS = ['webgl', 'canvas'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, touch: false },
  phone: { width: 390, height: 844, touch: true, mobile: true, dsf: 2 },
  landscape: { width: 844, height: 390, touch: true, mobile: true, dsf: 2 },
};

export const expect = (c, m) => {
  if (!c) throw new Error(typeof m === 'function' ? m() : m);
};

// ---- load meter: makes wall-clock budgets/timeouts meaningful on a busy machine ----------------
// Every ~1.5 s this process spins 40 ms and compares CPU time to wall time: cpuShare = cpu/wall is the fraction of a core
// the OS actually gives us (1.0 idle machine, 0.1 when ~10 runnable threads compete per core). slowdown = 1/cpuShare is
// measured DIRECTLY (not the lagging load average), so the same file gets the same verdict at load 50 and at load 200:
// effective budget = budgetMs x max(1, slowdown). An idle-but-slow file (fixed sleeps) keeps slowdown ~1 and stays red.
export const loadMeter = {
  cpuMax: new Map(), // pid -> max cputime seen (s) for this process and all its descendants (vite, Chrome, children)
  w: 0,
  c: 0,
  n: 0,
  timer: null,
  sample() {
    const w0 = performance.now();
    const c0 = process.cpuUsage();
    while (performance.now() - w0 < 40);
    const w = performance.now() - w0;
    const c = process.cpuUsage(c0);
    this.w += w;
    this.c += Math.min((c.user + c.system) / 1000, w);
    this.n++;
    this.sampleTree();
  },
  /** Sum of CPU seconds used by this process + every descendant (per-pid max, so exited ones stay counted). */
  sampleTree() {
    const r = spawnSync('ps', ['-axo', 'pid=,ppid=,cputime='], { encoding: 'utf8' });
    if (r.status !== 0) return;
    const rows = r.stdout
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .map(([pid, ppid, t]) => ({
        pid: +pid,
        ppid: +ppid,
        sec: t.split(':').reduce((a, x) => a * 60 + parseFloat(x), 0),
      }));
    const kids = new Map();
    for (const x of rows) (kids.get(x.ppid) ?? kids.set(x.ppid, []).get(x.ppid)).push(x);
    const byPid = new Map(rows.map((x) => [x.pid, x]));
    const stack = [process.pid];
    while (stack.length) {
      const pid = stack.pop();
      const x = byPid.get(pid);
      if (x) this.cpuMax.set(pid, Math.max(this.cpuMax.get(pid) ?? 0, x.sec));
      for (const k of kids.get(pid) ?? []) stack.push(k.pid);
    }
  },
  cpuSec() {
    this.sampleTree();
    let t = 0;
    for (const v of this.cpuMax.values()) t += v;
    return t;
  },
  start() {
    if (this.timer) return;
    for (let i = 0; i < 4; i++) this.sample();
    this.timer = setInterval(() => this.sample(), 1500);
    this.timer.unref();
  },
  slowdown() {
    return this.n ? Math.max(1, this.w / Math.max(this.c, this.w * 0.02)) : 1;
  },
  describe() {
    const s = this.slowdown();
    return `load1=${os.loadavg()[0].toFixed(0)}/${os.cpus().length}cores cpuShare=${(1 / s).toFixed(2)} slowdown=${s.toFixed(1)}x samples=${this.n}`;
  },
};
/** Load-scaled wall budget verdict: {ok, text}. The text always carries the load numbers. */
export function budgetVerdict(tookMs, baseMs, what = 'script', cpuUnits = 1) {
  const sd = loadMeter.slowdown();
  const eff = Math.round(baseMs * sd);
  const cpu = loadMeter.cpuSec();
  const cpuMax = (baseMs / 1000) * cpuUnits; // load-invariant: CPU-seconds of the whole process tree (node + vite + Chrome)
  const wallOk = tookMs <= eff;
  const cpuOk = cpu <= cpuMax;
  const ok = wallOk && cpuOk;
  return {
    ok,
    text: `BUDGET ${ok ? 'ok' : 'FAIL'}: ${what} wall ${tookMs} ms vs ${eff} ms (base ${baseMs} ms x slowdown ${sd.toFixed(1)}) cpu ${cpu.toFixed(1)} s vs ${cpuMax.toFixed(0)} s ${ok ? '' : wallOk ? '(CPU over: genuinely heavy)' : cpuOk ? '(wall over at measured load: sleeps/waits)' : '(both over)'} [${loadMeter.describe()}]`,
  };
}

// ---- check() / report() -----------------------------------------------------------------------
const results = [];
let phase = '';
let closeHook = null;
/** check(id, title, fn[, {xfail:'why'}]): fn returns evidence (string) or throws. xfail = known bug: FAIL is XFAIL, pass is XPASS (fails the run). */
export async function check(id, title, fn, { xfail } = {}) {
  let ok, ev;
  try {
    await closeHook?.().catch(() => {});
    ev = (await fn()) ?? '';
    ok = true;
  } catch (e) {
    ev = e.message;
    ok = false;
  }
  const status = xfail ? (ok ? 'XPASS' : 'XFAIL') : ok ? 'PASS' : 'FAIL';
  results.push({ phase, id, title, status, ev: String(ev), xfail });
  console.log(
    `${status} [${phase}] ${id} ${title}\n     ${ev}${xfail ? ` (known: ${xfail})` : ''}`,
  );
}
/**
 * Wait until a {x, y} sample is still: `stable` consecutive intervals (default 2 x 150 ms) each moving < eps px.
 * ALWAYS sleeps between samples (two reads in one rAF frame look "stable" while the follow camera still eases).
 * Returns the last sample. Usage: waitStill(() => T(`tileClient(${x}, ${y}, 0)`)).
 */
export async function waitStill(
  sample,
  { intervalMs = 150, stable = 2, max = 60, eps = 0.5 } = {},
) {
  let p = await sample();
  let still = 0;
  for (let i = 0; i < max && still < stable; i++) {
    await sleep(intervalMs);
    const q = await sample();
    still = Math.abs(q.x - p.x) < eps && Math.abs(q.y - p.y) < eps ? still + 1 : 0;
    p = q;
  }
  return p;
}
/** Print the summary table; returns exit code (0 = no FAIL/XPASS). */
export function report() {
  const bad = results.filter((r) => r.status === 'FAIL' || r.status === 'XPASS');
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(
    `\nSUMMARY: ${n('PASS')} PASS, ${n('FAIL')} FAIL, ${n('XFAIL')} XFAIL, ${n('XPASS')} XPASS of ${results.length}`,
  );
  for (const r of bad) console.log(`  ${r.status} [${r.phase}] ${r.id} ${r.title}: ${r.ev}`);
  return bad.length ? 1 : 0;
}

// ---- page-side helpers -------------------------------------------------------------------------
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const scene = () => H().scene();
  const world = () => scene().camera.scene;
  window.__e = {
    ready: () => { try { return !!(H() && H().store.getState().game && scene().camera && scene().playerView && document.querySelector('canvas')); } catch { return false; } },
    game: () => H().store.getState().game,
    set: (fn) => { const s = H().store; const g = s.getState().game; s.setState({ game: fn(g) }); },
    // world px -> client px, independent of clientToTile (camera maths from the live camera + canvas rect)
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    tileClient: async (tx, ty, dy = 0) => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(tx, ty); return window.__e.toClient(w.x, w.y + dy); },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    // Every tappable thing: trees, facility objects, npcs, with tile + drawn-bounds height
    targets: async () => {
      const r = await import('/src/render/index.ts'); const w = await import('/src/features/world/index.ts'); const reg = await import('/src/app/registry.ts');
      const out = []; const add = (id, kind, x, y) => out.push({ id, kind, x, y, up: (r.VIEW_HIT_BOUNDS[kind] || { up: 24 }).up });
      for (const t of w.WORLD_TREES) add(t.nodeId, t.defId, t.x, t.y);
      for (const o of w.WORLD_OBJECT_SPAWNS) add(o.objectId, o.kind, o.x, o.y);
      for (const n of reg.CONTENT.npcs.values()) add(n.spawnId, 'npc', n.x, n.y);
      for (const n of w.WORLD_NPC_SPAWNS) if (!out.some((o) => o.id === (n.spawnId ?? n.npcId))) add(n.spawnId ?? n.npcId, 'npc', n.x, n.y);
      return out;
    },
    chat: () => H().store.getState().game.chat.map((l) => l.text),
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top }; },
    // FRACTIONAL scroll: worldView is integer-rounded, so the follow glide's last 1 px step looks 'settled' there (Q4b: chat 282->283 landed 19 ms after waitStill returned).
    camXY: () => { const c = scene().camera; return { x: c.scrollX, y: c.scrollY }; },
    camView: () => { const v = scene().camera.worldView; return { x: v.x, y: v.y }; },
    rendererName: () => (world().game.renderer.type === 2 ? 'webgl' : 'canvas'),
  };
  // Synthetic time: Phaser's own loop + the game tick are put to sleep, frames are stepped by hand.
  const S = (window.__e.synth = { frozen: false, t: 0, base: 0, prevTick: 600, saved: null });
  S.game = () => world().game;
  S.freeze = () => {
    if (S.frozen) return S.t;
    const g = S.game();
    S.prevTick = H().tickMs();
    H().setTickMs(600); // the DEV hook clamps to 30..600 ms: ticks cannot be stopped, only slowed to real time
    g.loop.sleep();
    S.t = g.loop.now; S.base = S.t; S.frozen = true;
    return S.t;
  };
  /** Run n full frames (update + render) of dt ms each; returns the synthetic time. */
  S.step = (dt, n) => { for (let i = 0; i < (n || 1); i++) { S.t += dt; S.game().step(S.t, dt); } return S.t; };
  /** Step ONE frame to offset ms after freeze(). */
  S.stepTo = (offset) => { const dt = Math.max(0.001, S.base + offset - S.t); S.t += dt; S.game().step(S.t, dt); return S.t; };
  S.thaw = () => { if (!S.frozen) return; S.frozen = false; S.restoreAnim(); S.game().loop.wake(); H().setTickMs(S.prevTick); };
  /** Mute the scene's own animator update/setState so animSeries owns the clock. */
  S.muteAnim = () => { const a = scene().animator; if (S.saved) return; S.saved = { a, u: a.update, s: a.setState }; a.update = () => {}; a.setState = () => {}; };
  S.restoreAnim = () => { if (!S.saved) return; const { a, u, s } = S.saved; a.update = u; a.setState = s; S.saved = null; };
  /** animSeries(state, opts, times, sampleSrc): set animator state, update at T0 (warm-up) then at each offset, sample after each. */
  S.animSeries = (state, opts, times, sampleSrc) => {
    S.muteAnim();
    const { a, u, s } = S.saved, sample = (0, eval)(sampleSrc), T = 1e6, rows = [];
    s.call(a, state, opts); u.call(a, T);
    for (const t of times) { u.call(a, T + t); rows.push(sample(t)); }
    s.call(a, 'idle', { facing: opts && opts.facing }); u.call(a, T + 1e5);
    return rows;
  };
})();`;

// ---- withGame ----------------------------------------------------------------------------------
async function startVite(port, origin) {
  const cfg = resolve(ROOT, process.env.E2E_ROOT_CFG ?? 'tests/e2e/vite.frozen.config.mjs');
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['--config', cfg, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  // load-aware: 30 s x measured slowdown (cap 150 s); a busy machine must not look like a dead vite
  const startMs = Math.min(150000, Math.round(30000 * loadMeter.slowdown()));
  const t0 = Date.now();
  for (let beat = t0; Date.now() - t0 < startMs;) {
    activity('waitFor vite start');
    if (Date.now() - beat > 15000) {
      beat = Date.now();
      console.log(
        `[wait] vite on ${port} ${Date.now() - t0}/${startMs} ms (${loadMeter.describe()})`,
      );
    }
    try {
      if ((await fetch(origin)).ok) return proc;
    } catch {
      /* not up */
    }
    await sleep(200);
  }
  killChild(proc);
  throw new Error(
    `VITE_START_TIMEOUT vite did not start on ${port} within ${startMs} ms (port busy? lsof -i :${port}; ${loadMeter.describe()}); no checks ran for this combo`,
  );
}

/**
 * withGame({port, viewport, tickMs}, async g => {...}). Starts vite + Chrome, loads the game, runs fn, cleans up
 * and exits the process with report()'s code (or 1 on throw). Call once per script; use g.setViewport() or
 * forEachViewport() for several viewports.
 */
export function withGame(opts, fn) {
  return runMain(async () => {
    hardTimeout(6 * 60e3);
    const startedAt = Date.now();
    loadMeter.start();
    // E2E_URL=http://127.0.0.1:5300/ or E2E_SHARED=1 (= :5300) reuses the warm live server (warmServer.mjs); no own vite.
    const sharedUrl =
      process.env.E2E_URL ?? (process.env.E2E_SHARED ? 'http://127.0.0.1:5300/' : '');
    const port = Number(process.env.E2E_PORT ?? opts.port);
    const origin = sharedUrl ? sharedUrl.replace(/\/?$/, '/') : `http://127.0.0.1:${port}/`;
    const tickMs = opts.tickMs ?? (opts.realTime ? 600 : 60);
    let vite = null;
    if (sharedUrl) {
      if (
        !(await fetch(origin).then(
          (r) => r.ok,
          () => false,
        ))
      )
        throw new Error(`shared server ${origin} is down: run node tests/e2e/warmServer.mjs`);
    }
    const vp = opts.viewport ?? 'desktop';
    // Chrome launch (~2-7 s) overlaps vite startup instead of following it.
    const [viteProc, cdp] = await Promise.all([
      sharedUrl ? null : startVite(port, origin),
      launchChrome({
        width: VIEWPORTS[vp].width,
        height: VIEWPORTS[vp].height,
        attach: Number(process.env.E2E_CHROME_PORT ?? 0), // set by runParallel (opt-in): join the shared Chrome in an own context
      }),
    ]);
    vite = viteProc;
    const chromeMs = Date.now() - startedAt;
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
    let renderer = process.env.E2E_RENDERER ?? opts.renderer ?? 'webgl';
    let nogl = null;
    const applyRenderer = async () => {
      if (nogl) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: nogl });
      nogl =
        renderer === 'canvas'
          ? (await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: NOGL })).identifier
          : null;
    };
    await applyRenderer();
    // opts.initScripts: page sources (spies) registered BEFORE the first load, so no extra reload is needed. Additive.
    for (const source of opts.initScripts ?? [])
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
    let touch = false;
    const E = (expr) => cdp.eval(`window.__e.${expr}`);
    const J = JSON.stringify;
    const click = async (x, y, button = 'left') => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
    };
    const touchAt = (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });

    const g = {
      cdp,
      eval: (e) => cdp.eval(e),
      page: E,
      errors,
      get touch() {
        return touch;
      },
      /** Assert helper re-exported for convenience. */
      expect,
      sleep,
      consoleErrors: () => [...errors],
      waitFor: (f, { timeoutMs = 15000, label = 'condition', intervalMs = 50 } = {}) =>
        waitFor(f, { timeoutMs, label, intervalMs }),
      state: (path = '') => cdp.eval(`window.__e.game()${path ? '.' + path : ''}`),
      /** Mutate game state in-page: g.update('({ ...g, hp: { ...g.hp, current: 4 } })') */
      update: (expr) => cdp.eval(`window.__e.set((g) => ${expr})`),
      store: (expr) =>
        cdp.eval(`(() => { const s = window.__idleRpg.store.getState(); return ${expr}; })()`),

      get renderer() {
        return renderer;
      },
      get tickMs() {
        return tickMs;
      },
      /** 'canvas' | 'webgl' for the NEXT load() (use forEachCombo, which also reloads). */
      async setRenderer(name) {
        expect(RENDERERS.includes(name), `unknown renderer ${name}`);
        renderer = name;
        await applyRenderer();
      },
      /** Renderer Phaser actually booted with (webgl | canvas). */
      rendererName: () => E('rendererName()'),
      /** Change the game tick for the rest of the run (60 fast; 120-200 for gather sessions; 600 real time). */
      setTickMs: (ms) => cdp.eval(`window.__idleRpg.setTickMs(${ms})`),
      /** Run `fn` every `ms` (not overlapping) until the returned stop(): keep-alive re-tap for gather sessions. */
      every(ms, fn) {
        let on = true;
        let busy = false;
        const id = setInterval(async () => {
          if (!on || busy) return;
          busy = true;
          try {
            await fn();
          } catch {
            /* the test's own checks report real failures */
          }
          busy = false;
        }, ms);
        return () => {
          on = false;
          clearInterval(id);
        };
      },
      /** Synthetic time (see header). frames() takes ONE screenshot per chosen frame offset (ms after freeze). */
      synth: {
        freeze: () => E('synth.freeze()'),
        step: (dt = 16.7, n = 1) => E(`synth.step(${dt}, ${n})`),
        stepTo: (offset) => E(`synth.stepTo(${offset})`),
        thaw: () => E('synth.thaw()'),
        muteAnim: () => E('synth.muteAnim()'),
        /** Drive the animator by hand: sampleSrc is a page function source `(t) => ({...})`; returns its rows. */
        animSeries: (state, animOpts, times, sampleSrc) =>
          E(`synth.animSeries(${J(state)}, ${J(animOpts)}, ${J(times)}, ${J(sampleSrc)})`),
        /** Step to each offset and screenshot once. Returns [{t, file, bytes, b64?}]; keep:true includes base64. */
        async frames(offsets, { name = 'frame', clip, keep = false } = {}) {
          const out = [];
          await E('synth.freeze()');
          for (const t of offsets) {
            await E(`synth.stepTo(${t})`);
            const { data } = await cdp.send('Page.captureScreenshot', {
              format: 'png',
              ...(clip ? { clip: { scale: 1, ...clip } } : {}),
            });
            let file = null;
            if (process.env.SHOTS_DIR) {
              const { mkdirSync, writeFileSync } = await import('node:fs');
              mkdirSync(process.env.SHOTS_DIR, { recursive: true });
              file = resolve(process.env.SHOTS_DIR, `${name}-${t}.png`);
              writeFileSync(file, Buffer.from(data, 'base64'));
            }
            out.push({ t, file, bytes: data.length, ...(keep ? { b64: data } : {}) });
          }
          return out;
        },
      },

      // ---- wait on state, not sleeps
      /** Wait until predSrc (page function source, e.g. 'p => p.x === 3') is truthy for game state at `path`. */
      waitState: (path, predSrc, { timeoutMs = 15000, label } = {}) =>
        waitFor(
          () =>
            cdp.eval(`(${predSrc})(window.__e.game()${path ? '.' + path : ''})`).catch(() => false),
          { timeoutMs, label: label ?? `${path} ${predSrc}`, intervalMs: 40 },
        ),
      /** Wait for a chat line matching a RegExp or containing a string; returns the line. */
      async waitChat(re, { timeoutMs = 15000 } = {}) {
        const m = (t) => (typeof re === 'string' ? t.includes(re) : re.test(t));
        let hit = null;
        await waitFor(
          async () => {
            hit = (await E('chat()')).find(m) ?? null;
            return hit;
          },
          { timeoutMs, label: `chat ${re}`, intervalMs: 40 },
        );
        return hit;
      },
      /** Wait until the player has no path and no pending interaction (walk finished). */
      waitIdle: ({ timeoutMs = 15000 } = {}) =>
        g.waitState('', 'g => g.movement.path.length === 0 && !g.pendingInteraction', {
          timeoutMs,
          label: 'player idle',
        }),
      /** Wait for the follow camera to stop easing (replaces a fixed settle sleep). */
      settle: () =>
        waitStill(() => E('camXY()'), { intervalMs: 80, stable: 3, eps: 0.02, max: 120 }),
      async teleportSettled(tx, ty) {
        await g.teleport(tx, ty, { settleMs: 0 });
        return g.settle();
      },
      /** Set several skill levels at once: g.setLevels({woodcutting: 30, cooking: 15}). */
      async setLevels(map) {
        await cdp.eval(`(async () => { const P = await import('/src/core/progression/index.ts'); const s = window.__idleRpg.store; const g = s.getState().game;
          const xp = { ...g.progression.xp }; for (const [k, l] of Object.entries(${J(map)})) xp[k] = P.xpForLevel(l);
          s.setState({ game: { ...g, progression: { ...g.progression, xp } } }); })()`);
      },

      // ---- loading / viewport
      async setViewport(name) {
        const v = VIEWPORTS[name];
        touch = v.touch;
        phase = name;
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: v.width,
          height: v.height,
          deviceScaleFactor: v.dsf ?? 1,
          mobile: !!v.mobile,
        });
        await cdp.send('Emulation.setTouchEmulationEnabled', {
          enabled: v.touch,
          maxTouchPoints: v.touch ? 5 : 1,
        });
      },
      /** Fresh save, load `/?tickMs=N`, wait for the DEV hook + scene, let the camera settle. */
      async load({ query = '' } = {}) {
        await cdp.send('Page.navigate', { url: 'about:blank' });
        await sleep(300);
        await cdp.send('Storage.clearDataForOrigin', {
          origin: origin.slice(0, -1),
          storageTypes: 'local_storage',
        });
        await cdp.send('Page.navigate', { url: `${origin}?tickMs=${tickMs}${query}` });
        const t0 = Date.now();
        const readyMs = Math.min(150000, Math.round(25000 * loadMeter.slowdown()));
        try {
          // own poll loop (not waitFor): heartbeat output keeps a runParallel parent's idle watchdog fed
          let beat = Date.now();
          for (;;) {
            activity('waitFor game ready (DEV hook)');
            if (await E('ready()').catch(() => false)) break;
            if (Date.now() - t0 > readyMs) throw new Error('not ready');
            if (Date.now() - beat > 15000) {
              beat = Date.now();
              console.log(
                `[wait] game ready ${Date.now() - t0}/${readyMs} ms (${loadMeter.describe()})`,
              );
            }
            await sleep(100);
          }
        } catch (e) {
          // LOUD: a combo that never boots is a named FAIL + summary, never silently missing checks/shots.
          const url = await cdp.eval('location.href').catch(() => '?');
          const why = `GAME_READY_TIMEOUT [${phase || vp}:${renderer}] game ready (DEV hook) did not fire in ${readyMs} ms (page ${url}; ${loadMeter.describe()}); no checks ran for this combo`;
          results.push({
            phase,
            id: 'game-ready',
            title: 'game ready (DEV hook)',
            status: 'FAIL',
            ev: why,
          });
          console.log(`FAIL [${phase}] game-ready game ready (DEV hook)\n     ${why}`);
          report();
          throw new Error(why, { cause: e });
        }
        g.lastReadyMs = Date.now() - t0;
        if (process.env.E2E_TIMING) console.log(`[timing] game ready ${g.lastReadyMs} ms`);
        await sleep(800);
      },
      /** Run fn at 600 ms ticks (real-time smoothness / timing checks), restoring tickMs after. */
      async realTime(fn) {
        await cdp.eval('window.__idleRpg.setTickMs(600)');
        try {
          return await fn();
        } finally {
          await cdp.eval(`window.__idleRpg.setTickMs(${tickMs})`);
        }
      },

      // ---- real input (mouse on desktop, touch on phone/landscape)
      async tap(x, y) {
        if (touch) {
          await touchAt('touchStart', x, y);
          await touchAt('touchEnd');
        } else await click(x, y);
        await sleep(120);
      },
      async rightClick(x, y) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased'])
          await cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            button: 'right',
            clickCount: 1,
          });
        await sleep(120);
      },
      /** Touch long-press (900 ms hold); on desktop falls back to rightClick. */
      async longPress(x, y, holdMs = 900) {
        if (!touch) return g.rightClick(x, y);
        await touchAt('touchStart', x, y);
        await sleep(holdMs);
        await touchAt('touchEnd');
        await sleep(120);
      },
      /** Drag from (x0,y0) to (x1,y1) in `steps` moves. */
      async drag(x0, y0, x1, y1, steps = 8) {
        const at = (i) => [x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps];
        if (touch) {
          await touchAt('touchStart', x0, y0);
          for (let i = 1; i <= steps; i++) {
            await touchAt('touchMove', ...at(i));
            await sleep(16);
          }
          await touchAt('touchEnd');
        } else {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: x0,
            y: y0,
            button: 'left',
            clickCount: 1,
          });
          for (let i = 1; i <= steps; i++) {
            const [x, y] = at(i);
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x,
              y,
              button: 'left',
              buttons: 1,
            });
            await sleep(16);
          }
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: x1,
            y: y1,
            button: 'left',
            clickCount: 1,
          });
        }
        await sleep(120);
      },
      /** Mouse wheel at (x,y) (deltaY>0 scrolls down). */
      async wheel(x, y, deltaY, deltaX = 0) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
        await sleep(120);
      },
      /** Tap the centre of the first element matching css (scrolled into view, rect read right before the tap). */
      async tapSelector(css) {
        const r = await E(`rect(${J(css)})`);
        expect(r, `no element for ${css}`);
        expect(r.w > 0 && r.h > 0, `${css} has no size`);
        await g.tap(r.x, r.y);
        return r;
      },
      rect: (css) => E(`rect(${J(css)})`),
      /** Rect (centre x,y + w/h) of css WITHOUT scrolling it into view, once it stops moving (scroll/layout settled); null if absent. */
      async settleRect(css) {
        const read = () =>
          cdp.eval(
            `(() => { const e = document.querySelector(${J(css)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top }; })()`,
          );
        if (!(await read())) return null;
        await waitStill(async () => (await read()) ?? { x: NaN, y: NaN }, {
          intervalMs: 60,
          stable: 2,
          max: 40,
        });
        return read();
      },
      /** Client px of a tile centre (+dy world px, negative = up the sprite). */
      tileClient: (tx, ty, dy = 0) => E(`tileClient(${tx}, ${ty}, ${dy})`),
      /** Tap a tile's centre (checks the point is on the canvas, not a HUD panel). */
      async tapTile(tx, ty, dy = 0) {
        const p = await g.tileClient(tx, ty, dy);
        expect(
          await E(`topIsCanvas(${p.x}, ${p.y})`),
          `tile ${tx},${ty} at ${Math.round(p.x)},${Math.round(p.y)} is covered by HUD`,
        );
        await g.tap(p.x, p.y);
        return p;
      },
      /** Tap a tree / facility / npc by its id, at mid-height of its drawn bounds. Returns the target. */
      async tapObject(id) {
        const t = (await E('targets()')).find((o) => o.id === id);
        expect(t, `no target ${id}`);
        const p = await g.tileClient(t.x, t.y, -t.up / 2);
        expect(
          await E(`topIsCanvas(${p.x}, ${p.y})`),
          `${id} at ${Math.round(p.x)},${Math.round(p.y)} is covered by HUD`,
        );
        await g.tap(p.x, p.y);
        return t;
      },
      /** Close bank, dialogue, context menu and settings via the store (check() calls this first). */
      async closeOverlays() {
        await cdp.eval(
          `(() => { const s = window.__idleRpg.store, st = s.getState(); if (st.game.bankOpen) st.closeBank(); if (st.game.talk) st.closeDialogue(); st.closeMenu?.(); if (st.settingsOpen) s.setState({ settingsOpen: false }); })()`,
        );
      },
      targets: () => E('targets()'),
      /** First target of a kind (e.g. 'tree', 'oak_tree', 'bank_booth'). */
      async targetOfKind(kind) {
        const t = (await E('targets()')).find((o) => o.kind === kind);
        expect(t, `no target of kind ${kind}`);
        return t;
      },

      // ---- preconditions via the store
      /** Place the player at a tile (no path, no session, no pending interaction); waits for the camera to follow. */
      async teleport(tx, ty, { settleMs = 700 } = {}) {
        await g.update(
          `({ ...g, movement: { ...g.movement, position: { x: ${tx}, y: ${ty} }, path: [] }, pendingInteraction: null, gathering: { ...g.gathering, session: null } })`,
        );
        await sleep(settleMs);
      },
      /** Set the movement slice fields, e.g. g.setMovement('runEnergy: 0, running: false'). */
      setMovement: (fields) => g.update(`({ ...g, movement: { ...g.movement, ${fields} } })`),
      async setXp(skill, xp) {
        await cdp.eval(`(async () => { const s = window.__idleRpg.store; const g = s.getState().game;
          s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, ${J(skill)}: ${xp} } } } }); })()`);
      },
      async setLevel(skill, lvl) {
        await cdp.eval(`(async () => { const P = await import('/src/core/progression/index.ts'); const s = window.__idleRpg.store; const g = s.getState().game;
          s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, ${J(skill)}: P.xpForLevel(${lvl}) } } } }); })()`);
      },
      /** items: [{itemId, quantity}|null|'bronze_axe', ...]; the rest of the 28 slots are emptied. */
      async setInventory(items) {
        const slots = items.map((i) => (typeof i === 'string' ? { itemId: i, quantity: 1 } : i));
        await g.update(
          `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((_, i) => (${J(slots)}[i] ?? null)) } })`,
        );
      },
      /** Same value counts as one run of the in-page `window.__idleRpg.store.getState().walkTo`. */
      walkTo: (x, y) => cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: ${x}, y: ${y} })`),

      // ---- observation
      /** Wait for n game ticks (at the current tickMs, +25% slack). */
      async waitTicks(n) {
        const ms = await cdp.eval('window.__idleRpg.tickMs()');
        await sleep(Math.ceil(n * ms * 1.25) + 30);
      },
      chatLines: () => E('chat()'),
      /** Number of chat lines containing `text`. */
      async chatCount(text) {
        return (await E('chat()')).filter((t) => t.includes(text)).length;
      },
      /** Record position changes of the player until stop(); returns [{x,y,e,r}] (tile, runEnergy, running). */
      async trackMoves() {
        await cdp.eval(`(() => { window.__pos = []; window.__unsub = window.__idleRpg.store.subscribe((n) => { const m = n.game.movement; const l = window.__pos[window.__pos.length - 1];
          if (!l || l.x !== m.position.x || l.y !== m.position.y) window.__pos.push({ x: m.position.x, y: m.position.y, e: m.runEnergy, r: m.running }); }); })()`);
        return async () => cdp.eval('(() => { window.__unsub(); return window.__pos; })()');
      },
      async screenshot(name) {
        const dir = process.env.SHOTS_DIR;
        if (!dir) return null;
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(dir, { recursive: true });
        const file = resolve(dir, `${name}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
      },
    };

    g.viewportName = vp;
    closeHook = () => g.closeOverlays();
    try {
      await g.setViewport(vp);
      await g.load();
      console.log(
        `[boot] ${phase || vp} vite+chrome ${chromeMs} ms${sharedUrl ? ' (shared vite)' : ''}, first game-ready ${g.lastReadyMs} ms, total-to-ready ${Date.now() - startedAt} ms`,
      );
      const r = await fn(g);
      await check('console', 'no console errors / exceptions', () => {
        expect(errors.length === 0, errors.join(' | '));
        return '0 errors';
      });
      if (opts.budgetMs) {
        const took = Date.now() - startedAt;
        await check(
          'budget',
          `script finished within ${opts.budgetMs / 1000} s (load-scaled)`,
          () => {
            const v = budgetVerdict(took, opts.budgetMs);
            expect(v.ok, v.text);
            return v.text;
          },
        );
      }
      console.log(`[timing] ${phase || vp} total ${Date.now() - startedAt} ms`);
      return typeof r === 'number' && r !== 0 ? r : report();
    } finally {
      await cdp.close().catch(() => {});
      if (vite) killChild(vite);
    }
  });
}

/**
 * forEachViewport(['desktop','phone'], async (g, vp) => {...}) returns the fn for withGame: it runs once per
 * viewport on a fresh load (fresh save). Usage: withGame({port}, forEachViewport([...], async (g, vp) => {...})).
 */
export function forEachViewport(names, fn) {
  return async (g) => {
    for (const name of names) {
      await g.setViewport(name);
      await g.load();
      await fn(g, name);
    }
  };
}

/**
 * forEachCombo(combos, async (g, vp, renderer) => {...}): like forEachViewport but combos are "viewport:renderer"
 * strings (from runParallel) or plain viewport names. Each combo gets a fresh load with the viewport + renderer applied.
 */
export function forEachCombo(combos, fn) {
  return async (g) => {
    for (const combo of combos) {
      const [vp, r = g.renderer] = combo.split(':');
      await g.setViewport(vp);
      await g.setRenderer(r);
      await g.load();
      await fn(g, vp, r);
    }
  };
}

/**
 * withCombos(opts, combos, async (g, vp, renderer) => {...}): withGame + forEachCombo WITHOUT the second page load.
 * withGame already boots one page; when this process owns a single combo (the runParallel child case) that boot is
 * used directly (viewport + renderer from the combo), saving one full game load (~5-15 s under load). Several combos
 * (E2E_NO_SPLIT=1) fall back to forEachCombo (fresh load each).
 */
export function withCombos(opts, combos, fn) {
  if (combos.length !== 1) return withGame(opts, forEachCombo(combos, fn));
  const [vp, r] = combos[0].split(':');
  return withGame({ ...opts, viewport: vp, ...(r ? { renderer: r } : {}) }, (g) =>
    fn(g, vp, g.renderer),
  );
}

/**
 * runParallel(import.meta.url, basePort, {viewports, renderers, budgetMs, prefix, plain}): the parent (no
 * E2E_COMBO/E2E_VP) spawns one child per viewport x renderer with E2E_COMBO=vp:renderer, E2E_RENDERER, E2E_PORT=base+i,
 * prefixes their output, and exits with the worst code (budgetMs also fails the PARENT wall time). A child gets back just
 * its own combo. E2E_NO_SPLIT=1 runs every combo in this one process, sequentially. plain:true returns bare viewport
 * names (the old splitViewports contract).
 */
export async function runParallel(
  fileUrl,
  defaultPort,
  {
    viewports = ['desktop', 'phone'],
    renderers = ['webgl'],
    budgetMs = 0,
    prefix = true,
    plain = false,
    split = true,
  } = {},
) {
  const all = viewports.flatMap((v) => renderers.map((r) => `${v}:${r}`));
  const out = (l) => (plain ? l.map((c) => c.split(':')[0]) : l);
  const one =
    process.env.E2E_COMBO ?? (process.env.E2E_VP ? `${process.env.E2E_VP}:${renderers[0]}` : '');
  if (one) return out([one]);
  // split:false = tiny file: all combos run sequentially in THIS process (one vite + one Chrome, no per-child floor).
  if (process.env.E2E_NO_SPLIT || !split || all.length < 2) return out(all);
  const { spawn } = await import('node:child_process');
  const base = Number(process.env.E2E_PORT ?? defaultPort);
  const file = fileURLToPath(fileUrl);
  const t0 = Date.now();
  loadMeter.start();
  const kids = new Set();
  const seen = {}; // per combo: SUMMARY line (from prefixed child output)
  // ONE vite for all children (they get E2E_URL): N vites cost N cold dep-optimizes + N x CPU under load.
  // OPT-IN (E2E_SHARED_VITE=1) until proven; default stays one vite per child.
  const ownUrl = process.env.E2E_URL || process.env.E2E_SHARED || !process.env.E2E_SHARED_VITE;
  const sharedOrigin = `http://127.0.0.1:${base}/`;
  // ONE Chrome too: each child opens its own isolated browser context (own localStorage) in it. OPT-IN: E2E_SHARED_CHROME=1.
  const ownChrome = process.env.E2E_CHROME_PORT || !process.env.E2E_SHARED_CHROME;
  const [, chrome] = await Promise.all([
    ownUrl ? null : startVite(base, sharedOrigin),
    ownChrome ? null : startChrome(),
  ]);
  // SIGTERM: a child's hook then kills its OWN vite + Chrome (SIGKILL orphaned 3 vites on 6620-6622 in Q4b)
  const killKids = () => kids.forEach((c) => c.kill('SIGTERM'));
  process.on('exit', killKids);
  setTimeout(() => {
    killKids();
    process.exit(2);
  }, 6 * 60e3).unref();
  const codes = await Promise.all(
    all.map(
      (combo, i) =>
        new Promise((done) => {
          const [vp, r] = combo.split(':');
          const c = spawn(process.execPath, [file], {
            stdio: prefix ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            env: {
              ...process.env,
              E2E_COMBO: combo,
              E2E_VP: vp,
              E2E_RENDERER: r,
              E2E_PORT: String(ownUrl ? base + i : base), // shared vite: every child's port = base (files that build their own URL from it)
              ...(ownUrl ? {} : { E2E_URL: sharedOrigin }),
              ...(chrome ? { E2E_CHROME_PORT: String(chrome.port) } : {}),
            },
          });
          kids.add(c);
          if (prefix)
            for (const [stream, sink] of [
              [c.stdout, process.stdout],
              [c.stderr, process.stderr],
            ]) {
              let buf = '';
              stream.on('data', (d) => {
                activity(`child ${combo}`);
                buf += d;
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const l of lines) {
                  sink.write(`[${combo}] ${l}\n`);
                  const sc = (seen[combo] ??= {});
                  if (/^SUMMARY:/.test(l)) sc.summary = l;
                  const m = /(GAME_READY_TIMEOUT|VITE_START_TIMEOUT)/.exec(l);
                  if (m) sc.boot = m[1];
                  if (/^FAIL \[[^\]]*\] budget /.test(l)) sc.budget = true;
                }
              });
              stream.on('end', () => buf && sink.write(`[${combo}] ${buf}\n`));
            }
          c.on('exit', (code) => done(code ?? 1));
        }),
    ),
  );
  const wall = Date.now() - t0;
  console.log(`[timing] parallel wall ${wall} ms for ${all.length} combos (${all.join(', ')})`);
  let code = Math.max(...codes);
  // Name EVERY reason for a non-zero exit, so "0 FAIL" + rc=1 can never be silent.
  const reasons = [];
  all.forEach((combo, i) => {
    const sc = seen[combo] ?? {};
    if (sc.boot) reasons.push(`${combo}: ${sc.boot} (combo never booted, no checks/shots)`);
    else if (codes[i] !== 0 && prefix && !sc.summary)
      reasons.push(
        `${combo}: child exit ${codes[i]} before any SUMMARY (crash/watchdog: exit 2 hard timeout, 3 global, 4 STUCK)`,
      );
    else if (codes[i] !== 0)
      reasons.push(
        `${combo}: child exit ${codes[i]} (${sc.summary ?? 'its own FAIL lines above'}${sc.budget ? '; includes its own BUDGET FAIL' : ''})`,
      );
  });
  if (budgetMs) {
    const v = budgetVerdict(wall, budgetMs, 'parallel', all.length);
    console.log(v.text);
    if (!v.ok) {
      code = Math.max(code, 1);
      reasons.push(`${reasons.length ? 'also ' : 'BUDGET ONLY (all checks passed): '}${v.text}`);
    }
  }
  console.log(`RESULT rc=${code}: ${reasons.length ? reasons.join(' | ') : 'all combos passed'}`);
  process.exit(code);
}
