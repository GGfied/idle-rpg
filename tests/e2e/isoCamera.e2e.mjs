// Isometric depth + camera e2e: occlusion order, follow, drag-pan (no walking), pan clamp, zoom limits,
// walk smoothness. FAST BASE: desktop + phone as parallel children, wait-on-state instead of sleeps.
// Smoothness is measured on the clock the scene itself uses: main.tsx alpha() = frameAlpha(ticker, performance.now()) at
// the scene's update. The recorder hooks the scene's own `update`/`render` events and stamps performance.now() at
// `update` (the old script paired a separate rAF timestamp with positions the scene had placed earlier in the frame;
// under CPU load that mismatch alone gave 15-20 % "speed deviation").
// Run: node tests/e2e/isoCamera.e2e.mjs   Exit 0 = all checks passed.
/* global console */
import process from 'node:process';
import { check as check0, expect, forEachCombo, runParallel, waitStill, withGame } from './lib.mjs';

// E2E_TIMING=1 prints each check's wall time.
let tPrev = Date.now();
const check = async (id, title, fn) => {
  await check0(id, title, fn);
  if (process.env.E2E_TIMING) console.log(`[timing] ${id} ${Date.now() - tPrev} ms`);
  tPrev = Date.now();
};

const PORT = 7851;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const PAGE_T = `(() => {
  const H = () => window.__idleRpg;
  const T = window.__t = {
    pos: () => { const p = H().store.getState().game.movement.position; return { x: p.x, y: p.y }; },
    cam: () => { const c = H().scene().camera; const r = c.scene.game.canvas.getBoundingClientRect();
      return { sx: c.scrollX, sy: c.scrollY, zoom: c.zoom, w: c.width, h: c.height, wv: { x: c.worldView.x, y: c.worldView.y, w: c.worldView.width, h: c.worldView.height },
        rect: { l: r.left, t: r.top, w: r.width, h: r.height }, cw: c.scene.game.canvas.width, off: { x: c.followOffset.x, y: c.followOffset.y } }; },
    bounds: async () => { const P = await import('/src/render/projection.ts'); return P.isoProjection.worldBounds(128, 96); },
    centreTile: async () => { const P = await import('/src/render/projection.ts'); const c = H().scene().camera; const v = c.worldView; const bb = P.isoProjection.worldBounds(128, 96);
      const cx = v.x + v.width / 2, cy = v.y + v.height / 2; const t = P.isoProjection.worldToTile(cx, cy);
      return { tx: t.tx, ty: t.ty, k: Math.abs(cx - (bb.x + bb.width / 2)) / (bb.width / 2) + Math.abs(cy - (bb.y + bb.height / 2)) / (bb.height / 2) }; },
    // Per-frame recorder on the scene's own events: t = performance.now() at the scene's update (the clock alpha() reads),
    // rt = wall clock at the render event (diagnostic only).
    rec: async (trees, walls) => {
      const P = await import('/src/render/projection.ts'); const proj = P.isoProjection;
      const sc = H().scene().camera.scene; const list = sc.children.list;
      const player = H().scene().playerView.container;
      const find = (t, wallOnly) => { const w = proj.tileToWorld(t[0], t[1]);
        return list.find((o) => o !== player && Math.abs(o.x - w.x) < 1 && Math.abs(o.y - w.y) < 1 && (!wallOnly || o.texture)); };
      const objs = [];
      for (const t of trees) objs.push({ kind: 'tree', t, o: find(t, false) });
      for (const t of walls) objs.push({ kind: 'wall', t, o: find(t, true) });
      const cam = H().scene().camera; const frames = []; let lt = 0;
      const onU = () => { lt = performance.now(); };
      const onR = () => { const ds = {}; for (const x of objs) if (x.o) ds[x.kind + ':' + x.t] = { d: x.o.depth, y: x.o.y };
        frames.push({ t: lt, rt: performance.now(), x: player.x, y: player.y, d: player.depth, sx: cam.scrollX, sy: cam.scrollY, z: cam.zoom, cw: cam.width, ch: cam.height, ds }); };
      sc.events.on('update', onU); sc.events.on('render', onR);
      window.__rec = { frames, off: () => { sc.events.off('update', onU); sc.events.off('render', onR); } };
      return objs.filter((x) => !x.o).map((x) => x.kind + ':' + x.t);
    },
    stop: () => { window.__rec.off(); return window.__rec.frames; },
  };
})();`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g) => {
    const mobile = g.touch;
    const vw = mobile ? 390 : 1280;
    const vh = mobile ? 844 : 800;
    await g.eval(PAGE_T);
    const pos = () => g.eval('window.__t.pos()');
    const cam = () => g.eval('window.__t.cam()');
    const waitAt = (x, y) =>
      g.waitFor(
        async () => {
          const p = await pos();
          return p.x === x && p.y === y;
        },
        { timeoutMs: 25000, label: `reach ${x},${y}` },
      );
    // Real mouse / touch drag and wheel/pinch events, without the harness's per-step wall-clock sleeps.
    const send = (type, x, y, extra = {}) =>
      mobile
        ? g.cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y, ...extra }],
          })
        : g.cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            button: 'left',
            buttons: type === 'mouseReleased' ? 0 : 1,
            clickCount: 1,
          });
    const drag = async (x0, y0, x1, y1, steps = 12) => {
      if (!mobile)
        await g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await send(mobile ? 'touchStart' : 'mousePressed', x0, y0);
      for (let i = 1; i <= steps; i++)
        await send(
          mobile ? 'touchMove' : 'mouseMoved',
          x0 + ((x1 - x0) * i) / steps,
          y0 + ((y1 - y0) * i) / steps,
        );
      await send(mobile ? 'touchEnd' : 'mouseReleased', x1, y1);
    };
    const panDrag = (x0, y0, x1, y1) => drag(x0, y0, x1, y1, 4);
    const settleCam = () =>
      waitStill(
        async () => {
          const c = await cam();
          return { x: c.sx + c.zoom * 1000, y: c.sy };
        },
        { intervalMs: 60 },
      );
    const b = await g.eval('window.__t.bounds()');

    // ---- 1. Smooth straight walk (18,15) -> (18,9) + camera follow. Real 600 ms ticks: smoothness is what's tested.
    await check(
      'smooth+follow',
      'straight walk is smooth (update-time clock), camera follows',
      async () => {
        const p0 = await pos();
        if (!(p0.x === 18 && p0.y === 15)) await g.teleportSettled(18, 15);
        await g.eval('window.__t.rec([], [])');
        await g.realTime(async () => {
          await g.walkTo(18, 9);
          await waitAt(18, 9);
        });
        const f = await g.eval('window.__t.stop()');
        const mv = f
          .map((r, i) => (i && Math.hypot(r.x - f[i - 1].x, r.y - f[i - 1].y) > 1e-6 ? i : -1))
          .filter((i) => i > 0);
        expect(mv.length > 40, 'too few moving frames: ' + mv.length);
        const lo = mv[0] + 3;
        const hi = mv[mv.length - 1] - 3;
        const sp = [];
        const rsp = [];
        let back = 0;
        let backInfo = '';
        const dir = { x: f[hi].x - f[lo].x, y: f[hi].y - f[lo].y };
        const dl = Math.hypot(dir.x, dir.y);
        for (let i = lo; i <= hi; i++) {
          const dx = f[i].x - f[i - 1].x;
          const dy = f[i].y - f[i - 1].y;
          sp.push(Math.hypot(dx, dy) / (f[i].t - f[i - 1].t));
          rsp.push(Math.hypot(dx, dy) / (f[i].rt - f[i - 1].rt));
          if ((dx * dir.x + dy * dir.y) / dl < -1e-6) {
            back++;
            backInfo ||= `frame ${i - lo}/${hi - lo}: step ${((dx * dir.x + dy * dir.y) / dl).toFixed(2)} px (tile ~74 px), dt ${(f[i].t - f[i - 1].t).toFixed(1)} ms, prev dt ${(f[i - 1].t - f[i - 2].t).toFixed(1)} ms`;
          }
        }
        const dev = (a) => {
          const mean = a.reduce((s, v) => s + v, 0) / a.length;
          return {
            mean,
            worst: Math.max(...a.map((s) => Math.abs(s - mean) / mean)),
            n15: a.filter((s) => Math.abs(s - mean) / mean > 0.15).length,
          };
        };
        const d = dev(sp);
        const rd = dev(rsp);
        const c = await cam();
        const scl = c.rect.w / c.cw;
        let maxOffX = 0;
        let maxOffY = 0;
        let maxDevOff = 0;
        for (let i = lo; i <= hi; i++) {
          const r = f[i];
          maxOffX = Math.max(maxOffX, Math.abs(r.x - (r.sx + r.cw / 2)) * r.z * scl);
          maxOffY = Math.max(maxOffY, Math.abs(r.y - (r.sy + r.ch / 2)) * r.z * scl);
          maxDevOff = Math.max(
            maxDevOff,
            Math.hypot(r.x - (r.sx + r.cw / 2) + c.off.x, r.y - (r.sy + r.ch / 2) + c.off.y) *
              r.z *
              scl,
          );
        }
        const info = `frames=${sp.length} meanSpeed=${(d.mean * 1000).toFixed(0)}px/s worstDev=${(d.worst * 100).toFixed(1)}% (wall-clock diag ${(rd.worst * 100).toFixed(1)}% ${rd.n15}/${rsp.length} >15%) back=${back} centreOff max=${maxOffX.toFixed(0)}x${maxOffY.toFixed(0)}px (lim ${0.1 * vw}x${0.1 * vh}) followOffsetDev=${maxDevOff.toFixed(0)}px`;
        expect(back === 0, `back-steps=${back}: ${backInfo}`);
        expect(d.worst <= 0.15 + 1e-9 && d.n15 === 0, `speed dev ${info}`);
        expect(maxOffX <= 0.1 * vw && maxOffY <= 0.1 * vh, `player off canvas-centre ${info}`);
        return info;
      },
    );

    // ---- 2. Occlusion: tree (22,11) and wall segment at hut gap (150 ms ticks: ~50 frames per walk, still sampled every frame)
    const occl = async (name, from, to, trees, walls) => {
      await g.teleportSettled(from[0], from[1]);
      const miss = await g.eval(
        `window.__t.rec(${JSON.stringify(trees)}, ${JSON.stringify(walls)})`,
      );
      expect(miss.length === 0, 'display objects not found: ' + miss.join(','));
      await g.setTickMs(150);
      await g.walkTo(to[0], to[1]);
      await waitAt(to[0], to[1]);
      await g.setTickMs(60);
      const f = await g.eval('window.__t.stop()');
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
      expect(viol === 0, `${name}: ${viol} depth/screen-y order violations e.g. ${sample}`);
      const crossed = keys.filter((k) => seen[k].behind > 0 && seen[k].front > 0);
      expect(
        crossed.length >= 1,
        `${name}: player never crossed behind->front of any object: ${JSON.stringify(seen)}`,
      );
      return `${name}: frames=${f.length} violations=0 crossed=${crossed.length}/${keys.length} ${crossed.map((k) => `${k}[behind ${seen[k].behind}/front ${seen[k].front}]`).join(' ')}`;
    };
    await check('occlusion-tree', 'player depth vs trees follows screen y', () =>
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
    await check('occlusion-wall', 'player depth vs wall segments follows screen y', () =>
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
    await check('drag-pan', 'drag pans the camera and never walks the player', async () => {
      await g.teleportSettled(18, 15);
      const c0 = await cam();
      const p0 = await pos();
      const x0 = c0.rect.l + c0.rect.w * 0.5;
      const y0 = c0.rect.t + c0.rect.h * (mobile ? 0.3 : 0.5);
      const hit = await g.eval(
        `(() => { const e = document.elementFromPoint(${x0}, ${y0}); return e && e.tagName; })()`,
      );
      expect(hit === 'CANVAS', 'drag start not on canvas: ' + hit);
      const dx = -120;
      const dy = -80;
      await drag(x0, y0, x0 + dx, y0 + dy);
      await g.waitTicks(6); // at 60 ms ticks a walk would have started within 2: 6 ticks proves it did not
      await settleCam();
      const c1 = await cam();
      const p1 = await pos();
      const moved = Math.hypot(c1.sx - c0.sx, c1.sy - c0.sy);
      const exp = {
        x: (-dx / c0.zoom) * (c0.cw / c0.rect.w),
        y: (-dy / c0.zoom) * (c0.h / c0.rect.h),
      };
      expect(moved > 20, `camera did not move (${moved.toFixed(1)}px)`);
      expect(
        p1.x === p0.x && p1.y === p0.y,
        `player walked ${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`,
      );
      const path = await g.state('movement.path.length');
      expect(path === 0, 'path queued: ' + path);
      expect(
        Math.abs(c1.sx - c0.sx - exp.x) < 25 && Math.abs(c1.sy - c0.sy - exp.y) < 25,
        `scroll delta ${(c1.sx - c0.sx).toFixed(0)},${(c1.sy - c0.sy).toFixed(0)} expected ~${exp.x.toFixed(0)},${exp.y.toFixed(0)}`,
      );
      return `scroll delta=(${(c1.sx - c0.sx).toFixed(0)},${(c1.sy - c0.sy).toFixed(0)}) expected~(${exp.x.toFixed(0)},${exp.y.toFixed(0)}) player ${p0.x},${p0.y} -> ${p1.x},${p1.y} path=${path}`;
    });

    // ---- 4. Clamp at world edges (zoom 1.5, from spawn, edges in ring order so each leg is short)
    await check(
      'pan-clamp',
      'pan clamps with the view centre on the map diamond, edge reached',
      async () => {
        const c0 = await cam();
        // Mid-canvas start: the old 0.7 span from 0.3 h started ABOVE the phone canvas, so the 'up' drag never happened and
        // 'up' silently reused the 'down' edge (k >= 0.95 still held). Each edge must now differ from the previous one.
        const x0 = c0.rect.l + c0.rect.w * 0.5;
        const y0 = c0.rect.t + c0.rect.h * 0.5;
        const out = [];
        let prev = null;
        const dirs = { right: [-1, 0], down: [0, -1], left: [1, 0], up: [0, 1] }; // drag opposite to pan
        for (const [name, [ux, uy]] of Object.entries(dirs)) {
          const span = ux ? c0.rect.w * 0.8 : c0.rect.h * 0.5;
          for (const [px, py] of [
            [x0 - (ux * span) / 2, y0 - (uy * span) / 2],
            [x0 + (ux * span) / 2, y0 + (uy * span) / 2],
          ])
            expect(
              await g.eval(`window.__e.topIsCanvas(${px}, ${py})`),
              `${name}: drag point ${px | 0},${py | 0} not on canvas`,
            );
          // Batches of 3 drags (no settle: the pan follows the pointer directly), read the centre after each batch and stop once it
          // is on the diamond edge (max 36 drags); then 3 overshoot drags prove the clamp still holds.
          const dragOnce = () =>
            panDrag(
              x0 - (ux * span) / 2,
              y0 - (uy * span) / 2,
              x0 + (ux * span) / 2,
              y0 + (uy * span) / 2,
            );
          let c = null;
          for (let batch = 0; batch < 12 && !(c && c.k >= 0.97); batch++) {
            for (let i = 0; i < 3; i++) await dragOnce();
            c = await g.eval('window.__t.centreTile()');
          }
          for (let i = 0; i < 3; i++) await dragOnce();
          await settleCam();
          // The world is a 128x96 iso diamond and the clamp keeps the view CENTRE on the map, so assert the centre tile.
          const ct = await g.eval('window.__t.centreTile()');
          out.push(`${name}: centre tile=(${ct.tx.toFixed(1)},${ct.ty.toFixed(1)})`);
          expect(
            !prev || Math.hypot(ct.tx - prev.tx, ct.ty - prev.ty) > 5,
            `${name}: centre tile did not move from the previous edge (${ct.tx.toFixed(1)},${ct.ty.toFixed(1)}): the pan never happened`,
          );
          prev = ct;
          expect(
            ct.k <= 1.01,
            `${name}: view centre off the map diamond: k=${ct.k.toFixed(3)} (tile ${ct.tx.toFixed(1)},${ct.ty.toFixed(1)})`,
          );
          // Edge reached: drags stop as soon as the centre is on the diamond edge (k >= 0.97), then 3 more overshoot drags: the
          // clamp must hold (k <= 1.01 above) and the centre stay at the edge (k >= 0.95 below, the original threshold).
          expect(
            ct.k >= 0.95,
            `${name}: never reached the map edge (k=${ct.k.toFixed(3)}, centre tile ${ct.tx.toFixed(1)},${ct.ty.toFixed(1)})`,
          );
        }
        return `world=(${b.x},${b.y},${b.width}x${b.height}) zoom=${c0.zoom} ` + out.join(' | ');
      },
    );

    // ---- 5. Zoom limits
    let minZoomVoid = 0;
    await check(
      'zoom-limits',
      'zoom clamps to [0.5..3], gesture never walks or page-zooms',
      async () => {
        const c0 = await cam();
        const cx = c0.rect.l + c0.rect.w * 0.5;
        const cy = c0.rect.t + c0.rect.h * (mobile ? 0.3 : 0.5);
        const p0 = await pos();
        const zooms = [];
        if (!mobile) {
          const wheel = (dy) =>
            g.cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: cx,
              y: cy,
              deltaX: 0,
              deltaY: dy,
            });
          for (let i = 0; i < 40; i++) await wheel(-240);
          await settleCam();
          zooms.push((await cam()).zoom);
          for (let i = 0; i < 80; i++) await wheel(240);
          await settleCam();
          zooms.push((await cam()).zoom);
        } else {
          const pinch = async (d0, d1) => {
            const pts = (d) => [
              { x: cx - d / 2, y: cy, id: 1 },
              { x: cx + d / 2, y: cy, id: 2 },
            ];
            await g.cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: pts(d0),
            });
            for (let i = 1; i <= 15; i++)
              await g.cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: pts(d0 + ((d1 - d0) * i) / 15),
              });
            await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          };
          for (let i = 0; i < 5; i++) await pinch(40, 330);
          await settleCam();
          zooms.push((await cam()).zoom);
          for (let i = 0; i < 6; i++) await pinch(330, 30);
          await settleCam();
          zooms.push((await cam()).zoom);
        }
        const p1 = await pos();
        const vs = await g.eval('window.visualViewport.scale');
        expect(zooms[0] > c0.zoom + 0.05, `zoom in did nothing: ${c0.zoom} -> ${zooms[0]}`);
        expect(zooms[0] <= 3 + 1e-9 && zooms[1] >= 0.5 - 1e-9, `zoom outside [0.5,3]: ${zooms}`);
        expect(zooms[1] < zooms[0], `zoom out did nothing: ${zooms}`);
        // Max is fixed at 3; the floor is dynamic (minZoomForWindow keeps the loaded chunk window filled): 0.5..0.75.
        expect(Math.abs(zooms[0] - 3) < 0.05 && zooms[1] < 0.75, `limits not reached: ${zooms}`);
        expect(p1.x === p0.x && p1.y === p0.y, 'zoom gesture walked the player');
        expect(Math.abs(vs - 1) < 1e-6, 'page zoomed: visualViewport.scale=' + vs);
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
      },
    );
    await check('min-zoom-void', 'off-map share of the view at min zoom < 15%', () => {
      expect(minZoomVoid < 0.15, `empty share ${(minZoomVoid * 100).toFixed(0)}% (limit 15%)`);
      return `empty (off-map) share of the view at min zoom = ${(minZoomVoid * 100).toFixed(0)}% (limit 15%)`;
    });
  }),
);
