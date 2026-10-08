import process from 'node:process';
// ISO-1: at minimum zoom the view stays filled (no clear-colour / black band) everywhere: centre, map corners,
// chunk borders, pan limits, after zooming back in (tap still lands) and after a window resize.
import { check, expect, forEachCombo, runParallel, waitStill, withGame } from './lib.mjs';

// Fast base: desktop + phone as parallel children (own port each), 60 ms ticks, wait-on-state instead of fixed sleeps.
const PORT = 7855;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

// A band counts only where the pixel maps INSIDE the 128x96 world (margin 1 tile): beyond the world's own
// edge a rectangular view must show void (the map is a diamond), that is reported as `out`, not failed.
const SCAN = `window.__scan = async () => { const { isoProjection } = await import('/src/render/projection.ts');
  const game = window.__idleRpg.scene().camera.scene.game;
  const img = await new Promise((ok) => game.renderer.snapshot((i) => { if (i.complete) ok(i); else i.onload = () => ok(i); }));
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const cv = document.querySelector('canvas:not(.minimap)'); const r = cv.getBoundingClientRect(); const kx = img.width / r.width, ky = img.height / r.height;
  const cam = window.__idleRpg.scene().camera, v = cam.worldView;
  const x0 = Math.max(0, Math.ceil(r.left)), x1 = Math.min(window.innerWidth - 1, Math.floor(r.right) - 1), y0 = Math.max(0, Math.ceil(r.top)), y1 = Math.min(window.innerHeight - 1, Math.floor(r.bottom) - 1);
  const xs = [], ys = []; for (let q = x0; q <= x1; q += 5) xs.push(q); xs.push(x1); for (let q = y0; q <= y1; q += 5) ys.push(q); ys.push(y1);
  let n = 0, inW = 0, out = 0, clear = 0, black = 0; const rows = new Set(); const pts = [];
  // elementFromPoint is slow: probe 5 points per 20px cell, test per sample only in cells that straddle the HUD.
  const cell = new Map(); const isCv = (px, py) => document.elementFromPoint(px, py) === cv;
  const cellOk = (px, py) => { const cx = Math.floor(px / 20), cy = Math.floor(py / 20), k = cx * 1e5 + cy; let v = cell.get(k);
    if (v === undefined) { const a = cx * 20, b = cy * 20; const q = [[a, b], [a + 19, b], [a, b + 19], [a + 19, b + 19], [a + 10, b + 10]].map(([u, w]) => isCv(Math.min(u, window.innerWidth - 1), Math.min(w, window.innerHeight - 1)));
      v = q.every(Boolean) ? 1 : q.some(Boolean) ? 2 : 0; cell.set(k, v); } return v; };
  const all = x.getImageData(0, 0, img.width, img.height).data;
  for (const py of ys) for (const px of xs) { const cv0 = cellOk(px, py); if (cv0 === 0 || (cv0 === 2 && !isCv(px, py))) continue; n++;
    const wx = v.x + ((px - r.left) / r.width) * v.width, wy = v.y + ((py - r.top) / r.height) * v.height; const t = isoProjection.worldToTile(wx, wy);
    const di = (Math.min(img.height - 1, Math.round((py - r.top) * ky)) * img.width + Math.min(img.width - 1, Math.round((px - r.left) * kx))) * 4; const d = [all[di], all[di + 1], all[di + 2]];
    const isClear = Math.abs(d[0] - 0x1b) <= 3 && Math.abs(d[1] - 0x2a) <= 3 && Math.abs(d[2] - 0x1c) <= 3; const isBlack = d[0] + d[1] + d[2] <= 6;
    if (t.tx < 1 || t.ty < 1 || t.tx > 127 || t.ty > 95) { out++; continue; } inW++;
    if (isClear || isBlack) { if (isClear) clear++; else black++; rows.add(py); if (pts.length < 4) pts.push([px, py, Math.round(t.tx), Math.round(t.ty), d[0], d[1], d[2]]); } }
  return { n, inW, out, clear, black, rows: rows.size, pts }; };`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const touch = g.touch;
    const cam = () =>
      g.eval(
        `(() => { const c = window.__idleRpg.scene().camera; return { zoom: c.zoom, w: c.width, h: c.height, sx: c.scrollX, sy: c.scrollY }; })()`,
      );
    const scan = async (label) => {
      await g.eval(SCAN);
      const s = await g.eval('window.__scan()');
      if (process.env.SHOTS_DIR) await g.screenshot(`minzoom-${vp}-${label}`);
      return s;
    };
    const filled = async (label) => {
      const s = await scan(label);
      expect(
        s.inW > 100,
        `${label}: only ${s.inW} in-world samples, ${s.out} off-world, cam ${JSON.stringify(await cam())}`,
      );
      expect(
        s.clear === 0,
        `${label}: ${s.clear} clear + ${s.black} near-black (dark art/banner px, not failed) of ${s.inW} in-world samples, ${s.rows} rows, e.g. ${JSON.stringify(s.pts)}`,
      );
      return `${label}: ${s.inW} in-world samples clean (${s.out} off-world)`;
    };
    const canvasMid = async () => {
      const r = await g.eval(
        `(() => { const r = document.querySelector('canvas:not(.minimap)').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top }; })()`,
      );
      return r;
    };
    const pinch = async (d0, d1) => {
      const m = await canvasMid();
      const pts = (d) => [
        { x: m.x - d / 2, y: m.y - 60, id: 1 },
        { x: m.x + d / 2, y: m.y - 60, id: 2 },
      ];
      await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
      for (let i = 1; i <= 15; i++)
        await g.cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: pts(d0 + ((d1 - d0) * i) / 15),
        });
      await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // wheel without the harness's 120 ms/step sleep (input is the same real CDP wheel event)
    const wheelFast = (x, y, deltaY) =>
      g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
    // drag without per-step sleeps: same real mouse/touch events, no wall-clock padding
    const dragFast = async (x0, y0, x1, y1, steps = 6) => {
      const at = (i) => [x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps];
      const send = (type, x, y) =>
        touch
          ? g.cdp.send('Input.dispatchTouchEvent', {
              type,
              touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
            })
          : g.cdp.send('Input.dispatchMouseEvent', {
              type,
              x,
              y,
              button: 'left',
              buttons: type === 'mouseReleased' ? 0 : 1,
              clickCount: 1,
            });
      if (!touch)
        await g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await send(touch ? 'touchStart' : 'mousePressed', x0, y0);
      for (let i = 1; i <= steps; i++) await send(touch ? 'touchMove' : 'mouseMoved', ...at(i));
      await send(touch ? 'touchEnd' : 'mouseReleased', x1, y1);
    };
    const zoomOut = async () => {
      const m = await canvasMid();
      for (let i = 0; i < 8; i++) {
        if (touch) await pinch(330, 30);
        else await wheelFast(m.x, m.y, 400);
      }
      await settle();
    };
    const tp = async (x, y) => {
      await g.teleport(x, y, { settleMs: 0 });
      await g.store('s.recentreCamera()');
      await settle();
    };
    // camera still: 2 stable 100 ms intervals (also covers the zoom easing, which moves scroll)
    const settle = () =>
      waitStill(
        async () => {
          const c = await cam(); // ONE eval per sample; zoom folded into x so zoom easing also counts as movement
          return { x: c.sx + c.zoom * 1000, y: c.sy };
        },
        { intervalMs: 60 },
      );

    // Window of 1 chunk radius, 32-tile chunks: the view rectangle must fit the guaranteed-loaded diamond.
    const bound = () =>
      g.eval(
        `(async () => { const { isoProjection: P } = await import('/src/render/projection.ts'); const c = window.__idleRpg.scene().camera; const o = P.tileToWorld(0, 0); const hw = P.tileToWorld(32, -32).x - o.x, hh = P.tileToWorld(32, 32).y - o.y; return c.width / 2 / hw + c.height / 2 / hh; })()`,
      );
    let zMin;
    await check('z1', `${vp}: zoomed all the way out: view filled`, async () => {
      const z0 = (await cam()).zoom;
      await zoomOut();
      zMin = (await cam()).zoom;
      expect(zMin < z0 - 0.01 || z0 <= 0.5, `zoom did not drop: ${z0} -> ${zMin}`);
      await settle();
      const b = await bound();
      expect(zMin >= b - 0.005, `min zoom ${zMin} below the window-fit bound ${b}`);
      return `zoom ${z0.toFixed(2)} -> ${zMin.toFixed(2)} (bound ${b.toFixed(2)}); ${await filled('spawn')}`;
    });
    await check('z2', `${vp}: map corners + chunk borders at min zoom`, async () => {
      const out = [];
      for (const [x, y] of [
        [2, 2],
        [125, 93],
        [2, 93],
        [125, 2],
        [32, 32],
        [63, 47],
        [64, 48],
      ]) {
        await tp(x, y); // tp already settles the camera
        out.push(await filled(`tile ${x},${y} z${(await cam()).zoom.toFixed(2)}`));
      }
      return out.join('; ');
    });
    await check('z3', `${vp}: drag-pan to the limits at min zoom`, async () => {
      await tp(64, 48);
      const m = await canvasMid();
      const out = [];
      const bad = [];
      for (const [dx, dy, name] of [
        [1, 0, 'right'],
        [-1, 0, 'left'],
        [0, 1, 'down'],
        [0, -1, 'up'],
        [1, 1, 'se'],
        [-1, -1, 'nw'],
      ]) {
        for (let i = 0; i < 6; i++) {
          const ax = m.x - (dx * m.w) / 3;
          const ay = m.y - (dy * m.h) / 4;
          await dragFast(ax, ay, ax + dx * (m.w / 1.5), ay + dy * (m.h / 2), 6);
        }
        await settle();
        try {
          out.push(await filled(`pan ${name}`));
        } catch (e) {
          bad.push(e.message);
        }
      }
      expect(bad.length === 0, bad.join(' || '));
      return out.join('; ');
    });
    await check('z4', `${vp}: zoom back in, tap still walks to the tapped tile`, async () => {
      await tp(18, 15);
      const m = await canvasMid();
      for (let i = 0; i < 8; i++) {
        if (touch) await pinch(30, 330);
        else await wheelFast(m.x, m.y, -400);
      }
      await settle();
      await tp(18, 15);
      const z = (await cam()).zoom;
      expect(z > zMin + 0.3, `zoom did not grow: ${zMin} -> ${z}`);
      let p = await g.state('movement.position');
      const tried = [];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [1, 1],
      ]) {
        const tx = 18 + dx;
        const ty = 15 + dy;
        try {
          await g.tapTile(tx, ty);
        } catch (e) {
          tried.push(`${tx},${ty}: ${e.message}`);
          continue;
        }
        await g.waitFor(async () => (await g.state('movement.path')).length === 0, {
          label: 'path done',
        });
        p = await g.state('movement.position');
        tried.push(`${tx},${ty} -> ${p.x},${p.y}`);
        if (p.x === tx && p.y === ty) break;
      }
      expect(p.x !== 18 || p.y !== 15, `tap never walked: ${tried.join(' | ')}`);
      expect(
        tried.length > 0 &&
          tried[tried.length - 1].endsWith(`-> ${p.x},${p.y}`) &&
          tried[tried.length - 1].startsWith(`${p.x},${p.y}`),
        `landed off-target: ${tried.join(' | ')}`,
      );
      return `zoom ${z.toFixed(2)}, landed ${p.x},${p.y}; ${await filled('zoomed-in')}`;
    });
    if (!touch)
      await check('z5', 'desktop: resize while zoomed out stays filled', async () => {
        const m = await canvasMid();
        for (let i = 0; i < 8; i++) await wheelFast(m.x, m.y, 400);
        await settle();
        const out = [];
        for (const [w, h] of [
          [1000, 700],
          [1500, 900],
          [1920, 1080],
          [1280, 800],
        ]) {
          await g.cdp.send('Emulation.setDeviceMetricsOverride', {
            width: w,
            height: h,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await g.waitFor(async () => (await g.eval('innerWidth')) === w, { label: `resize ${w}` });
          await settle();
          out.push(
            `${w}x${h} z${(await cam()).zoom.toFixed(2)} ${await filled(`resize ${w}x${h}`)}`,
          );
        }
        return out.join('; ');
      });
    if (!touch)
      await check('z6', 'wide desktop 1920x1080: fresh load, min zoom, corners', async () => {
        await g.cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await g.load();
        await zoomOut();
        const out = [`z${(await cam()).zoom.toFixed(2)}`];
        for (const [x, y] of [
          [18, 15],
          [2, 2],
          [125, 93],
          [64, 48],
        ]) {
          await tp(x, y);
          out.push(await filled(`wide ${x},${y}`));
        }
        return out.join('; ');
      });
  }),
);
