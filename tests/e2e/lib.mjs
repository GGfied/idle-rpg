/* global fetch, console */
// Shared e2e kit on top of cdp.mjs. A feature test is: withGame(opts, g => { check(...); ... report() }).
//   import { withGame, forEachViewport, check, report } from './lib.mjs';
// Page-side helpers live in window.__e (installed before every page load). All state setters go through
// the DEV hook window.__idleRpg (preconditions only); behaviour under test is driven with g.tap*/drag/wheel.
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  hardTimeout,
  killChild,
  launchChrome,
  runMain,
  sleep,
  spawnTracked,
  waitFor,
} from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, touch: false },
  phone: { width: 390, height: 844, touch: true, mobile: true, dsf: 2 },
  landscape: { width: 844, height: 390, touch: true, mobile: true, dsf: 2 },
};

export const expect = (c, m) => {
  if (!c) throw new Error(typeof m === 'function' ? m() : m);
};

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
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(origin)).ok) return proc;
    } catch {
      /* not up */
    }
    await sleep(200);
  }
  killChild(proc);
  throw new Error(`vite did not start on ${port} (port busy? lsof -i :${port})`);
}

/**
 * withGame({port, viewport, tickMs}, async g => {...}). Starts vite + Chrome, loads the game, runs fn, cleans up
 * and exits the process with report()'s code (or 1 on throw). Call once per script; use g.setViewport() or
 * forEachViewport() for several viewports.
 */
export function withGame(opts, fn) {
  return runMain(async () => {
    hardTimeout(6 * 60e3);
    // E2E_URL=http://127.0.0.1:5300/ or E2E_SHARED=1 (= :5300) reuses the warm live server (warmServer.mjs); no own vite.
    const sharedUrl =
      process.env.E2E_URL ?? (process.env.E2E_SHARED ? 'http://127.0.0.1:5300/' : '');
    const port = Number(process.env.E2E_PORT ?? opts.port);
    const origin = sharedUrl ? sharedUrl.replace(/\/?$/, '/') : `http://127.0.0.1:${port}/`;
    const tickMs = opts.tickMs ?? 60;
    let vite = null;
    if (sharedUrl) {
      if (
        !(await fetch(origin).then(
          (r) => r.ok,
          () => false,
        ))
      )
        throw new Error(`shared server ${origin} is down: run node tests/e2e/warmServer.mjs`);
    } else vite = await startVite(port, origin);
    const vp = opts.viewport ?? 'desktop';
    const cdp = await launchChrome({ width: VIEWPORTS[vp].width, height: VIEWPORTS[vp].height });
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
        await waitFor(() => E('ready()').catch(() => false), {
          timeoutMs: 25000,
          label: 'game ready (DEV hook)',
        });
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
      const r = await fn(g);
      await check('console', 'no console errors / exceptions', () => {
        expect(errors.length === 0, errors.join(' | '));
        return '0 errors';
      });
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
