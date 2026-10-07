import process from 'node:process';
// ISO-1: at minimum zoom the view stays filled (no clear-colour / black band) everywhere: centre, map corners,
// chunk borders, pan limits, after zooming back in (tap still lands) and after a window resize.
import { check, expect, forEachViewport, waitStill, withGame } from './lib.mjs';
import { sleep } from './cdp.mjs';

// A band counts only where the pixel maps INSIDE the 128x96 world (margin 1 tile): beyond the world's own
// edge a rectangular view must show void (the map is a diamond), that is reported as `out`, not failed.
const SCAN = `window.__scan = async (b64) => { const { isoProjection } = await import('/src/render/projection.ts');
  const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const k = img.width / window.innerWidth; const cv = document.querySelector('canvas:not(.minimap)'); const r = cv.getBoundingClientRect();
  const cam = window.__idleRpg.scene().camera, v = cam.worldView;
  const x0 = Math.max(0, Math.ceil(r.left)), x1 = Math.min(window.innerWidth - 1, Math.floor(r.right) - 1), y0 = Math.max(0, Math.ceil(r.top)), y1 = Math.min(window.innerHeight - 1, Math.floor(r.bottom) - 1);
  const xs = [], ys = []; for (let q = x0; q <= x1; q += 5) xs.push(q); xs.push(x1); for (let q = y0; q <= y1; q += 5) ys.push(q); ys.push(y1);
  let n = 0, inW = 0, out = 0, clear = 0, black = 0; const rows = new Set(); const pts = [];
  for (const py of ys) for (const px of xs) { if (document.elementFromPoint(px, py) !== cv) continue; n++;
    const wx = v.x + ((px - r.left) / r.width) * v.width, wy = v.y + ((py - r.top) / r.height) * v.height; const t = isoProjection.worldToTile(wx, wy);
    const d = x.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data;
    const isClear = Math.abs(d[0] - 0x1b) <= 3 && Math.abs(d[1] - 0x2a) <= 3 && Math.abs(d[2] - 0x1c) <= 3; const isBlack = d[0] + d[1] + d[2] <= 6;
    if (t.tx < 1 || t.ty < 1 || t.tx > 127 || t.ty > 95) { out++; continue; } inW++;
    if (isClear || isBlack) { if (isClear) clear++; else black++; rows.add(py); if (pts.length < 4) pts.push([px, py, Math.round(t.tx), Math.round(t.ty), d[0], d[1], d[2]]); } }
  return { n, inW, out, clear, black, rows: rows.size, pts }; };`;

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5191) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const touch = g.touch;
    const cam = () =>
      g.eval(
        `(() => { const c = window.__idleRpg.scene().camera; return { zoom: c.zoom, w: c.width, h: c.height, sx: c.scrollX, sy: c.scrollY }; })()`,
      );
    const scan = async (label) => {
      await g.eval(SCAN);
      const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
      const s = await g.eval(`window.__scan(${JSON.stringify(data)})`);
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
      await sleep(150);
    };
    const zoomOut = async () => {
      const m = await canvasMid();
      for (let i = 0; i < 8; i++) {
        if (touch) await pinch(330, 30);
        else await g.wheel(m.x, m.y, 400);
      }
      await sleep(400);
    };
    const tp = async (x, y, settleMs = 300) => {
      await g.teleport(x, y, { settleMs });
      await g.store('s.recentreCamera()');
      await sleep(300);
    };
    const settle = () => waitStill(async () => ({ x: (await cam()).sx, y: (await cam()).sy }));

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
        await tp(x, y);
        await settle();
        out.push(await filled(`tile ${x},${y} z${(await cam()).zoom.toFixed(2)}`));
      }
      return out.join('; ');
    });
    await check('z3', `${vp}: drag-pan to the limits at min zoom`, async () => {
      await tp(64, 48);
      await settle();
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
          await g.drag(ax, ay, ax + dx * (m.w / 1.5), ay + dy * (m.h / 2), 6);
        }
        await sleep(300);
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
      await tp(18, 15, 400);
      const m = await canvasMid();
      for (let i = 0; i < 8; i++) {
        if (touch) await pinch(30, 330);
        else await g.wheel(m.x, m.y, -400);
      }
      await sleep(400);
      await tp(18, 15, 400);
      await settle();
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
        await sleep(200);
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
        for (let i = 0; i < 8; i++) await g.wheel(m.x, m.y, 400);
        await sleep(400);
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
          await sleep(900);
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
          await settle();
          out.push(await filled(`wide ${x},${y}`));
        }
        return out.join('; ');
      });
  }),
);
