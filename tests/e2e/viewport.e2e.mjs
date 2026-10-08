// Viewport re-measure e2e (dpr flips, orientation, window resizes) on ONE live page per child: after each change the
// root/canvas/camera re-measure, the Settings tab is on screen and tappable, and a visible tree tap walks there.
// Run: node tests/e2e/viewport.e2e.mjs (base port E2E_PORT or 9075).
// Fast base: two parallel children, ?tickMs=60, bounded waits instead of settle sleeps. The step chain is split so every
// old transition is still exercised: desktop child 1280@1 -> 1575@1.6 -> 1260@2 -> 390@3 mobile; phone child (boots at
// 390@2) -> 390@3 mobile -> 844x390 landscape -> 1280@1 back -> window 1000x600 -> window 1500x800, then the 10-flip
// listener-leak check. Tree taps use the isometric projection (lib tileClient), not the stale flat tile*32 maths.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT ?? 9075);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'], // here: which half of the step chain this child runs (see header)
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

// Counts live listeners (adds - removes) per target kind + type, to catch re-arm leaks.
const PAGE = `(() => {
  window.__L = {};
  const kind = (t) => t === window ? 'window' : t === window.visualViewport ? 'vv' : (typeof MediaQueryList !== 'undefined' && t instanceof MediaQueryList) ? 'mql' : null;
  const bump = (t, type, d) => { const k = kind(t); if (k) { const key = k + ':' + type; window.__L[key] = (window.__L[key] || 0) + d; } };
  const a = EventTarget.prototype.addEventListener, r = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, ...x) { bump(this, type, 1); return a.call(this, type, ...x); };
  EventTarget.prototype.removeEventListener = function (type, ...x) { bump(this, type, -1); return r.call(this, type, ...x); };
  window.__q = {
    r: (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; },
    vp: () => ({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, vvw: visualViewport.width, vvh: visualViewport.height }),
    canvas: () => { const c = document.querySelector('#game canvas'); const b = c.getBoundingClientRect(); const g = document.querySelector('#game').getBoundingClientRect(); const cam = window.__idleRpg.scene().camera; return { cw: c.width, ch: c.height, bw: b.width, bh: b.height, gw: g.width, gh: g.height, camw: cam.width, camh: cam.height }; },
    // true when root, canvas css box and camera/buffer all match (what the step asserts); used only as a bounded wait
    measured: () => { const v = window.__q.vp(), r = window.__q.r('#root'), c = window.__q.canvas();
      return Math.abs(r.w - v.iw) <= 1 && Math.abs(r.h - v.ih) <= 1 && Math.abs(c.bw - c.gw) <= 1 && Math.abs(c.bh - c.gh) <= 1 && Math.abs(c.camw - c.cw) <= 1 && Math.abs(c.camh - c.ch) <= 1; },
    tab: () => { const e = document.querySelector('button[aria-label="Settings"]'); if (!e) return null; const b = e.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; const top = document.elementFromPoint(cx, cy); return { l: b.left, t: b.top, r: b.right, b: b.bottom, cx, cy, ok: !!top && (top === e || e.contains(top)), top: top ? top.tagName + '.' + top.className : null }; },
    settingsOpen: () => !!document.querySelector('.settings'),
    listeners: () => ({ ...window.__L }),
    raf2: () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))),
  };
})();`;

const STEPS = {
  desktop: [
    { name: '1280x800@1', dpr: 1, w: 1280, h: 800, mobile: false },
    { name: '1575x840@1.6', dpr: 1.6, w: 1575, h: 840, mobile: false },
    { name: '1260x672@2', dpr: 2, w: 1260, h: 672, mobile: false },
    { name: '390x844@3 mobile', dpr: 3, w: 390, h: 844, mobile: true },
  ],
  phone: [
    { name: '390x844@3 mobile', dpr: 3, w: 390, h: 844, mobile: true },
    { name: '844x390@3 mobile (landscape)', dpr: 3, w: 844, h: 390, mobile: true },
    { name: '1280x800@1 (back)', dpr: 1, w: 1280, h: 800, mobile: false },
    { name: 'window 1000x600', win: [1000, 600], dpr: 1, w: 1280, h: 800, mobile: false },
    { name: 'window 1500x800', win: [1500, 800], dpr: 1, w: 1280, h: 800, mobile: false },
  ],
};
const BASE = { dpr: 1, w: 1280, h: 800, mobile: false };

const logErrors = []; // Log.entryAdded errors (lib's console check covers console.error + exceptions)
const run = forEachCombo(COMBOS, async (g, vp) => {
  const Q = (e) => g.eval(`window.__q.${e}`);
  let touch = false;
  const tap = async (x, y) => {
    if (touch) {
      await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await g.cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  const { windowId } = await g.cdp.send('Browser.getWindowForTarget');
  const setDevice = (s) =>
    g.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: s.w,
      height: s.h,
      deviceScaleFactor: s.dpr,
      mobile: s.mobile,
    });
  const usedTrees = new Set();

  const runStep = async (s) => {
    if (s.win) {
      await g.cdp.send('Emulation.clearDeviceMetricsOverride');
      await g.cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: 0, top: 0, width: s.win[0], height: s.win[1], windowState: 'normal' },
      });
    } else await setDevice(s);
    touch = s.mobile;
    await g.cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: s.mobile,
      maxTouchPoints: 5,
    });
    // was sleep 200 + 2x raf2 + sleep 150 (~0.5 s): two double-frames, then up to 500 ms for the re-measure
    await Q('raf2()');
    await Q('raf2()');
    await g.waitFor(() => Q('measured()'), { timeoutMs: 500 }).catch(() => {});
    const ev = [];
    const v = await Q('vp()');
    const root = await Q('r("#root")');
    expect(
      Math.abs(root.w - v.iw) <= 1 && Math.abs(root.h - v.ih) <= 1,
      `#root ${root.w}x${root.h} != viewport ${v.iw}x${v.ih}`,
    );
    ev.push(`vp ${v.iw}x${v.ih}@${v.dpr} root ok`);
    const c = await Q('canvas()');
    expect(
      Math.abs(c.bw - c.gw) <= 1 && Math.abs(c.bh - c.gh) <= 1,
      `canvas css ${c.bw}x${c.bh} vs #game ${c.gw}x${c.gh}`,
    );
    expect(
      Math.abs(c.camw - c.cw) <= 1 && Math.abs(c.camh - c.ch) <= 1,
      `camera ${c.camw}x${c.camh} vs canvas buffer ${c.cw}x${c.ch}`,
    );
    ev.push(`canvas css ${c.bw}x${c.bh} buf ${c.cw}x${c.ch}`);
    const tab = await Q('tab()');
    expect(tab, 'no Settings tab');
    expect(
      tab.l >= 0 && tab.t >= 0 && tab.r <= v.iw + 0.5 && tab.b <= v.ih + 0.5,
      `Settings tab outside viewport: ${JSON.stringify(tab)} vp ${v.iw}x${v.ih}`,
    );
    expect(tab.ok, `elementFromPoint at tab centre is ${tab.top}`);
    ev.push(`tab [${tab.l | 0},${tab.t | 0}..${tab.r | 0},${tab.b | 0}]`);
    await tap(tab.cx, tab.cy);
    // was a fixed 200 ms after the tap: same bound
    await g.waitFor(() => Q('settingsOpen()'), { timeoutMs: 500 }).catch(() => {});
    expect(await Q('settingsOpen()'), 'settings panel did not open on tap');
    await tap(tab.cx, tab.cy); // toggle closed
    await g.waitFor(async () => !(await Q('settingsOpen()')), { timeoutMs: 500 }).catch(() => {});
    if (await Q('settingsOpen()')) {
      await g.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
      });
      await g.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
      await g
        .waitFor(async () => !(await Q('settingsOpen()')), { timeoutMs: 1000 })
        .catch(() => {});
    }
    ev.push('settings opens');
    // tree tap: a visible tree (tap point on the canvas), not already used, nearest first, >= 3 tiles away if possible
    await g.settle(); // the follow camera may still be easing after the previous step's walk (stale tap points)
    const p0 = await g.state('movement.position');
    const trees = (await g.targets()).filter((t) => /tree/.test(t.kind));
    const cand = [];
    for (const t of trees) {
      const d = Math.max(Math.abs(t.x - p0.x), Math.abs(t.y - p0.y));
      if (d > 14) continue; // off-screen anyway; saves round trips
      const pt = await g.tileClient(t.x, t.y, -t.up / 2);
      if (pt.x < 0 || pt.y < 0 || pt.x > v.iw || pt.y > v.ih) continue;
      if (!(await g.page(`topIsCanvas(${pt.x}, ${pt.y})`))) continue;
      cand.push({ t, pt, d });
    }
    expect(cand.length > 0, 'no visible tree');
    cand.sort((a, b) => a.d - b.d);
    const fresh = cand.filter((x) => !usedTrees.has(x.t.id));
    const far = fresh.filter((x) => x.d >= 3);
    const pick = (far.length ? far : fresh.length ? fresh : cand)[0];
    usedTrees.add(pick.t.id);
    // re-sample right before the tap (canopies sway, the camera may still ease)
    await g.settle();
    const pt = await g.tileClient(pick.t.x, pick.t.y, -pick.t.up / 2);
    await tap(pt.x, pt.y);
    await g
      .waitFor(
        async () => {
          const p = await g.state('movement.position');
          return Math.max(Math.abs(p.x - pick.t.x), Math.abs(p.y - pick.t.y)) <= 1;
        },
        { timeoutMs: 15000, label: `walk to tree ${pick.t.id} (${pick.t.x},${pick.t.y})` },
      )
      .catch(async (e) => {
        const st = await g.state('');
        throw new Error(
          `${e.message}: tapped ${pt.x | 0},${pt.y | 0} (top ${await g.eval(`(() => { const e = document.elementFromPoint(${pt.x}, ${pt.y}); return e ? e.tagName + '.' + e.className : null; })()`)}), player ${JSON.stringify(st.movement.position)} path ${st.movement.path.length} pending ${JSON.stringify(st.pendingInteraction)} session ${JSON.stringify(st.gathering.session && st.gathering.session.nodeId)}`,
        );
      });
    const p1 = await g.state('movement.position');
    ev.push(`tree ${pick.t.id} d=${pick.d} walked (${p0.x},${p0.y})->(${p1.x},${p1.y})`);
    return ev.join('; ');
  };

  for (const s of STEPS[vp]) await check(s.name, `re-measure after ${s.name}`, () => runStep(s));

  if (vp === 'phone')
    await check('leak', '10 dpr flips: no listener leak', async () => {
      await g.cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: 0, top: 0, width: 1280, height: 800, windowState: 'normal' },
      });
      await setDevice(BASE);
      touch = false;
      await g.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
      await Q('raf2()');
      await Q('raf2()'); // was raf2 + 200 ms
      const before = await Q('listeners()');
      for (let i = 0; i < 10; i++) {
        await setDevice({ ...BASE, dpr: i % 2 ? 1 : 2 });
        await Q('raf2()');
      }
      await setDevice(BASE);
      await Q('raf2()');
      // was a fixed 300 ms: wait (<= 500 ms) until the canvas fills #game again
      await g
        .waitFor(
          async () => {
            const c = await Q('canvas()');
            return Math.abs(c.bw - c.gw) <= 1;
          },
          { timeoutMs: 500 },
        )
        .catch(() => {});
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
      return diff.join(', ');
    });

  await check('log', 'no Log.entryAdded errors (favicon ignored)', () => {
    const real = logErrors.filter((e) => !/favicon/.test(e));
    expect(real.length === 0, real.join(' | '));
    return `0 log errors (${logErrors.length - real.length} favicon ignored)`;
  });
});

await withGame({ port: PORT, budgetMs: BUDGET_MS }, async (g) => {
  // the listener spy must be in place before forEachCombo's fresh load (it counts adds/removes from boot)
  await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
  g.cdp.on((m) => {
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      logErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  await g.cdp.send('Log.enable');
  return run(g);
});
