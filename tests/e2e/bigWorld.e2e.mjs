/* global fetch, console */
// Big-world walk-through e2e: spawn -> causeway -> Whispering Wood -> forest road -> Greatmere shore -> Fernhaven bank.
// Real taps only for travel/chop/bank. Own vite on :5203 (E2E_PORT overrides; never 5173).
// Run: node tests/e2e/bigWorld.e2e.mjs   Exit 0 = all pass. SHOTS_DIR=... for screenshots.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hardTimeout, killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';
import { waitStill } from './lib.mjs';

hardTimeout(6 * 60e3);
const PORT = Number(process.env.E2E_PORT ?? 5203);
const ORIGIN = `http://127.0.0.1:${PORT}/?tickMs=60`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS_DIR || resolve(ROOT, 'tests/e2e/.shots-bigworld');
const results = [];
const T0 = Date.now();
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
  const scene = () => H().scene();
  const world = () => scene().camera.scene;
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    g: () => H().store.getState().game,
    pos: () => { const g = H().store.getState().game; return { x: g.movement.position.x, y: g.movement.position.y, path: g.movement.path.length }; },
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    tileClient: async (tx, ty, dy = 0) => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(tx, ty); return window.__t.toClient(w.x, w.y + dy); },
    onCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    counts: () => { const l = world().children.list; return { total: l.length, rt: l.filter((o) => o.type === 'RenderTexture').length,
      rtVisible: l.filter((o) => o.type === 'RenderTexture' && o.visible).length, containers: l.filter((o) => o.type === 'Container').length }; },
    chat: () => H().store.getState().game.chat.map((l) => l.text),
    banner: () => { const e = document.querySelector('.area-banner-title'); return e ? e.textContent : null; },
    trees: async () => { const { CONTENT } = await import('/src/app/registry.ts'); return [...CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, defId: t.defId })); },
    // pixel check: decode a screenshot in-page and sample points; returns how many samples equal the clear colour
    sample: (b64, pts, clear) => new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const k = img.width / window.innerWidth; let bad = 0, n = 0; const badPts = [];
      for (const p of pts) { const d = x.getImageData(Math.round(p.x * k), Math.round(p.y * k), 1, 1).data; n++;
        if (Math.abs(d[0] - clear[0]) <= 3 && Math.abs(d[1] - clear[1]) <= 3 && Math.abs(d[2] - clear[2]) <= 3) { bad++; if (badPts.length < 5) badPts.push(p); } }
      res({ n, bad, badPts }); }; img.src = 'data:image/png;base64,' + b64; }),
  };
})();`;

// Route (tile coords): dense polyline spawn -> Fernhaven bank front.
const LEGS = [
  [18, 15],
  [39, 15],
  [47, 15],
  [66, 15],
  [66, 53],
  [102, 53],
  [102, 69],
  [94, 69],
  [94, 63],
];
function dense(legs) {
  const out = [];
  for (let i = 1; i < legs.length; i++) {
    const [ax, ay] = legs[i - 1];
    const [bx, by] = legs[i];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k < n; k++)
      out.push({
        x: ax + Math.sign(bx - ax) * Math.min(k, Math.abs(bx - ax)),
        y: ay + Math.sign(by - ay) * Math.min(k, Math.abs(by - ay)),
      });
  }
  out.push({ x: legs.at(-1)[0], y: legs.at(-1)[1] });
  return out;
}
const ROUTE = dense(LEGS);
// chunk borders crossed by the route: [label, axis, line, before tile, after tile]
const BORDERS = [
  { id: 'x32', axis: 'x', line: 32, before: { x: 30, y: 15 }, after: { x: 34, y: 15 } },
  { id: 'x64', axis: 'x', line: 64, before: { x: 62, y: 15 }, after: { x: 66, y: 15 } },
  { id: 'y32', axis: 'y', line: 32, before: { x: 66, y: 30 }, after: { x: 66, y: 34 } },
  { id: 'x96', axis: 'x', line: 96, before: { x: 94, y: 53 }, after: { x: 98, y: 53 } },
  { id: 'y64', axis: 'y', line: 64, before: { x: 102, y: 62 }, after: { x: 102, y: 66 } },
];

async function runPhase(cdp, phase, touch, errors) {
  const T = (e) => cdp.eval(`window.__t.${e}`);
  const t0 = Date.now();
  const check = async (id, title, fn) => {
    try {
      results.push({ phase, id, title, ok: true, ev: (await fn()) ?? '' });
    } catch (e) {
      results.push({ phase, id, title, ok: false, ev: e.message });
    }
  };
  const waitFor = async (what, pred, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout: ' + what);
      await sleep(50);
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
  };
  const shot = async (name) => {
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(SHOTS, `${phase}-${name}.png`), Buffer.from(r.data, 'base64'));
    return r.data;
  };
  const settleCamera = (tx, ty) => waitStill(() => T(`tileClient(${tx}, ${ty})`));

  const obs = {
    banners: new Set(),
    chat: new Set(),
    maxRt: 0,
    maxRtVisible: 0,
    maxContainers: 0,
    minContainers: 1e9,
    samples: 0,
  };
  const observe = async () => {
    const c = await T('counts()');
    obs.maxRt = Math.max(obs.maxRt, c.rt);
    obs.maxRtVisible = Math.max(obs.maxRtVisible, c.rtVisible);
    obs.maxContainers = Math.max(obs.maxContainers, c.containers);
    obs.minContainers = Math.min(obs.minContainers, c.containers);
    obs.samples++;
    const b = await T('banner()');
    if (b) obs.banners.add(b);
    for (const l of await T('chat()')) obs.chat.add(l);
  };

  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(400);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: ORIGIN.split('/?')[0],
    storageTypes: 'local_storage',
  });
  await cdp.send('Page.navigate', { url: ORIGIN });
  try {
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
  } catch (e) {
    const d = await cdp
      .eval(
        `JSON.stringify({ h: !!window.__idleRpg, url: location.href, err: document.body.innerText.slice(0, 200) })`,
      )
      .catch((x) => String(x));
    throw new Error(e.message + ' ' + d + ' errors ' + errors.slice(0, 3).join('|'));
  }
  await sleep(1000);

  const start = await T('pos()');
  const allTrees = await T('trees()');
  let tapsTotal = 0;

  /** Walk the dense ROUTE with real taps: tap the furthest on-screen route tile ahead, repeat. */
  const walkRoute = async (toIdx, label) => {
    let stuck = 0;
    for (let iter = 0; iter < 120; iter++) {
      const p = await T('pos()');
      await settleCamera(p.x, p.y);
      let i = 0;
      let best = 1e9;
      for (let k = 0; k < ROUTE.length; k++) {
        const d = Math.abs(ROUTE[k].x - p.x) + Math.abs(ROUTE[k].y - p.y);
        if (d <= best) {
          best = d;
          i = k;
        }
      }
      if (i >= toIdx && best === 0 && p.path === 0) return iter;
      const goal = Math.min(toIdx, ROUTE.length - 1);
      // furthest route tile ahead that is visible on the canvas (margin keeps it clear of HUD edges)
      let tgt = null;
      for (let j = goal; j > i; j--) {
        const t = ROUTE[j];
        const c = await T(`tileClient(${t.x}, ${t.y})`);
        if (
          c.x > 20 &&
          c.y > 20 &&
          c.x < (await cdp.eval('innerWidth')) - 20 &&
          c.y < (await cdp.eval('innerHeight')) - 20 &&
          (await T(`onCanvas(${c.x}, ${c.y})`))
        ) {
          tgt = { ...t, c };
          break;
        }
      }
      if (!tgt) {
        // arrived: within 1 tile of the goal tile and standing still
        const G = ROUTE[goal];
        if (p.path === 0 && Math.abs(G.x - p.x) + Math.abs(G.y - p.y) <= 1) return iter;
        const nx = ROUTE[Math.min(i + 1, ROUTE.length - 1)];
        const cc = await T(`tileClient(${nx.x}, ${nx.y})`);
        const el = await cdp.eval(
          `(() => { const e = document.elementFromPoint(${cc.x}, ${cc.y}); return e ? e.tagName + '.' + e.className : null; })()`,
        );
        throw new Error(
          `${label}: no visible route tile ahead of ${JSON.stringify(p)} idx ${i} goal ${goal}; next ${JSON.stringify(nx)} at ${JSON.stringify(cc)} top ${el}`,
        );
      }
      // nudge when the previous tap did not move us (blocked tile)
      const nud = [
        [0, 0],
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
        [1, 1],
        [-1, -1],
      ][stuck % 7];
      const c =
        nud[0] || nud[1] ? await T(`tileClient(${tgt.x + nud[0]}, ${tgt.y + nud[1]})`) : tgt.c;
      await tap(c.x, c.y);
      tapsTotal++;
      const before = p;
      await sleep(120);
      // wait until the walk ends (or 6 s)
      const end = Date.now() + 6000;
      while (Date.now() < end) {
        const q = await T('pos()');
        if (q.path === 0) break;
        await sleep(60);
      }
      await observe();
      const q = await T('pos()');
      if (q.x === before.x && q.y === before.y) stuck++;
      else stuck = 0;
      if (stuck > 14)
        throw new Error(`${label}: stuck at ${JSON.stringify(q)} aiming ${JSON.stringify(tgt)}`);
    }
    throw new Error(`${label}: iterations exhausted at ${JSON.stringify(await T('pos()'))}`);
  };
  const idxOf = (x, y) => ROUTE.findIndex((t) => t.x === x && t.y === y);
  const clear = [27, 42, 28]; // createGame backgroundColor #1b2a1c

  /** Screenshot + pixel-check a chunk border: samples straddling the border line near the player. */
  const borderCheck = async (b, side, tile) => {
    await settleCamera(tile.x, tile.y);
    await sleep(300);
    const pts = [];
    for (let d = -9; d <= 9; d++) {
      for (const o of [-1, -0.5, 0, 0.5, 1]) {
        const tx = b.axis === 'x' ? b.line + o - 0.5 : tile.x + d;
        const ty = b.axis === 'y' ? b.line + o - 0.5 : tile.y + d;
        const c = await T(`tileClient(${tx}, ${ty})`);
        if (
          c.x > 0 &&
          c.y > 0 &&
          c.x < (await cdp.eval('innerWidth')) &&
          c.y < (await cdp.eval('innerHeight')) &&
          (await T(`onCanvas(${c.x}, ${c.y})`))
        )
          pts.push(c);
      }
    }
    const data = await shot(`${b.id}-${side}`);
    const r = await T(
      `sample(${JSON.stringify(data)}, ${JSON.stringify(pts)}, ${JSON.stringify(clear)})`,
    );
    return { ...r, shot: `${phase}-${b.id}-${side}.png` };
  };

  const lines = {};
  // ---- 1. spawn -> causeway -> Whispering Wood
  await check('wood', 'walk spawn -> causeway -> Whispering Wood: banner + chat', async () => {
    expect(start.x === 18 && start.y === 15, 'spawn ' + JSON.stringify(start));
    await shot('00-spawn');
    await walkRoute(idxOf(30, 15), 'to x30');
    const pre = await borderCheck(BORDERS[0], 'before', BORDERS[0].before);
    await walkRoute(idxOf(39, 15), 'to causeway end');
    const post = await borderCheck(BORDERS[0], 'after', BORDERS[0].after);
    lines.x32 = [pre, post];
    await walkRoute(idxOf(47, 15), 'to wood');
    await sleep(500);
    await observe();
    await shot('01-wood');
    const p = await T('pos()');
    expect(p.x >= 40, 'pos ' + JSON.stringify(p));
    const banners = [...obs.banners];
    const chat = [...obs.chat].filter((l) => /Whispering Wood/i.test(l));
    expect(
      banners.some((b) => /Whispering Wood/i.test(b)),
      'banners seen ' + JSON.stringify(banners),
    );
    expect(
      chat.length > 0,
      'chat lacks Whispering Wood: ' + JSON.stringify([...obs.chat].slice(-6)),
    );
    return `pos ${p.x},${p.y}; banners ${JSON.stringify(banners)}; chat ${JSON.stringify(chat)}; taps ${tapsTotal}`;
  });

  // ---- 2. forest road, chop a tree
  await check('chop', 'chop a forest tree -> log', async () => {
    await walkRoute(idxOf(62, 15), 'to x62');
    const x64a = await borderCheck(BORDERS[1], 'before', BORDERS[1].before);
    await walkRoute(idxOf(66, 15), 'to road');
    const x64b = await borderCheck(BORDERS[1], 'after', BORDERS[1].after);
    lines.x64 = [x64a, x64b];
    await walkRoute(idxOf(66, 20), 'to road south');
    const p = await T('pos()');
    const near = allTrees
      .filter((t) => t.defId === 'tree' && t.x >= 40 && t.x < 80)
      .sort(
        (a, b) =>
          Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)),
      )[0];
    expect(near, 'no forest tree');
    // ensure an axe (starting kit may have one)
    const hasAxe = await cdp.eval(
      `window.__idleRpg.store.getState().game.inventory.slots.some((s) => s && s.itemId.endsWith('_axe'))`,
    );
    expect(hasAxe, 'no axe in starting inventory');
    const logs0 = await cdp.eval(
      `window.__idleRpg.store.getState().game.inventory.slots.filter((s) => s && s.itemId === 'logs').reduce((a, s) => a + s.quantity, 0)`,
    );
    // walk close by (real taps along the route if the tree is off-screen is not needed: it is within view)
    await settleCamera(near.x, near.y);
    let c = await T(`tileClient(${near.x}, ${near.y})`);
    // phone view is shorter: step along the road toward the tree (real taps) until it is on screen
    for (let ty = p.y + 1; ty <= near.y && !(await T(`onCanvas(${c.x}, ${c.y})`)); ty++) {
      await tapWalk(66, ty);
      await settleCamera(66, ty);
      c = await T(`tileClient(${near.x}, ${near.y})`);
    }
    for (let tx = 67; tx < near.x && !(await T(`onCanvas(${c.x}, ${c.y})`)); tx++) {
      await tapWalk(tx, near.y);
      await settleCamera(tx, near.y);
      c = await T(`tileClient(${near.x}, ${near.y})`);
    }
    expect(await T(`onCanvas(${c.x}, ${c.y})`), 'tree not on canvas ' + JSON.stringify(c));
    await tap(c.x, c.y);
    const logs = await waitFor(
      'log in inventory',
      async () => {
        const n = await cdp.eval(
          `window.__idleRpg.store.getState().game.inventory.slots.filter((s) => s && s.itemId === 'logs').reduce((a, s) => a + s.quantity, 0)`,
        );
        return n > logs0 ? n : 0;
      },
      20000,
    );
    await shot('02-chopped');
    return `tree ${near.id} (${near.x},${near.y}) from ${p.x},${p.y}; logs ${logs0} -> ${logs}`;
  });

  // ---- 3. forest road south, shore, east, Fernhaven; crossing borders
  await check(
    'borders',
    'no clear-colour seams at chunk borders x32, x64, y32, x96, y64',
    async () => {
      const out = [...lines.x32, ...lines.x64];
      for (const [bi, a, b] of [
        [2, [66, 30], [66, 34]],
        [3, [94, 53], [98, 53]],
        [4, [102, 62], [102, 66]],
      ]) {
        const B = BORDERS[bi];
        await walkRoute(idxOf(...a), 'to ' + B.id + ' before');
        out.push(await borderCheck(B, 'before', B.before));
        await walkRoute(idxOf(...b), 'to ' + B.id + ' after');
        out.push(await borderCheck(B, 'after', B.after));
      }
      lines.borders = out;
      const bad = out.filter((r) => r.bad > 0);
      expect(
        out.every((r) => r.n >= 10),
        'too few samples ' + JSON.stringify(out.map((r) => r.n)),
      );
      expect(bad.length === 0, 'clear-colour samples at ' + JSON.stringify(bad));
      return out.map((r) => `${r.shot}:${r.n} samples/${r.bad} clear`).join('; ');
    },
  );

  /** Tap-walk to a specific tile (<= ~9 tiles away, on screen) with real taps. */
  async function tapWalk(x, y) {
    for (let i = 0; i < 8; i++) {
      const p = await T('pos()');
      if (p.x === x && p.y === y && p.path === 0) return;
      const c = await T(`tileClient(${x}, ${y})`);
      await tap(c.x, c.y);
      await sleep(120);
      const end = Date.now() + 5000;
      while (Date.now() < end && (await T('pos()')).path > 0) await sleep(60);
      await observe();
    }
    throw new Error(`tapWalk ${x},${y} ended at ${JSON.stringify(await T('pos()'))}`);
  }

  // ---- 4. Fernhaven bank via a real tap on a booth
  await check('bank', 'walk to Fernhaven and open the bank by tapping a booth', async () => {
    await walkRoute(idxOf(94, 63), 'to fernhaven bank front');
    await settleCamera(93, 62);
    await shot('03-fernhaven');
    const p0 = await T('pos()');
    let opened = false;
    let tried = [];
    for (const dy of [0, -12, -24, 8]) {
      const c = await T(`tileClient(93, 62, ${dy})`);
      if (!(await T(`onCanvas(${c.x}, ${c.y})`))) continue;
      await tap(c.x, c.y);
      tried.push(dy);
      const end = Date.now() + 5000;
      while (Date.now() < end && !opened) {
        opened = await cdp.eval('window.__idleRpg.store.getState().game.bankOpen');
        if (!opened) await sleep(80);
      }
      if (opened) break;
    }
    await observe();
    const area = await T('banner()');
    await shot('04-bank-open');
    expect(
      opened,
      `bankOpen false after tapping booth (93,62) from ${JSON.stringify(p0)} dy tried ${JSON.stringify(tried)}`,
    );
    const panel = await cdp.eval(`!!document.querySelector('[aria-label*="Bank" i], .bank')`);
    return `from ${p0.x},${p0.y}; tapped booth dy ${tried.at(-1)}; bankOpen true; bank panel in DOM ${panel}; banner ${area}`;
  });

  await check(
    'chunks',
    'live chunk RenderTextures <= 9; entity views bounded while crossing chunks',
    async () => {
      expect(obs.samples > 20, 'samples ' + obs.samples);
      const maxTrees = (() => {
        // max trees inside any 3x3 chunk window
        const per = new Map();
        for (const t of allTrees) {
          const k = `${Math.floor(t.x / 32)},${Math.floor(t.y / 32)}`;
          per.set(k, (per.get(k) ?? 0) + 1);
        }
        let m = 0;
        for (let cx = 0; cx < 4; cx++)
          for (let cy = 0; cy < 3; cy++) {
            let s = 0;
            for (let dx = -1; dx <= 1; dx++)
              for (let dy = -1; dy <= 1; dy++) s += per.get(`${cx + dx},${cy + dy}`) ?? 0;
            m = Math.max(m, s);
          }
        return m;
      })();
      expect(obs.maxRt <= 9, `RT created max ${obs.maxRt}`);
      expect(obs.maxRtVisible <= 9, `RT visible max ${obs.maxRtVisible}`);
      // containers = trees + objects + npcs + player etc. in the window; world has allTrees.length trees in total
      expect(
        obs.maxContainers < allTrees.length,
        `containers ${obs.maxContainers} >= world trees ${allTrees.length}`,
      );
      expect(
        obs.maxContainers <= maxTrees + 40,
        `containers ${obs.maxContainers} > window max trees ${maxTrees} + 40`,
      );
      return `RT max ${obs.maxRt} (visible ${obs.maxRtVisible}); containers min ${obs.minContainers} max ${obs.maxContainers}; world trees ${allTrees.length}; max trees in a 3x3 window ${maxTrees}; samples ${obs.samples}`;
    },
  );

  await check('reload', 'reload far from spawn: player restored at the same tile', async () => {
    await cdp.eval(
      'window.__idleRpg.store.getState().closeBank && window.__idleRpg.store.getState().closeBank()',
    );
    const p = await T('pos()');
    expect(p.x > 80, 'not far from spawn ' + JSON.stringify(p));
    await sleep(2500); // autosave debounce
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
    await sleep(1200);
    const q = await T('pos()');
    await shot('05-reloaded');
    expect(q.x === p.x && q.y === p.y, `before ${JSON.stringify(p)} after ${JSON.stringify(q)}`);
    const c = await T('counts()');
    expect(c.rtVisible >= 1 && c.rtVisible <= 9, 'RT after reload ' + JSON.stringify(c));
    return `restored ${q.x},${q.y}; RT visible ${c.rtVisible}`;
  });

  await check('errors', '0 console errors', async () => {
    expect(errors.length === 0, errors.slice(0, 5).join(' | '));
    return '0';
  });
  results.push({
    phase,
    id: 'time',
    title: 'phase wall-clock',
    ok: true,
    ev: `${((Date.now() - t0) / 1000).toFixed(1)} s, ${tapsTotal} route taps`,
  });
}

async function main() {
  const vite = await startVite();
  let code = 1;
  let cdp;
  try {
    cdp = await launchChrome({ width: 1280, height: 800 });
    const errors = [];
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown')
        errors.push(
          `exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`,
        );
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        errors.push(
          `console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`,
        );
      else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
        errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    const phases = [
      { name: 'desktop', w: 1280, h: 800, touch: false, dpr: 1 },
      { name: 'phone', w: 390, h: 844, touch: true, dpr: 2 },
    ];
    for (const p of phases) {
      errors.length = 0;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: p.w,
        height: p.h,
        deviceScaleFactor: p.dpr,
        mobile: p.touch,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: p.touch, maxTouchPoints: 5 });
      try {
        await runPhase(cdp, p.name, p.touch, errors);
      } catch (e) {
        results.push({ phase: p.name, id: 'fatal', title: 'phase', ok: false, ev: e.message });
      }
    }
    for (const r of results)
      console.log(
        `${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id}: ${r.title}${r.ev ? '\n      ' + r.ev : ''}`,
      );
    const failed = results.filter((r) => !r.ok).length;
    console.log(
      `\nbigWorld e2e: ${results.length - failed}/${results.length} ok; wall ${((Date.now() - T0) / 1000).toFixed(0)} s; shots in ${SHOTS}`,
    );
    code = failed ? 1 : 0;
  } catch (e) {
    console.error(e);
  } finally {
    try {
      await cdp?.close();
    } catch {
      /* ignore */
    }
    killChild(vite);
  }
  killTracked();
  process.exit(code);
}
setTimeout(() => {
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();
main();
