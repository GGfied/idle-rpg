/* global fetch, console */
// Viewport re-measure e2e (dpr flips, orientation, window resizes). Own vite on :5184 (never 5173),
// fresh headless Chrome profile, CDP only. Run: node tests/e2e/viewport.e2e.mjs  Exit 0 = all pass.
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnTracked, killChild } from './cdp.mjs';

const PORT = 5184;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

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

// Counts live listeners (adds - removes) per target kind + type, to catch re-arm leaks.
const PAGE = `(() => {
  window.__L = {};
  const kind = (t) => t === window ? 'window' : t === window.visualViewport ? 'vv' : (typeof MediaQueryList !== 'undefined' && t instanceof MediaQueryList) ? 'mql' : null;
  const bump = (t, type, d) => { const k = kind(t); if (k) { const key = k + ':' + type; window.__L[key] = (window.__L[key] || 0) + d; } };
  const a = EventTarget.prototype.addEventListener, r = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, ...x) { bump(this, type, 1); return a.call(this, type, ...x); };
  EventTarget.prototype.removeEventListener = function (type, ...x) { bump(this, type, -1); return r.call(this, type, ...x); };
  window.__resizes = 0;
  const wait = () => { const g = window.__idleRpg; if (g) { try { const s = document.querySelector('#game canvas'); } catch {} } };
})();`;

const HELPERS = `window.__q = {
  ready: () => { try { const h = window.__idleRpg.scene(); return !!(h.camera && h.playerView && document.querySelector('#game canvas')); } catch { return false; } },
  r: (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; },
  vp: () => ({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, vvw: visualViewport.width, vvh: visualViewport.height }),
  canvas: () => { const c = document.querySelector('#game canvas'); const b = c.getBoundingClientRect(); const g = document.querySelector('#game').getBoundingClientRect(); const cam = window.__idleRpg.scene().camera; return { cw: c.width, ch: c.height, bw: b.width, bh: b.height, gw: g.width, gh: g.height, camw: cam.width, camh: cam.height }; },
  tab: () => { const e = document.querySelector('button[aria-label="Settings"]'); if (!e) return null; const b = e.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; const top = document.elementFromPoint(cx, cy); return { l: b.left, t: b.top, r: b.right, b: b.bottom, cx, cy, ok: !!top && (top === e || e.contains(top)), top: top ? top.tagName + '.' + top.className : null }; },
  settingsOpen: () => !!document.querySelector('.settings'),
  player: () => { const c = window.__idleRpg.scene().playerView.container; return { x: c.x, y: c.y }; },
  toClient: (wx, wy) => { const h = window.__idleRpg.scene(), cam = h.camera, v = cam.worldView, cv = document.querySelector('#game canvas'), r = cv.getBoundingClientRect(); return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
  top: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS'; },
  trees: async () => (await import('/src/features/world/index.ts')).TREE_SPAWNS,
  listeners: () => ({ ...window.__L }),
  raf2: () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))),
};`;

const STEPS = [
  { name: '1280x800@1', dpr: 1, w: 1280, h: 800, mobile: false },
  { name: '1575x840@1.6', dpr: 1.6, w: 1575, h: 840, mobile: false },
  { name: '1260x672@2', dpr: 2, w: 1260, h: 672, mobile: false },
  { name: '390x844@3 mobile', dpr: 3, w: 390, h: 844, mobile: true },
  { name: '844x390@3 mobile (landscape)', dpr: 3, w: 844, h: 390, mobile: true },
  { name: '1280x800@1 (back)', dpr: 1, w: 1280, h: 800, mobile: false },
  { name: 'window 1000x600', win: [1000, 600], dpr: 1, w: 1280, h: 800, mobile: false },
  { name: 'window 1500x800', win: [1500, 800], dpr: 1, w: 1280, h: 800, mobile: false },
];

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const errors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        'exception: ' +
          (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text),
      );
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
  });
  let failed = false;
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE + HELPERS });
    const Q = (e) => cdp.eval(`window.__q.${e}`);
    const waitFor = async (what, pred, ms = 20000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout: ' + what);
        await sleep(120);
      }
    };
    let touch = false;
    const tap = async (x, y) => {
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased'])
          await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
      await sleep(200);
    };
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    const setDevice = (s) =>
      cdp.send('Emulation.setDeviceMetricsOverride', {
        width: s.w,
        height: s.h,
        deviceScaleFactor: s.dpr,
        mobile: s.mobile,
      });

    await setDevice(STEPS[0]);
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('ready', () => Q('ready()').catch(() => false), 30000);
    await sleep(800);
    const usedTrees = new Set();

    const runStep = async (s) => {
      if (s.win) {
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await cdp.send('Browser.setWindowBounds', {
          windowId,
          bounds: { left: 0, top: 0, width: s.win[0], height: s.win[1], windowState: 'normal' },
        });
      } else {
        await setDevice(s);
      }
      touch = s.mobile;
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: s.mobile,
        maxTouchPoints: 5,
      });
      await sleep(200);
      await Q('raf2()');
      await Q('raf2()');
      await sleep(150);
      const ev = [];
      const vp = await Q('vp()');
      const root = await Q('r("#root")');
      expect(
        Math.abs(root.w - vp.iw) <= 1 && Math.abs(root.h - vp.ih) <= 1,
        `#root ${root.w}x${root.h} != viewport ${vp.iw}x${vp.ih}`,
      );
      ev.push(`vp ${vp.iw}x${vp.ih}@${vp.dpr} root ok`);
      const c = await Q('canvas()');
      expect(
        Math.abs(c.bw - c.gw) <= 1 && Math.abs(c.bh - c.gh) <= 1,
        `canvas css ${c.bw}x${c.bh} vs #game ${c.gw}x${c.gh}`,
      );
      expect(
        Math.abs(c.camw * 1 - c.cw) <= 1 && Math.abs(c.camh - c.ch) <= 1,
        `camera ${c.camw}x${c.camh} vs canvas buffer ${c.cw}x${c.ch}`,
      );
      ev.push(`canvas css ${c.bw}x${c.bh} buf ${c.cw}x${c.ch}`);
      let tab = await Q('tab()');
      expect(tab, 'no Settings tab');
      expect(
        tab.l >= 0 && tab.t >= 0 && tab.r <= vp.iw + 0.5 && tab.b <= vp.ih + 0.5,
        `Settings tab outside viewport: ${JSON.stringify(tab)} vp ${vp.iw}x${vp.ih}`,
      );
      expect(tab.ok, `elementFromPoint at tab centre is ${tab.top}`);
      ev.push(`tab [${tab.l | 0},${tab.t | 0}..${tab.r | 0},${tab.b | 0}]`);
      await tap(tab.cx, tab.cy);
      expect(await Q('settingsOpen()'), 'settings panel did not open on tap');
      await tap(tab.cx, tab.cy); // toggle closed
      if (await Q('settingsOpen()')) {
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Escape',
          code: 'Escape',
        });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
        await sleep(150);
      }
      ev.push('settings opens');
      // tree tap: choose a visible tree (trunk top element = canvas), not already used, nearest first
      const trees = await Q('trees()');
      const p0 = await Q('player()');
      const cand = [];
      for (const t of trees) {
        const wx = t.x * 32 + 16,
          wy = t.y * 32 + 16;
        const pt = await Q(`toClient(${wx}, ${wy})`);
        if (pt.x < 0 || pt.y < 0 || pt.x > vp.iw || pt.y > vp.ih) continue;
        if (!(await Q(`top(${pt.x}, ${pt.y})`))) continue;
        const d = Math.max(Math.abs(wx - p0.x), Math.abs(wy - p0.y)) / 32;
        cand.push({ t, pt, d });
      }
      expect(cand.length > 0, 'no visible tree');
      cand.sort((a, b) => a.d - b.d);
      const fresh = cand.filter((x) => !usedTrees.has(x.t.nodeId));
      const far = fresh.filter((x) => x.d >= 3);
      const pick = (far.length ? far : fresh.length ? fresh : cand)[0];
      usedTrees.add(pick.t.nodeId);
      await tap(pick.pt.x, pick.pt.y);
      await waitFor(
        `walk to tree ${pick.t.nodeId} (${pick.t.x},${pick.t.y})`,
        async () => {
          const p = await Q('player()');
          const dx = Math.abs(p.x / 32 - 0.5 - pick.t.x),
            dy = Math.abs(p.y / 32 - pick.t.y - 0.5);
          return Math.max(dx, dy) <= 1.6;
        },
        30000,
      );
      const p1 = await Q('player()');
      ev.push(
        `tree ${pick.t.nodeId} d=${pick.d.toFixed(1)} walked (${p0.x | 0},${p0.y | 0})->(${p1.x | 0},${p1.y | 0})`,
      );
      return ev.join('; ');
    };

    for (const s of STEPS) {
      try {
        results.push({ name: s.name, ok: true, ev: await runStep(s) });
      } catch (e) {
        results.push({ name: s.name, ok: false, ev: e.message });
        failed = true;
      }
    }

    // dpr flip listener-leak check
    try {
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: 0, top: 0, width: 1280, height: 800, windowState: 'normal' },
      });
      await setDevice(STEPS[0]);
      touch = false;
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
      await Q('raf2()');
      await sleep(200);
      const before = await Q('listeners()');
      for (let i = 0; i < 10; i++) {
        await setDevice({ ...STEPS[0], dpr: i % 2 ? 1 : 2 });
        await Q('raf2()');
      }
      await setDevice(STEPS[0]);
      await Q('raf2()');
      await sleep(300);
      const after = await Q('listeners()');
      const keys = ['window:resize', 'window:orientationchange', 'vv:resize', 'mql:change'];
      const diff = keys.map((k) => `${k} ${before[k] ?? 0}->${after[k] ?? 0}`);
      for (const k of keys)
        expect(
          (after[k] ?? 0) - (before[k] ?? 0) <= 0,
          `listener growth ${k}: ${before[k] ?? 0}->${after[k] ?? 0}`,
        );
      const c = await Q('canvas()');
      expect(Math.abs(c.bw - c.gw) <= 1, 'canvas not filling after flips');
      results.push({ name: '10 dpr flips: no listener leak', ok: true, ev: diff.join(', ') });
    } catch (e) {
      results.push({ name: '10 dpr flips: no listener leak', ok: false, ev: e.message });
      failed = true;
    }

    const real = errors.filter((e) => !/favicon/.test(e));
    results.push({
      name: 'no console errors',
      ok: real.length === 0,
      ev: real.join(' | ') || '0 errors',
    });
    if (real.length) failed = true;
  } finally {
    await cdp.close();
    killChild(vite);
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.ev}`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
