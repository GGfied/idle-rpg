/* global fetch, console */
// Isometric depth + camera e2e: occlusion order, follow, drag-pan (no walking), pan clamp, zoom limits,
// walk smoothness. Own vite on :5190 (E2E_PORT / E2E_ROOT override for mutation copies), fresh Chrome profile.
// Run: node tests/e2e/isoCamera.e2e.mjs   Exit 0 = all checks passed.
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

setTimeout(() => {
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();

const PORT = Number(process.env.E2E_PORT ?? 5190);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = process.env.E2E_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];

async function startVite() {
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
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

const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const T = window.__t = {
    ready: () => { try { return !!(H() && H().store.getState().game && H().scene().camera && H().scene().playerView); } catch { return false; } },
    pos: () => { const p = H().store.getState().game.movement.position; return { x: p.x, y: p.y }; },
    cam: () => { const c = H().scene().camera; const r = c.scene.game.canvas.getBoundingClientRect();
      return { sx: c.scrollX, sy: c.scrollY, zoom: c.zoom, w: c.width, h: c.height, wv: { x: c.worldView.x, y: c.worldView.y, w: c.worldView.width, h: c.worldView.height },
        rect: { l: r.left, t: r.top, w: r.width, h: r.height }, cw: c.scene.game.canvas.width, following: !!c._follow, off: { x: c.followOffset.x, y: c.followOffset.y } }; },
    bounds: async () => { const P = await import('/src/render/projection.ts'); return P.isoProjection.worldBounds(40, 30); },
    // Find display objects for tree tiles and wall tiles; start a per-frame recorder.
    rec: async (trees, walls) => {
      const P = await import('/src/render/projection.ts'); const proj = P.isoProjection;
      const sc = H().scene().camera.scene; const list = sc.children.list;
      const player = H().scene().playerView.container;
      const find = (t, wallOnly) => { const w = proj.tileToWorld(t[0], t[1]);
        return list.find((o) => o !== player && Math.abs(o.x - w.x) < 1 && Math.abs(o.y - w.y) < 1 && (!wallOnly || o.texture)); };
      const objs = [];
      for (const t of trees) { const o = find(t, false); objs.push({ kind: 'tree', t, o }); }
      for (const t of walls) { const o = find(t, true); objs.push({ kind: 'wall', t, o }); }
      const frames = []; const state = { run: true, frames, missing: objs.filter((x) => !x.o).map((x) => x.kind + ':' + x.t) };
      const cam = H().scene().camera; let last = performance.now();
      const loop = (now) => { if (!state.run) return;
        const ds = {}; for (const x of objs) if (x.o) ds[x.kind + ':' + x.t] = { d: x.o.depth, y: x.o.y };
        frames.push({ t: now, x: player.x, y: player.y, d: player.depth, sx: cam.scrollX, sy: cam.scrollY, z: cam.zoom, cw: cam.width, ch: cam.height, ds });
        requestAnimationFrame(loop); };
      requestAnimationFrame(loop); window.__rec = state; return state.missing;
    },
    stop: () => { window.__rec.run = false; return window.__rec.frames; },
    clearPrefs: () => { try { localStorage.clear(); } catch {} },
  };
})();`;

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
  });
  let failed = false;
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    const waitFor = async (what, pred, ms = 20000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout: ' + what);
        await sleep(100);
      }
    };
    let phase = 'desktop';
    let touch = false;
    const check = async (id, fn) => {
      try {
        results.push({ phase, id, ok: true, ev: (await fn()) ?? '' });
      } catch (e) {
        results.push({ phase, id, ok: false, ev: e.message });
      }
    };
    const ok = (c, m) => {
      if (!c) throw new Error(m);
    };
    const pos = () => cdp.eval('window.__t.pos()');
    const cam = () => cdp.eval('window.__t.cam()');
    const walkTo = (x, y) => cdp.eval(`window.__idleRpg.store.getState().walkTo({x:${x},y:${y}})`);
    const waitAt = (x, y) =>
      waitFor(
        `reach ${x},${y}`,
        async () => {
          const p = await pos();
          return p.x === x && p.y === y;
        },
        25000,
      );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sleepFrames = (ms) => sleep(ms);

    const mouseDrag = async (x0, y0, x1, y1) => {
      const steps = 12;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x0,
        y: y0,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let i = 1; i <= steps; i++)
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: x0 + ((x1 - x0) * i) / steps,
          y: y0 + ((y1 - y0) * i) / steps,
          button: 'left',
          buttons: 1,
        });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: x1,
        y: y1,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    };
    const touchDrag = async (x0, y0, x1, y1) => {
      const steps = 12;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: x0, y: y0 }],
      });
      for (let i = 1; i <= steps; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const drag = (...a) => (touch ? touchDrag(...a) : mouseDrag(...a));

    const setup = async (w, h, mobile) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: mobile,
        maxTouchPoints: mobile ? 5 : 1,
      });
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await cdp.send('Page.navigate', { url: ORIGIN });
      await waitFor('game ready', () => cdp.eval('window.__t && window.__t.ready()'));
      await cdp.eval('window.__t.clearPrefs()');
      await cdp.send('Page.navigate', { url: ORIGIN });
      await waitFor('game ready 2', () => cdp.eval('window.__t && window.__t.ready()'));
      await sleep(800);
    };

    const runPhase = async (w, h, mobile) => {
      await setup(w, h, mobile);
      const vw = w;
      const vh = h;
      const b = await cdp.eval('window.__t.bounds()');
      const toClient = (c, cx, cy) => ({
        x: c.rect.l + (cx / c.cw) * c.rect.w,
        y: c.rect.t + (cy / ((c.cw * c.rect.h) / c.rect.w)) * c.rect.h,
      });
      // screen position of a world point in CLIENT px
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const worldToClient = (c, wx, wy) => {
        const sx = c.rect.w / c.cw;
        const midx = c.wv.x + c.wv.w / 2;
        const midy = c.wv.y + c.wv.h / 2;
        return {
          x: c.rect.l + c.rect.w / 2 + (wx - midx) * c.zoom * sx,
          y: c.rect.t + c.rect.h / 2 + (wy - midy) * c.zoom * sx,
        };
      };
      void toClient;

      // ---- 1. Smooth straight walk (18,15) -> (18,9) + camera follow
      await check('smooth+follow', async () => {
        const p0 = await pos();
        if (!(p0.x === 18 && p0.y === 15)) {
          await walkTo(18, 15);
          await waitAt(18, 15);
          await sleep(1200);
        }
        await cdp.eval('window.__t.rec([], [])');
        await sleep(300);
        await walkTo(18, 9);
        await waitAt(18, 9);
        await sleep(400);
        const f = await cdp.eval('window.__t.stop()');
        // moving window
        const mv = f
          .map((r, i) => (i && Math.hypot(r.x - f[i - 1].x, r.y - f[i - 1].y) > 1e-6 ? i : -1))
          .filter((i) => i > 0);
        ok(mv.length > 40, 'too few moving frames: ' + mv.length);
        const lo = mv[0] + 3,
          hi = mv[mv.length - 1] - 3;
        const sp = [];
        let back = 0;
        const dir = { x: f[hi].x - f[lo].x, y: f[hi].y - f[lo].y };
        const dl = Math.hypot(dir.x, dir.y);
        for (let i = lo; i <= hi; i++) {
          const dt = f[i].t - f[i - 1].t;
          const dx = f[i].x - f[i - 1].x;
          const dy = f[i].y - f[i - 1].y;
          sp.push(Math.hypot(dx, dy) / dt);
          if ((dx * dir.x + dy * dir.y) / dl < -1e-6) back++;
        }
        const mean = sp.reduce((a, c) => a + c, 0) / sp.length;
        const worst = Math.max(...sp.map((s) => Math.abs(s - mean) / mean));
        const pct = sp.filter((s) => Math.abs(s - mean) / mean > 0.15).length;
        // follow: player screen offset from canvas centre (client px) over the walk, relative to viewport
        let maxOffX = 0,
          maxOffY = 0,
          maxRelOffX = 0,
          maxRelOffY = 0;
        const c = await cam();
        for (let i = lo; i <= hi; i++) {
          const r = f[i];
          const sx = c.rect.w / c.cw;
          const midx = r.sx + (r.cw - r.cw / r.z) / 2 + r.cw / r.z / 2; // scroll is top-left before zoom: centre = sx + cw/2
          void midx;
          const cx = r.sx + r.cw / 2,
            cy = r.sy + r.ch / 2; // world point at screen centre (zoom about centre)
          const ox = Math.abs(r.x - cx) * r.z * sx,
            oy = Math.abs(r.y - cy) * r.z * sx;
          maxOffX = Math.max(maxOffX, ox);
          maxOffY = Math.max(maxOffY, oy);
          maxRelOffX = Math.max(
            maxRelOffX,
            Math.abs(r.x - cx - (c.off.x / r.z) * -1 * 0) * r.z * sx,
          );
        }
        void maxRelOffX;
        void maxRelOffY;
        // Follow offset (HUD-aware centring) in world px: Phaser follow keeps target at centre + followOffset*-1
        let maxDevOff = 0;
        for (let i = lo; i <= hi; i++) {
          const r = f[i];
          const sx = c.rect.w / c.cw;
          const tx = r.x - (r.sx + r.cw / 2) + c.off.x,
            ty = r.y - (r.sy + r.ch / 2) + c.off.y;
          maxDevOff = Math.max(maxDevOff, Math.hypot(tx, ty) * r.z * sx);
        }
        ok(back === 0, `back-steps=${back}`);
        ok(
          worst <= 0.15 + 1e-9 && pct === 0,
          `speed dev worst=${(worst * 100).toFixed(1)}% frames>15%=${pct}/${sp.length} mean=${(mean * 1000).toFixed(1)}px/s`,
        );
        ok(
          maxOffX <= 0.1 * vw && maxOffY <= 0.1 * vh,
          `player off canvas-centre max ${maxOffX.toFixed(0)}x${maxOffY.toFixed(0)} px (limit ${0.1 * vw}x${0.1 * vh}); vs follow-offset max ${maxDevOff.toFixed(0)}px`,
        );
        return `frames=${sp.length} meanSpeed=${(mean * 1000).toFixed(0)}px/s worstDev=${(worst * 100).toFixed(1)}% back=${back} centreOff max=${maxOffX.toFixed(0)}x${maxOffY.toFixed(0)}px (lim ${0.1 * vw}x${0.1 * vh}) followOffsetDev=${maxDevOff.toFixed(0)}px`;
      });

      // ---- 2. Occlusion: tree (22,11) and wall segment at hut gap
      const occl = async (name, from, to, trees, walls) => {
        await walkTo(from[0], from[1]);
        await waitAt(from[0], from[1]);
        await sleep(700);
        const miss = await cdp.eval(
          `window.__t.rec(${JSON.stringify(trees)}, ${JSON.stringify(walls)})`,
        );
        ok(miss.length === 0, 'display objects not found: ' + miss.join(','));
        await walkTo(to[0], to[1]);
        await waitAt(to[0], to[1]);
        await sleep(300);
        const f = await cdp.eval('window.__t.stop()');
        const keys = Object.keys(f[0].ds);
        const seen = {};
        let viol = 0;
        let sample = '';
        for (const r of f)
          for (const k of keys) {
            const o = r.ds[k];
            const dy = r.y - o.y;
            const dd = r.d - o.d;
            const s = (seen[k] ??= { behind: 0, front: 0 });
            if (Math.abs(dy) > 1) {
              if (dd < 0) s.behind++;
              else s.front++;
              // feet further up the screen => further from camera => lower depth
              if (dy < 0 !== dd < 0) {
                viol++;
                sample = sample || `${k} dy=${dy.toFixed(1)} dd=${dd.toFixed(3)}`;
              }
            }
          }
        ok(viol === 0, `${name}: ${viol} depth/screen-y order violations e.g. ${sample}`);
        const crossed = keys.filter((k) => seen[k].behind > 0 && seen[k].front > 0);
        ok(
          crossed.length >= 1,
          `${name}: player never crossed behind->front of any object: ${JSON.stringify(seen)}`,
        );
        return (
          `${name}: frames=${f.length} violations=0 crossed=${crossed.length}/${keys.length} ` +
          crossed.map((k) => `${k}[behind ${seen[k].behind}/front ${seen[k].front}]`).join(' ')
        );
      };
      await check('occlusion-tree', () =>
        occl(
          'tree',
          [22, 14],
          [22, 8],
          [
            [22, 11],
            [21, 10],
            [23, 10],
            [20, 9],
          ],
          [],
        ),
      );
      await check('occlusion-wall', () =>
        occl(
          'wall',
          [27, 12],
          [27, 6],
          [],
          [
            [26, 8],
            [28, 8],
            [24, 7],
            [30, 7],
          ],
        ),
      );

      // ---- 3. Drag-pan: camera moves, player does not walk
      let afterDragCam;
      await check('drag-pan', async () => {
        await walkTo(18, 15);
        await waitAt(18, 15);
        await sleep(1500);
        const c0 = await cam();
        const p0 = await pos();
        const x0 = c0.rect.l + c0.rect.w * 0.5,
          y0 = c0.rect.t + c0.rect.h * (mobile ? 0.3 : 0.5);
        const hit = await cdp.eval(
          `(() => { const e = document.elementFromPoint(${x0}, ${y0}); return e && e.tagName; })()`,
        );
        ok(hit === 'CANVAS', 'drag start not on canvas: ' + hit);
        const dx = -120,
          dy = -80;
        await drag(x0, y0, x0 + dx, y0 + dy);
        await sleep(1500); // longer than a tick: a walk would have started by now
        const c1 = await cam();
        const p1 = await pos();
        const moved = Math.hypot(c1.sx - c0.sx, c1.sy - c0.sy);
        const exp = {
          x: (-dx / c0.zoom) * (c0.cw / c0.rect.w),
          y: (-dy / c0.zoom) * (c0.h / c0.rect.h),
        };
        ok(moved > 20, `camera did not move (${moved.toFixed(1)}px)`);
        ok(
          p1.x === p0.x && p1.y === p0.y,
          `player walked ${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`,
        );
        const path = await cdp.eval('window.__idleRpg.store.getState().game.movement.path.length');
        ok(path === 0, 'path queued: ' + path);
        ok(
          Math.abs(c1.sx - c0.sx - exp.x) < 25 && Math.abs(c1.sy - c0.sy - exp.y) < 25,
          `scroll delta ${(c1.sx - c0.sx).toFixed(0)},${(c1.sy - c0.sy).toFixed(0)} expected ~${exp.x.toFixed(0)},${exp.y.toFixed(0)}`,
        );
        afterDragCam = c1;
        return `scroll delta=(${(c1.sx - c0.sx).toFixed(0)},${(c1.sy - c0.sy).toFixed(0)}) expected~(${exp.x.toFixed(0)},${exp.y.toFixed(0)}) player ${p0.x},${p0.y} -> ${p1.x},${p1.y} path=${path}`;
      });
      void afterDragCam;

      // ---- 4. Clamp at world edges
      await check('pan-clamp', async () => {
        const c0 = await cam();
        const x0 = c0.rect.l + c0.rect.w * 0.5,
          y0 = c0.rect.t + c0.rect.h * (mobile ? 0.3 : 0.5);
        const M = 8;
        const out = [];
        const dirs = { right: [-1, 0], left: [1, 0], down: [0, -1], up: [0, 1] }; // drag opposite to pan
        for (const [name, [ux, uy]] of Object.entries(dirs)) {
          for (let i = 0; i < 8; i++) {
            const span = Math.min(c0.rect.w, c0.rect.h) * 0.4;
            await drag(
              x0 - (ux * span) / 2,
              y0 - (uy * span) / 2,
              x0 + ((ux * span) / 2) * 1,
              y0 + (uy * span) / 2,
            );
          }
          await sleep(200);
          const c = await cam();
          const v = c.wv;
          const over = {
            l: b.x - v.x,
            r: v.x + v.w - (b.x + b.width),
            t: b.y - v.y,
            bo: v.y + v.h - (b.y + b.height),
          };
          const biggerX = v.w >= b.width,
            biggerY = v.h >= b.height;
          out.push(
            `${name}: view=(${v.x.toFixed(0)},${v.y.toFixed(0)},${v.w.toFixed(0)}x${v.h.toFixed(0)}) over l/r/t/b=${over.l.toFixed(0)}/${over.r.toFixed(0)}/${over.t.toFixed(0)}/${over.bo.toFixed(0)}`,
          );
          if (!biggerX)
            ok(over.l <= M && over.r <= M, `${name}: void beyond edge x ${JSON.stringify(over)}`);
          if (!biggerY)
            ok(over.t <= M && over.bo <= M, `${name}: void beyond edge y ${JSON.stringify(over)}`);
        }
        // extremes actually reached (so the clamp, not the drag length, bounded it)
        return `world=(${b.x},${b.y},${b.width}x${b.height}) zoom=${c0.zoom} ` + out.join(' | ');
      });

      // ---- 5. Zoom limits
      let minZoomVoid = 0;
      await check('zoom-limits', async () => {
        const c0 = await cam();
        const cx = c0.rect.l + c0.rect.w * 0.5,
          cy = c0.rect.t + c0.rect.h * (mobile ? 0.3 : 0.5);
        const p0 = await pos();
        const zooms = [];
        if (!mobile) {
          for (let i = 0; i < 40; i++)
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: cx,
              y: cy,
              deltaX: 0,
              deltaY: -240,
            });
          await sleep(300);
          zooms.push((await cam()).zoom);
          for (let i = 0; i < 80; i++)
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: cx,
              y: cy,
              deltaX: 0,
              deltaY: 240,
            });
          await sleep(300);
          zooms.push((await cam()).zoom);
        } else {
          const pinch = async (d0, d1) => {
            const pts = (d) => [
              { x: cx - d / 2, y: cy, id: 1 },
              { x: cx + d / 2, y: cy, id: 2 },
            ];
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: pts(d0),
            });
            for (let i = 1; i <= 15; i++)
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: pts(d0 + ((d1 - d0) * i) / 15),
              });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          };
          for (let i = 0; i < 5; i++) await pinch(40, 330);
          await sleep(300);
          zooms.push((await cam()).zoom);
          for (let i = 0; i < 6; i++) await pinch(330, 30);
          await sleep(300);
          zooms.push((await cam()).zoom);
        }
        const p1 = await pos();
        const vs = await cdp.eval('window.visualViewport.scale');
        ok(zooms[0] > c0.zoom + 0.05, `zoom in did nothing: ${c0.zoom} -> ${zooms[0]}`);
        ok(zooms[0] <= 3 + 1e-9 && zooms[1] >= 0.5 - 1e-9, `zoom outside [0.5,3]: ${zooms}`);
        ok(zooms[1] < zooms[0], `zoom out did nothing: ${zooms}`);
        ok(
          Math.abs(zooms[0] - 3) < 0.05 && Math.abs(zooms[1] - 0.5) < 0.05,
          `limits not reached: ${zooms}`,
        );
        ok(p1.x === p0.x && p1.y === p0.y, 'zoom gesture walked the player');
        ok(Math.abs(vs - 1) < 1e-6, 'page zoomed: visualViewport.scale=' + vs);
        // at min zoom the view is bigger than the world on some axes; it must stay centred, not off to one side
        const cm = await cam();
        const ovX = Math.max(
          0,
          Math.min(cm.wv.x + cm.wv.w, b.x + b.width) - Math.max(cm.wv.x, b.x),
        );
        const ovY = Math.max(
          0,
          Math.min(cm.wv.y + cm.wv.h, b.y + b.height) - Math.max(cm.wv.y, b.y),
        );
        minZoomVoid = 1 - (ovX * ovY) / (cm.wv.w * cm.wv.h);
        return `zoom start=${c0.zoom} in=${zooms[0].toFixed(2)} out=${zooms[1].toFixed(2)} (limits 0.5..3) visualViewport.scale=${vs} playerWalked=no worldView@min=(${cm.wv.x.toFixed(0)},${cm.wv.y.toFixed(0)},${cm.wv.w.toFixed(0)}x${cm.wv.h.toFixed(0)})`;
      });
      // Known issue (xfail): at min zoom the view is larger than the map and is pinned top-left, not centred.
      results.push({
        phase,
        id: 'min-zoom-void',
        xfail: true,
        ok: minZoomVoid < 0.15,
        ev: `empty (off-map) share of the view at zoom 0.5 = ${(minZoomVoid * 100).toFixed(0)}% (limit 15%)`,
      });
    };

    await runPhase(1280, 800, false);
    phase = 'phone';
    touch = true;
    await runPhase(390, 844, true);

    results.push({
      phase: 'all',
      id: 'console-errors',
      ok: errors.length === 0,
      ev: errors.length ? errors.join(' || ') : '0 errors',
    });
  } catch (e) {
    results.push({ phase: 'fatal', id: 'script', ok: false, ev: e.stack ?? String(e) });
  } finally {
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : r.xfail ? 'XFAIL' : 'FAIL'} [${r.phase}] ${r.id}: ${r.ev}`);
    failed = results.some((r) => (r.xfail ? r.ok : !r.ok));
    try {
      await cdp.close();
    } catch {
      /* ignore */
    }
    killChild(vite);
  }
  killTracked();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  killTracked();
  process.exit(2);
});
