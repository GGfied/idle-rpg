// World map overlay + minimap facing arrow. Run: node tests/e2e/worldmap.e2e.mjs (E2E_PORT overrides :5257).
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { check, expect, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= 'tests/e2e/.shots-worldmap';
const SPY = `(() => {
  const S = (window.__s = { arrow: {}, img: {}, text: {}, draws: {} });
  const P = CanvasRenderingContext2D.prototype;
  const cls = (c) => c.canvas.className;
  const wrap = (n, f) => { const o = P[n]; P[n] = function (...a) { try { f(this, a); } catch {} return o.apply(this, a); }; };
  wrap('beginPath', (c) => { c.__p = []; });
  wrap('moveTo', (c, a) => c.__p?.push(a));
  wrap('lineTo', (c, a) => c.__p?.push(a));
  wrap('stroke', (c) => { const p = c.__p; if (p && p.length === 4) { const bx = (p[1][0] + p[3][0]) / 2, by = (p[1][1] + p[3][1]) / 2; S.arrow[cls(c)] = { a: Math.atan2(p[0][1] - by, p[0][0] - bx), n: (S.arrow[cls(c)]?.n ?? 0) + 1 }; } });
  wrap('drawImage', (c, a) => { const k = cls(c); S.draws[k] = (S.draws[k] ?? 0) + 1; if (a.length === 9) S.img[k] = { sx: a[1], sy: a[2], z: a[7] / a[3], ox: a[5] - (a[1] * a[7]) / a[3], oy: a[6] - (a[2] * a[7]) / a[3] }; });
  wrap('fillText', (c, a) => { const k = cls(c); (S.text[k] ??= {})[a[0]] = 1; });
})()`;
const S = (g, k) => g.eval(`window.__s.${k}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const touch = (g, type, pts) =>
  g.cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
  });
const near = (a, b, e) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < e;

await withGame({ port: 5257, viewport: 'desktop' }, async (g) => {
  await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  for (const vp of ['desktop', 'phone']) {
    await g.setViewport(vp);
    await g.load();
    await g.teleport(18, 15, { settleMs: 1500 });
    const mm = () => g.page(`rect('canvas.minimap')`);
    const shot = async (name, sel) => {
      const r = await g.page(`rect('${sel}')`);
      const { data } = await g.cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, r.left - 10),
          y: Math.max(0, r.top - 10),
          width: r.w + 80,
          height: r.h + 80,
          scale: 3,
        },
      });
      mkdirSync(process.env.SHOTS_DIR, { recursive: true });
      writeFileSync(`${process.env.SHOTS_DIR}/${name}-${vp}.png`, Buffer.from(data, 'base64'));
    };
    const overlayOpen = () =>
      g.eval(`!!document.querySelector('[role=dialog][aria-label="World map"]')`);
    const open = async () => {
      await g.tapSelector('.minimap-expand');
      await g.waitFor(overlayOpen, { label: 'overlay open' });
      await g.sleep(500);
    };

    await check('c1', 'minimap tap walks, overlay stays closed', async () => {
      const stop = await g.trackMoves();
      const r = await mm();
      await g.tap(r.x + r.w * 0.2, r.y);
      await g.waitTicks(25);
      const pos = await stop();
      expect(pos.length > 1, `no walk (${JSON.stringify(pos)})`);
      const opened = await overlayOpen();
      if (opened) await g.tapSelector('.worldmap-close');
      expect(!opened, 'overlay opened on minimap tap');
      return `${vp}: ${pos.length} tile changes, last ${JSON.stringify(pos.at(-1))}`;
    });

    await check(
      'c4',
      'arrow points along last step, east then south, kept after stop',
      async () => {
        const out = [];
        for (const [name, fx, fy, test] of [
          ['east', 0.25, 0, (d) => d.dx > 0],
          ['south', 0, 0.25, (d) => d.dy > 0],
        ]) {
          const stop = await g.trackMoves();
          const r = await mm();
          await g.tap(r.x + r.w * fx, r.y + r.h * fy);
          await g.waitTicks(30);
          const pos = await stop();
          const [p, q] = pos.slice(-2);
          const d = { dx: q.x - p.x, dy: q.y - p.y };
          const want = Math.atan2(d.dy, d.dx);
          await sleep(400);
          const a1 = (await S(g, 'arrow["minimap"]'))?.a;
          await sleep(600);
          const a2 = (await S(g, 'arrow["minimap"]'))?.a;
          out.push(
            `${name}: last step ${d.dx},${d.dy} want ${want.toFixed(2)} arrow ${a1?.toFixed(2)} after-stop ${a2?.toFixed(2)}`,
          );
          expect(
            a1 !== undefined && near(a1, want, 0.25),
            `minimap arrow ${a1} != step angle ${want} (${out.join(' | ')})`,
          );
          expect(near(a2, a1, 0.01), `arrow changed after stop ${a1}->${a2}`);
          expect(test(d), `${name} tap last step wrong way ${JSON.stringify(d)}`);
          if (name === 'east') await shot('arrow-east', 'canvas.minimap');
        }
        await shot('arrow-south', 'canvas.minimap');
        return out.join(' | ');
      },
    );

    await check(
      'c2',
      'expand btn >=44px opens overlay with labels/rocks/spots/player',
      async () => {
        const b = await g.page(`rect('.minimap-expand')`);
        expect(b.w >= 44 && b.h >= 44, `button ${b.w}x${b.h}`);
        await open();
        const texts = Object.keys((await S(g, 'text["worldmap-canvas"]')) ?? {});
        const labels = await g.eval(
          `import('/src/features/world/index.ts').then((m) => m.WORLD_DEF.labels.length)`,
        );
        const kinds = await g.eval(
          `Promise.all([import('/src/app/ui/panels/Minimap.tsx'), import('/src/app/registry.ts')]).then(([m, r]) => { const s = window.__idleRpg.store.getState().game; const c = {}; for (const k of m.minimapMarkers(r.CONTENT, s, s.movement.position, 0)) c[k.kind] = (c[k.kind] ?? 0) + 1; return c; })`,
        );
        const arrow = await S(g, 'arrow["worldmap-canvas"]');
        const z0 = await S(g, 'img["worldmap-canvas"].z');
        expect(texts.length > 0, 'no area labels drawn');
        expect(arrow, 'no player arrow in overlay');
        expect(
          Object.keys(kinds).some((k) => /rock|ore|mine/i.test(k)) &&
            Object.keys(kinds).some((k) => /spot|fish/i.test(k)),
          `kinds ${JSON.stringify(kinds)}`,
        );
        expect(
          near(arrow.a, (await S(g, 'arrow["minimap"]')).a, 0.01),
          'overlay arrow differs from minimap arrow',
        );
        await shot('overlay', '.worldmap');
        return `${vp}: btn ${b.w}x${b.h}, ${texts.length}/${labels} label texts [${texts.slice(0, 6)}], kinds ${JSON.stringify(kinds)}, arrow ${arrow.a.toFixed(2)}, fit z ${z0.toFixed(3)}`;
      },
    );

    await check('c3', 'fit+centred, zoom, clamped pan, centre, close x3', async () => {
      const c = await g.page(`rect('.worldmap-canvas')`);
      const dim = await g.eval(
        `import('/src/features/world/index.ts').then((m) => ({ W: m.WORLD_DEF.widthTiles, H: m.WORLD_DEF.heightTiles, cw: document.querySelector('.worldmap-canvas').width, ch: document.querySelector('.worldmap-canvas').height }))`,
      );
      const { W, H, cw, ch } = dim;
      const im = () => S(g, 'img["worldmap-canvas"]');
      // world box in canvas px: left/top = ox/oy, right/bottom = ox + W*z
      const box = (i) => ({ l: i.ox, t: i.oy, r: i.ox + W * i.z * K, b: i.oy + H * i.z * K });
      const E = 9; // crop snaps to whole source px (~4 canvas px)
      const i0 = await im();
      const z0 = i0.z;
      // img z = canvas px per source px; K = source px per tile, from the independent fit scale
      const K = Math.min(cw / W, ch / H) / z0;
      const b0 = box(i0);
      expect(
        b0.l >= -E && b0.t >= -E && b0.r <= cw + E && b0.b <= ch + E,
        `open: world cut off ${JSON.stringify(b0)} in ${cw}x${ch}`,
      );
      const cx0 = (b0.l + b0.r) / 2;
      const cy0 = (b0.t + b0.b) / 2;
      expect(
        Math.abs(cx0 - cw / 2) < 9 && Math.abs(cy0 - ch / 2) < 9,
        `open: not centred ${cx0},${cy0} vs ${cw / 2},${ch / 2}`,
      );
      // pan at fit zoom does nothing
      await g.drag(c.x + 60, c.y + 40, c.x - 60, c.y - 40);
      const i1 = await im();
      expect(
        Math.abs(i1.ox - i0.ox) < 1.5 && Math.abs(i1.oy - i0.oy) < 1.5,
        `fit pan moved ${i0.ox},${i0.oy} -> ${i1.ox},${i1.oy}`,
      );
      for (let i = 0; i < 3; i++) await g.wheel(c.x, c.y, -300);
      const zIn = (await im()).z;
      expect(zIn > z0 * 1.2, `wheel in ${z0}->${zIn}`);
      for (let i = 0; i < 40; i++) await g.wheel(c.x, c.y, -300);
      const zMax = (await im()).z;
      await g.wheel(c.x, c.y, -300);
      const zMax2 = (await im()).z;
      expect(
        Math.abs(zMax2 - zMax) < 1e-6 && zMax >= zIn && zMax > z0,
        `max plateau ${zIn} ${zMax} ${zMax2}`,
      );
      for (let i = 0; i < 90; i++) await g.wheel(c.x, c.y, 300);
      const iMin = await im();
      expect(Math.abs(iMin.z - z0) / z0 < 0.01, `min ${iMin.z} vs fit ${z0}`);
      expect(
        Math.abs(iMin.ox - i0.ox) < 9 && Math.abs(iMin.oy - i0.oy) < 9,
        `zoom-out not re-centred ${iMin.ox},${iMin.oy} want ${i0.ox},${i0.oy}`,
      );
      let pinch = '';
      if (g.touch) {
        const zb = iMin.z;
        await touch(g, 'touchStart', [
          [c.x - 40, c.y],
          [c.x + 40, c.y],
        ]);
        for (let i = 1; i <= 8; i++) {
          await touch(g, 'touchMove', [
            [c.x - 40 - i * 10, c.y],
            [c.x + 40 + i * 10, c.y],
          ]);
          await sleep(16);
        }
        await touch(g, 'touchEnd', []);
        await sleep(200);
        const zp = (await im()).z;
        expect(zp > zb * 1.3, `pinch ${zb}->${zp}`);
        pinch = ` pinch ${zb.toFixed(3)}->${zp.toFixed(3)}`;
        for (let i = 0; i < 90; i++) await g.wheel(c.x, c.y, 300);
      }
      // zoomed in: pan is clamped to the world edges (no empty margin)
      for (let i = 0; i < 9; i++) await g.wheel(c.x, c.y, -300);
      const before = await im();
      const bb = box(before);
      expect(before.z > z0 * 1.5, `not zoomed enough ${before.z}`);
      await g.drag(c.x + 30, c.y + 20, c.x - 30, c.y - 20);
      const after = await im();
      expect(
        Math.abs(after.ox - before.ox) > 10 || Math.abs(after.oy - before.oy) > 10,
        `pan did nothing ${before.ox},${before.oy} -> ${after.ox},${after.oy}`,
      );
      const edge = (i, tag) => {
        const q = box(i);
        // each axis: world covers the frame (or is centred when smaller)
        const okX =
          W * i.z * K <= cw ? Math.abs((q.l + q.r) / 2 - cw / 2) < 9 : q.l <= E && q.r >= cw - E;
        const okY =
          H * i.z * K <= ch ? Math.abs((q.t + q.b) / 2 - ch / 2) < 9 : q.t <= E && q.b >= ch - E;
        expect(okX && okY, `${tag}: empty margin ${JSON.stringify(q)} in ${cw}x${ch}`);
      };
      edge(before, 'zoomed');
      edge(after, 'after small pan');
      // huge drags in every direction stay clamped, and actually reach the edge
      await g.drag(c.x + c.w / 2 - 5, c.y + c.h / 2 - 5, c.x - c.w / 2 + 5, c.y - c.h / 2 + 5);
      await g.drag(c.x + c.w / 2 - 5, c.y + c.h / 2 - 5, c.x - c.w / 2 + 5, c.y - c.h / 2 + 5);
      const far1 = await im();
      edge(far1, 'dragged far one way');
      await g.drag(c.x - c.w / 2 + 5, c.y - c.h / 2 + 5, c.x + c.w / 2 - 5, c.y + c.h / 2 - 5);
      await g.drag(c.x - c.w / 2 + 5, c.y - c.h / 2 + 5, c.x + c.w / 2 - 5, c.y + c.h / 2 - 5);
      const far2 = await im();
      edge(far2, 'dragged far other way');
      expect(
        far1.ox !== far2.ox || far1.oy !== far2.oy,
        `far drags identical ${far1.ox},${far1.oy}`,
      );
      // centre on me: world-origin offset moves toward the player, within the clamp
      const me = await g.eval(
        `({ x: window.__idleRpg.store.getState().game.movement.position.x, y: window.__idleRpg.store.getState().game.movement.position.y })`,
      );
      await g.tapSelector('.worldmap-centre');
      await sleep(250);
      const back = await im();
      edge(back, 'after centre');
      const px = back.ox + (me.x + 0.5) * back.z * K;
      const py = back.oy + (me.y + 0.5) * back.z * K;
      const d0 = Math.hypot(
        far2.ox + (me.x + 0.5) * far2.z * K - cw / 2,
        far2.oy + (me.y + 0.5) * far2.z * K - ch / 2,
      );
      const d1 = Math.hypot(px - cw / 2, py - ch / 2);
      expect(d1 <= d0 + 1, `centre did not approach player ${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
      const closes = [];
      await g.tapSelector('.worldmap-close');
      await g.waitFor(async () => !(await overlayOpen()), { label: 'x closes' });
      closes.push('x');
      await open();
      await g.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await g.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await g.waitFor(async () => !(await overlayOpen()), { label: 'escape closes' });
      closes.push('esc');
      await open();
      const f = await g.page(`rect('.worldmap')`);
      if (f.left > 4) {
        await g.tap(f.left / 2, f.y);
        await g.waitFor(async () => !(await overlayOpen()), { label: 'backdrop closes' });
        closes.push('backdrop');
      } else closes.push('backdrop n/a (frame is full-screen on phone)');
      return `K ${K.toFixed(2)} fit z ${z0.toFixed(3)} box ${b0.l.toFixed(0)},${b0.t.toFixed(0)}..${b0.r.toFixed(0)},${b0.b.toFixed(0)} in ${cw}x${ch}; in ${zIn.toFixed(3)} max ${zMax.toFixed(3)} min ${iMin.z.toFixed(3)};${pinch} zoomed box ${bb.l.toFixed(0)}..${bb.r.toFixed(0)}; pan ${before.ox.toFixed(0)},${before.oy.toFixed(0)}->${after.ox.toFixed(0)},${after.oy.toFixed(0)}; far ${far1.ox.toFixed(0)},${far1.oy.toFixed(0)} / ${far2.ox.toFixed(0)},${far2.oy.toFixed(0)}; centre dist ${d0.toFixed(0)}->${d1.toFixed(0)}; closes ${closes}`;
    });

    await check('c5', 'overlay stops redrawing after close', async () => {
      await open();
      const a = await S(g, 'draws["worldmap-canvas"]');
      await sleep(500);
      const b = await S(g, 'draws["worldmap-canvas"]');
      expect(b - a >= 3, `not redrawing while open ${a}->${b}`);
      await g.tapSelector('.worldmap-close');
      await sleep(300);
      const c = await S(g, 'draws["worldmap-canvas"]');
      await sleep(1200);
      const d = await S(g, 'draws["worldmap-canvas"]');
      expect(d === c, `redraws after close ${c}->${d}`);
      return `open ${b - a} draws/500ms; after close ${d - c}/1200ms`;
    });
  }
});
