/* global fetch, console */
// Minimap e2e: tap-to-walk, unwalkable taps, player dot, N compass, Settings toggle, no world click under it.
// Own vite on :5188 (never 5173), fresh headless Chrome profile, real mouse/touch input over CDP.
// Run: node tests/e2e/minimap.e2e.mjs   Exit 0 = all checks passed. Asserts in TILES (iso-safe).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  activity,
  hardTimeout,
  killChild,
  launchChrome,
  runMain,
  sleep,
  spawnTracked,
  waitFor as cdpWait,
} from './cdp.mjs';

hardTimeout(6 * 60e3);

const PORT = Number(process.env.MM_PORT ?? 5188);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS_DIR;
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

const PAGE = `(() => {
  const H = () => window.__idleRpg;
  window.__t = {
    ready: () => { try { return !!(H() && H().scene().camera && H().store.getState().game); } catch { return false; } },
    g: () => H().store.getState().game,
    st: () => H().store.getState(),
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; },
    camCentre: () => { const v = H().scene().camera.worldView; return { x: v.x + v.width / 2, y: v.y + v.height / 2 }; },
    playerWorld: () => { const c = H().scene().playerView.container; return { x: c.x, y: c.y }; },
    // spy: count every walkTo intent with its tile
    spy: () => { const s = H().store; window.__walks = []; const orig = s.getState().walkTo; if (!window.__origWalk) window.__origWalk = orig; const base = window.__origWalk; s.setState({ walkTo: (t) => { window.__walks.push({ x: t.x, y: t.y }); base(t); } }); },
    walks: () => window.__walks,
    // blocking info from the real world module
    world: async () => { const w = await import('/src/features/world/index.ts'); const grid = w.createWorldCollisionGrid(); window.__grid = grid; window.__wd = w.WORLD_DEF; const mv = await import('/src/features/movement/index.ts'); window.__findPath = mv.findPath; window.__terrain = (x, y) => w.WORLD_DEF.terrainAt(x, y); window.__spawn = w.PLAYER_SPAWN; return { spawn: w.PLAYER_SPAWN, size: { w: w.WORLD_DEF.widthTiles, h: w.WORLD_DEF.heightTiles } }; },
    walkable: (x, y) => window.__grid.isWalkable(x, y),
    reach: (a, b) => { const p = window.__findPath(window.__grid, a, b); return !!p; },
    terrain: (x, y) => window.__terrain(x, y),
    // canvas pixels
    px: (x, y) => { const c = document.querySelector('canvas.minimap'); const d = c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2], d[3]]; },
    canvasHash: () => { const c = document.querySelector('canvas.minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; return h; },
    canvasSize: () => { const c = document.querySelector('canvas.minimap'); return { w: c.width, h: c.height }; },
    findPx: (rgb, tol) => { const c = document.querySelector('canvas.minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const out = []; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-rgb[0]) <= tol && Math.abs(d[i+1]-rgb[1]) <= tol && Math.abs(d[i+2]-rgb[2]) <= tol) { const p = i / 4; out.push([p % c.width, Math.floor(p / c.width)]); } if (!out.length) return null; return { n: out.length, x: out.reduce((a, b) => a + b[0], 0) / out.length, y: out.reduce((a, b) => a + b[1], 0) / out.length }; },
    topEl: (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.className || e.tagName) : null; },
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
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
  const T = (e) => cdp.eval(`window.__t.${e}`);
  const waitFor = (what, pred, ms = 15000) => cdpWait(pred, { timeoutMs: ms, label: what });
  let phase = 'desktop';
  let touch = false;
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
  };
  const check = async (id, title, fn) => {
    try {
      activity(`check ${phase} ${id}`);
      console.error(`[progress] ${phase} ${id}`);
      results.push({ phase, id, title, ok: true, ev: (await fn()) ?? '' });
    } catch (e) {
      results.push({ phase, id, title, ok: false, ev: e.message });
      await shot(`${phase}-${id}-FAIL`);
    }
  };
  const tap = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await sleep(120);
  };
  const drag = async (x0, y0, x1, y1) => {
    const steps = 12;
    if (touch) {
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
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x0,
        y: y0,
        button: 'left',
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
        clickCount: 1,
      });
    }
    await sleep(200);
  };
  const viewport = (w, h, mobile) =>
    cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  const load = async () => {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(600);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: ORIGIN.slice(0, -1),
      storageTypes: 'local_storage',
    });
    await cdp.send('Page.navigate', { url: ORIGIN + '?tickMs=60' });
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
    await sleep(800);
  };
  const setPos = async (x, y) => {
    await cdp.eval(
      `(() => { const s = window.__idleRpg.store; const g = s.getState().game; s.setState({ game: { ...g, movement: { ...g.movement, position: { x: ${x}, y: ${y} }, path: [] }, gathering: { ...g.gathering, session: null } } }); })()`,
    );
    await sleep(2500);
  };
  const pos = () => T('g().movement.position');
  /** Minimap geometry (CSS px): centre of canvas, css px per tile. Player must be idle. */
  const geom = async () => {
    const r = await T(`rect('canvas.minimap')`);
    expect(r, 'no minimap canvas');
    return { r, perTile: (4 * r.w) / 160, radius: r.w / 2 };
  };
  const waitIdle = async (ms = 12000) => {
    await waitFor('player idle', async () => (await T('g().movement.path.length')) === 0, ms);
    await sleep(700); // let the render trail settle on the final tile
  };
  let world;

  async function runPhase() {
    await load();
    await tap(640, 20);
    world = await T('world()');
    await T('spy()');
    const sp = world.spawn;

    // pick candidate offsets whose target tile is walkable, inside the circle at 60% radius
    const pickWalkable = async (from, g, minD, maxD) => {
      const maxTiles = (g.radius * 0.85) / g.perTile;
      for (let d = maxD; d >= minD; d--)
        for (const [ux, uy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const tx = from.x + ux * d,
            ty = from.y + uy * d;
          if (Math.hypot(ux * d, uy * d) > maxTiles) continue;
          if (
            (await T(`walkable(${tx}, ${ty})`)) &&
            (await T(`reach(${JSON.stringify(from)}, {x:${tx},y:${ty}})`))
          )
            return { x: tx, y: ty };
        }
      return null;
    };

    await check(
      'm1',
      'tap walkable minimap spot: arrives within 1 tile of tile under tap, one walkTo',
      async () => {
        await setPos(sp.x, sp.y);
        const g = await geom();
        const from = await pos();
        const target = await pickWalkable(from, g, 4, 9);
        expect(target, 'no walkable target in view');
        const px = g.r.x + (target.x - from.x) * g.perTile;
        const py = g.r.y + (target.y - from.y) * g.perTile;
        await T('spy()');
        await tap(px, py);
        await sleep(150);
        const walks = await T('walks()');
        expect(
          walks.length === 1,
          `expected 1 walkTo, got ${JSON.stringify(walks)} (world click under minimap?)`,
        );
        const sel = walks[0];
        expect(
          Math.hypot(sel.x - target.x, sel.y - target.y) <= 1,
          `walkTo ${JSON.stringify(sel)} but tile under tap is ${JSON.stringify(target)} (${g.perTile}px/tile)`,
        );
        await waitIdle(15000);
        const end = await pos();
        const d = Math.hypot(end.x - target.x, end.y - target.y);
        expect(
          d <= 1,
          `arrived ${JSON.stringify(end)}, wanted ${JSON.stringify(target)} (d=${d.toFixed(2)})`,
        );
        await shot(`${phase}-m1`);
        return `from ${JSON.stringify(from)} tap tile ${JSON.stringify(target)} -> walkTo ${JSON.stringify(sel)}, arrived ${JSON.stringify(end)} d=${d.toFixed(2)}, ${g.perTile.toFixed(2)}px/tile`;
      },
    );

    await check(
      'm2',
      'tap far walkable spots in 4 directions (scale across the circle)',
      async () => {
        const out = [];
        for (const [ux, uy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          await setPos(sp.x, sp.y);
          const g = await geom();
          const from = await pos();
          const maxTiles = Math.floor((g.radius * 0.8) / g.perTile);
          let target = null;
          for (let d = maxTiles; d >= 3 && !target; d--) {
            const tx = from.x + ux * d,
              ty = from.y + uy * d;
            if (
              (await T(`walkable(${tx}, ${ty})`)) &&
              (await T(`reach(${JSON.stringify(from)}, {x:${tx},y:${ty}})`))
            )
              target = { x: tx, y: ty };
          }
          if (!target) {
            out.push(`dir ${ux},${uy}: no reachable walkable tile`);
            continue;
          }
          await tap(
            g.r.x + (target.x - from.x) * g.perTile,
            g.r.y + (target.y - from.y) * g.perTile,
          );
          const walks = await T('walks()');
          const path = await T('g().movement.path');
          expect(
            path.length > 0,
            `dir ${ux},${uy}: no path to walkable ${JSON.stringify(target)}; walks ${JSON.stringify(walks)} from ${JSON.stringify(from)} pos ${JSON.stringify(await pos())}`,
          );
          const e = path[path.length - 1];
          expect(
            Math.hypot(e.x - target.x, e.y - target.y) <= 1,
            `dir ${ux},${uy}: path end ${JSON.stringify(e)} vs ${JSON.stringify(target)}; walkTo ${JSON.stringify(walks.slice(-2))}; from ${JSON.stringify(from)}`,
          );
          out.push(`dir ${ux},${uy}: ${JSON.stringify(target)} ok`);
          await waitIdle(20000);
        }
        return out.join(' | ');
      },
    );

    await check(
      'm3',
      'tap water / wall: no error, ends on a walkable tile near it (or does nothing)',
      async () => {
        const out = [];
        let tried = 0;
        for (const kind of ['water', 'wall']) {
          await setPos(sp.x, sp.y);
          const g = await geom();
          const from = await pos();
          const maxTiles = Math.floor((g.radius * 0.9) / g.perTile);
          let found = null;
          for (let r = 1; r <= maxTiles && !found; r++)
            for (let dx = -r; dx <= r && !found; dx++)
              for (let dy = -r; dy <= r && !found; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                if (Math.hypot(dx, dy) > maxTiles) continue;
                if ((await T(`terrain(${from.x + dx}, ${from.y + dy})`)) === kind)
                  found = { x: from.x + dx, y: from.y + dy };
              }
          if (!found) {
            out.push(`${kind}: none in view (skipped)`);
            continue;
          }
          tried++;
          await tap(g.r.x + (found.x - from.x) * g.perTile, g.r.y + (found.y - from.y) * g.perTile);
          await sleep(200);
          const path = await T('g().movement.path');
          await waitIdle(20000);
          const end = await pos();
          const ok = await T(`walkable(${end.x}, ${end.y})`);
          expect(ok, `${kind}: player ended on unwalkable ${JSON.stringify(end)}`);
          const dEnd = Math.hypot(end.x - found.x, end.y - found.y);
          out.push(
            `${kind} ${JSON.stringify(found)}: pathLen ${path.length}, ended ${JSON.stringify(end)} (${dEnd.toFixed(1)} tiles from tap${path.length ? '' : ', did nothing'})`,
          );
        }
        expect(
          tried > 0,
          'no water or wall tile within the minimap view to tap: ' + out.join(' | '),
        );
        return out.join(' | ');
      },
    );

    await check(
      'd1',
      'player dot at centre, terrain scrolls and destination marker shows where tapped',
      async () => {
        await setPos(sp.x, sp.y);
        const g = await geom();
        const from = await pos();
        const cs = await T('canvasSize()');
        const dpr = cs.w / g.r.w;
        const c0 = { x: cs.w / 2, y: cs.h / 2 };
        const isWhite = (p) => p[0] > 240 && p[1] > 240 && p[2] > 240;
        const dot0 = await T(`px(${c0.x}, ${c0.y})`);
        expect(
          isWhite(dot0),
          `canvas centre pixel ${JSON.stringify(dot0)} is not the white player dot`,
        );
        const hash0 = await T('canvasHash()');
        const target = await pickWalkable(from, g, 6, 10);
        expect(target, 'no walkable target');
        await tap(g.r.x + (target.x - from.x) * g.perTile, g.r.y + (target.y - from.y) * g.perTile);
        await sleep(100);
        const red = await T('findPx([255,42,42], 8)');
        expect(red, 'no red destination marker after tap');
        const wantX = cs.w / 2 + (target.x - from.x) * g.perTile * dpr;
        const wantY = cs.h / 2 + (target.y - from.y) * g.perTile * dpr;
        const err = Math.hypot(red.x - wantX, red.y - wantY) / (g.perTile * dpr);
        await sleep(1500);
        const mid = await pos();
        const hashMid = await T('canvasHash()');
        expect(mid.x !== from.x || mid.y !== from.y, 'player did not move');
        expect(hashMid !== hash0, 'minimap picture did not change while the player moved');
        const dotMid = await T(`px(${c0.x}, ${c0.y})`);
        expect(
          isWhite(dotMid),
          `player dot not at centre while walking (centre pixel ${JSON.stringify(dotMid)})`,
        );
        await waitIdle(15000);
        return `white dot at canvas centre before and during walk; red marker ${err.toFixed(2)} tiles from expected px; picture changed; player ${JSON.stringify(from)} -> ${JSON.stringify(mid)}`;
      },
    );

    await check(
      'a1',
      'rim arrow: far destination -> red pixels on the rim toward it; near destination -> none',
      async () => {
        await setPos(sp.x, sp.y);
        const cs = await T('canvasSize()');
        const rr = cs.w / 2;
        const setDest = (x, y) =>
          cdp.eval(
            `(() => { const s = window.__idleRpg.store; const g = s.getState().game; s.setState({ game: { ...g, movement: { ...g.movement, destination: { x: ${x}, y: ${y} } } } }); })()`,
          );
        // red pixels in the rim band (outer 25% radius), centroid relative to centre
        const rim = () =>
          cdp.eval(`(() => { const c = document.querySelector('canvas.minimap'); const r = c.width / 2;
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sx = 0, sy = 0;
            for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i]-255) > 8 || Math.abs(d[i+1]-42) > 8 || Math.abs(d[i+2]-42) > 8) continue;
              const p = i / 4, x = p % c.width - r, y = Math.floor(p / c.width) - r; if (Math.hypot(x, y) > r * 0.75) { n++; sx += x; sy += y; } }
            return n ? { n, x: sx / n, y: sy / n } : null; })()`);
        await setDest(sp.x, sp.y);
        await sleep(300);
        expect((await rim()) === null, 'rim arrow drawn although destination is at the player');
        const far = [
          [60, 0, 'east'],
          [0, 60, 'south'],
          [-60, 0, 'west'],
          [0, -60, 'north'],
        ];
        const seen = [];
        for (const [dx, dy, name] of far) {
          await setDest(sp.x + dx, sp.y + dy);
          await sleep(300);
          const a = await rim();
          expect(a, `no red rim arrow for ${name} destination`);
          const ang = Math.atan2(a.y, a.x);
          const want = Math.atan2(dy, dx);
          let diff = Math.abs(ang - want);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          expect(diff < 0.35, `${name}: arrow angle ${ang.toFixed(2)} vs ${want.toFixed(2)}`);
          seen.push(`${name} ${diff.toFixed(2)}rad`);
        }
        await setDest(sp.x + 2, sp.y);
        await sleep(300);
        expect((await rim()) === null, 'rim arrow drawn for a destination inside the circle');
        void rr;
        await cdp.eval(
          `(() => { const s = window.__idleRpg.store; const g = s.getState().game; s.setState({ game: { ...g, movement: { ...g.movement, destination: null } } }); })()`,
        );
        return `arrow toward far dest (angle err ${seen.join(', ')}); none when inside`;
      },
    );

    await check(
      'n1',
      'N compass (real tap) re-centres camera after drag-pan, without walking',
      async () => {
        await setPos(sp.x, sp.y);
        await sleep(600);
        const c0 = await T('camCentre()');
        const p0 = await T('playerWorld()');
        const vp = await cdp.eval('({ w: innerWidth, h: innerHeight })');
        const mid = { x: vp.w * 0.4, y: vp.h * 0.55 };
        await drag(mid.x, mid.y, mid.x - 120, mid.y - 80);
        await sleep(300);
        const c1 = await T('camCentre()');
        const panned = Math.hypot(c1.x - c0.x, c1.y - c0.y);
        expect(panned > 30, `drag did not pan the camera (${panned.toFixed(0)}px)`);
        expect((await T('g().movement.path.length')) === 0, 'drag started a walk');
        const nr = await T(`rect('.minimap-n')`);
        expect(nr, 'no N button');
        const top = await T(`topEl(${nr.x}, ${nr.y})`);
        const rec0 = await T('st().recentre');
        await T('spy()');
        await tap(nr.x, nr.y);
        await sleep(1500);
        const rec1 = await T('st().recentre');
        const walks = await T('walks()');
        expect(
          rec1 === rec0 + 1,
          `N tap did not recentre (counter ${rec0}->${rec1}); element under N is "${top}"; walkTo calls: ${JSON.stringify(walks)}`,
        );
        expect(walks.length === 0, `N tap also walked: ${JSON.stringify(walks)}`);
        const c2 = await T('camCentre()');
        const p2 = await T('playerWorld()');
        const off = Math.hypot(c2.x - p2.x - (c0.x - p0.x), c2.y - p2.y - (c0.y - p0.y));
        const raw = Math.hypot(c2.x - p2.x, c2.y - p2.y);
        expect(
          off < 32,
          `after N camera is ${off.toFixed(1)}px off its pre-pan offset from the player (panned ${panned.toFixed(0)})`,
        );
        return `panned ${panned.toFixed(0)}px; after N ${off.toFixed(1)}px from pre-pan offset (raw centre-to-player ${raw.toFixed(1)}px); element under N "${top}"`;
      },
    );

    await check(
      'w1',
      'after walking 40+ tiles east: window rebuilt, dot centred, terrain matches WORLD_DEF around player',
      async () => {
        await setPos(sp.x, sp.y);
        const from = await pos();
        const cs0 = await T('canvasSize()');
        let target = null;
        for (let d = 60; d >= 42 && !target; d--)
          for (const dy of [0, 1, -1, 2, -2, 3, -3, 5, -5, 8, -8])
            if (!target) {
              const tx = from.x + d,
                ty = from.y + dy;
              if (
                (await T(`walkable(${tx}, ${ty})`)) &&
                (await T(`reach(${JSON.stringify(from)}, {x:${tx},y:${ty}})`))
              )
                target = { x: tx, y: ty };
            }
        expect(target, 'no reachable walkable tile 42+ tiles east');
        const hash0 = await T('canvasHash()');
        await cdp.eval(
          `window.__idleRpg.store.getState().walkTo({ x: ${target.x}, y: ${target.y} })`,
        );
        await waitIdle(60000);
        await sleep(2000);
        const end = await pos();
        expect(
          end.x - from.x >= 40,
          `only walked ${end.x - from.x} tiles east (${JSON.stringify(from)} -> ${JSON.stringify(end)})`,
        );
        const g = await geom();
        const cs = await T('canvasSize()');
        expect(cs.w === cs0.w, 'canvas size changed');
        const dpr = cs.w / g.r.w;
        const isWhite = (p) => p[0] > 240 && p[1] > 240 && p[2] > 240;
        const c0 = { x: cs.w / 2, y: cs.h / 2 };
        const dot = await T(`px(${c0.x}, ${c0.y})`);
        expect(isWhite(dot), `centre pixel ${JSON.stringify(dot)} is not the white dot`);
        const hash1 = await T('canvasHash()');
        expect(hash1 !== hash0, 'minimap picture identical to before walking');
        const PAL = {
          grass: 0x3f7a30,
          flowers: 0x4a8a38,
          path: 0xcdb27c,
          sand: 0xe0d095,
          water: 0x2458b0,
          wall: 0x33333a,
          floor: 0x9a6d3a,
        };
        let n = 0,
          bad = [],
          transparent = 0;
        const tilePx = g.perTile * dpr;
        // Label text/coin boxes (conservative, all labels) in canvas px: terrain samples inside them are skipped.
        const labelBoxes = await cdp.eval(`(async () => {
          const W = await import('/src/features/world/index.ts');
          const cv = document.querySelector('canvas.minimap'), x = cv.getContext('2d');
          const d = cv.width / cv.clientWidth, fp = Math.round(10 * d), s = ${tilePx};
          x.font = 'bold ' + fp + 'px sans-serif';
          return W.WORLD_DEF.labels.map((l) => {
            const px = cv.width / 2 + (l.x - ${end.x}) * s, py = cv.height / 2 + (l.y - ${end.y}) * s, tw = x.measureText(l.text).width, m = 2 * d, hh = fp / 2 + m;
            return l.kind === 'region'
              ? { l: px - tw / 2 - m, r: px + tw / 2 + m, t: py - hh, b: py + hh }
              : { l: px - 5 * d - m, r: px + 5 * d + 2 * d + tw + m, t: py - hh, b: py + hh };
          });
        })()`);
        const inLabel = (cx, cy) =>
          labelBoxes.some((b) => cx >= b.l && cx <= b.r && cy >= b.t && cy <= b.b);
        const reach = Math.floor((g.radius * dpr * 0.8) / tilePx);
        for (let dx = -reach; dx <= reach; dx += 2)
          for (let dy = -reach; dy <= reach; dy += 2) {
            if (Math.hypot(dx, dy) * tilePx > g.radius * dpr * 0.8 || Math.hypot(dx, dy) < 2)
              continue;
            if (inLabel(cs.w / 2 + dx * tilePx, cs.h / 2 + dy * tilePx)) continue; // under label text/coin
            const kind = await T(`terrain(${end.x + dx}, ${end.y + dy})`);
            const p = await T(`px(${cs.w / 2 + dx * tilePx}, ${cs.h / 2 + dy * tilePx})`);
            if (
              kind !== undefined &&
              Math.abs(p[0] - 31) < 12 &&
              Math.abs(p[1] - 157) < 12 &&
              Math.abs(p[2] - 58) < 12
            )
              continue; // tree marker dot, not terrain
            if (kind === undefined) {
              transparent++;
              continue;
            }
            n++;
            const c = PAL[kind];
            if (c === undefined) continue;
            const want = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
            if (p.some((v, i) => i < 3 && Math.abs(v - want[i]) > 12))
              bad.push(`(${end.x + dx},${end.y + dy}) ${kind} px ${JSON.stringify(p)}`);
          }
        expect(n > 20, `only ${n} terrain samples`);
        expect(
          bad.length <= Math.ceil(n * 0.03),
          `${bad.length}/${n} samples mismatch (dots/markers/trees excluded by 3% slack): ${bad.slice(0, 5).join('; ')}`,
        );
        // tap still maps correctly after rebuild
        await T('spy()');
        const tgt = await (async () => {
          for (const [ux, uy] of [
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 0],
          ])
            for (let d = 6; d >= 3; d--) {
              const tx = end.x + ux * d,
                ty = end.y + uy * d;
              if (
                (await T(`walkable(${tx}, ${ty})`)) &&
                (await T(`reach(${JSON.stringify(end)}, {x:${tx},y:${ty}})`))
              )
                return { x: tx, y: ty };
            }
          return null;
        })();
        expect(tgt, 'no tap target near far position');
        await tap(g.r.x + (tgt.x - end.x) * g.perTile, g.r.y + (tgt.y - end.y) * g.perTile);
        const w = await T('walks()');
        expect(
          w.length === 1 && Math.hypot(w[0].x - tgt.x, w[0].y - tgt.y) <= 1,
          `far tap walkTo ${JSON.stringify(w)} vs ${JSON.stringify(tgt)}`,
        );
        await waitIdle(20000);
        return `walked ${JSON.stringify(from)} -> ${JSON.stringify(end)} (+${end.x - from.x}); dot centred; ${n - bad.length}/${n} terrain samples match (${transparent} out-of-world), tap->walkTo ${JSON.stringify(w[0])} want ${JSON.stringify(tgt)}`;
      },
    );

    await check('t1', 'Settings Minimap toggle hides and shows it', async () => {
      expect(await T(`rect('canvas.minimap')`), 'minimap not visible at start');
      const toggle = async () => {
        if (!(await cdp.eval('!!document.querySelector(".settings")'))) {
          const b = await T(`rect('button[aria-label="Settings"]')`);
          expect(b, 'no settings button');
          await tap(b.x, b.y);
          await sleep(300);
        }
        const r = await cdp.eval(
          `(() => { const b = [...document.querySelectorAll('.settings [role=switch]')].find((x) => x.textContent.trim().startsWith('Minimap')); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, state: b.getAttribute('aria-checked') }; })()`,
        );
        expect(r, 'no Minimap switch in Settings');
        await tap(r.x, r.y);
        await sleep(300);
        const c = await T(`rect('button[aria-label="Close settings"]')`);
        if (c) await tap(c.x, c.y);
        await sleep(300);
        return r.state;
      };
      const s0 = await toggle();
      const hidden = !(await T(`rect('canvas.minimap')`));
      const s1 = await toggle();
      const shown = !!(await T(`rect('canvas.minimap')`));
      expect(hidden, 'Minimap still visible after turning it off');
      expect(shown, 'Minimap did not come back after turning it on');
      return `switch ${s0} -> off hides: ${hidden}; ${s1} -> on shows: ${shown}`;
    });
  }

  try {
    phase = 'desktop';
    touch = false;
    await viewport(1280, 800, false);
    await runPhase();
    phase = 'phone';
    touch = true;
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await viewport(390, 844, true);
    await runPhase();
    results.push({
      phase: 'both',
      id: 'console',
      title: 'no console errors / exceptions',
      ok: errors.length === 0,
      ev: errors.join(' || ') || 'none',
    });
  } catch (e) {
    results.push({ phase, id: 'fatal', title: 'harness', ok: false, ev: e.stack });
  } finally {
    await cdp.close();
    killChild(vite);
  }
  let fail = 0;
  for (const r of results) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id}: ${r.title}\n      ${r.ev}`);
  }
  console.log(`\n${results.length - fail}/${results.length} checks passed`);
  return fail ? 1 : 0;
}
runMain(main);
