// Big-world walk-through e2e: spawn -> causeway -> Whispering Wood -> forest road -> Greatmere shore -> Fernhaven bank.
// Real taps only for travel/chop/bank. FAST BASE: desktop + phone as parallel children (own port each), 60 ms ticks,
// route scanning page-side (one eval per tap), chunk-border pixels read from Phaser's own snapshot (no screenshot stall),
// autosave awaited on localStorage instead of a fixed sleep.
// Run: node tests/e2e/bigWorld.e2e.mjs   Exit 0 = all pass. SHOTS_DIR=... for screenshots.
import { check, expect, forEachCombo, runParallel, waitStill, withGame } from './lib.mjs';

const PORT = 7860;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const PAGE_T = `(() => {
  const H = () => window.__idleRpg;
  const scene = () => H().scene();
  const world = () => scene().camera.scene;
  const T = (window.__t = {
    P: null,
    init: async () => { T.P = (await import('/src/render/projection.ts')).isoProjection; return true; },
    pos: () => { const g = H().store.getState().game; return { x: g.movement.position.x, y: g.movement.position.y, path: g.movement.path.length }; },
    tc: (tx, ty, dy = 0) => { const w = T.P.tileToWorld(tx, ty); const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((w.x - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((w.y + dy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    me: () => { const p = T.pos(); return T.tc(p.x, p.y); },
    onCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    visible: (c, m) => c.x > m && c.y > m && c.x < innerWidth - m && c.y < innerHeight - m && T.onCanvas(c.x, c.y),
    // furthest route tile ahead (idx > nearest, <= goal) that is on the canvas; margin 20 px, then 1 px (phone zoom can leave 3 px)
    pick: (route, toIdx) => { const p = T.pos(); let i = 0, best = 1e9;
      for (let k = 0; k < route.length; k++) { const d = Math.abs(route[k].x - p.x) + Math.abs(route[k].y - p.y); if (d <= best) { best = d; i = k; } }
      const goal = Math.min(toIdx, route.length - 1);
      for (const m of [20, 1]) for (let j = goal; j > i; j--) { const c = T.tc(route[j].x, route[j].y); if (T.visible(c, m)) return { p, i, best, tgt: { ...route[j], c } }; }
      const nx = route[Math.min(i + 1, route.length - 1)]; const cc = T.tc(nx.x, nx.y); const e = document.elementFromPoint(cc.x, cc.y);
      return { p, i, best, tgt: null, nx, cc, top: e ? e.tagName + '.' + e.className : null }; },
    spawnTotal: async () => { const w = await import('/src/features/world/index.ts'); return w.WORLD_DEF.spawns.length + w.WORLD_OBJECT_SPAWNS.length + w.WORLD_NPC_SPAWNS.length; },
    obs: () => { const l = world().children.list; const e = document.querySelector('.area-banner-title');
      return { rt: l.filter((o) => o.type === 'RenderTexture').length, rtVisible: l.filter((o) => o.type === 'RenderTexture' && o.visible).length,
        containers: l.filter((o) => o.type === 'Container').length, banner: e ? e.textContent : null, chat: H().store.getState().game.chat.map((x) => x.text) }; },
    trees: async () => { const { CONTENT } = await import('/src/app/registry.ts'); return [...CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, defId: t.defId })); },
    logs: () => H().store.getState().game.inventory.slots.filter((s) => s && s.itemId === 'logs').reduce((a, s) => a + s.quantity, 0),
    // Pixel check straddling a chunk border: Phaser's own frame snapshot (the canvas pixels, no CDP screenshot stall).
    border: (b, tile, clear) => new Promise((res) => {
      const pts = [];
      for (let d = -9; d <= 9; d++) for (const o of [-1, -0.5, 0, 0.5, 1]) {
        const tx = b.axis === 'x' ? b.line + o - 0.5 : tile.x + d, ty = b.axis === 'y' ? b.line + o - 0.5 : tile.y + d;
        const c = T.tc(tx, ty); if (c.x > 0 && c.y > 0 && c.x < innerWidth && c.y < innerHeight && T.onCanvas(c.x, c.y)) pts.push(c); }
      world().game.renderer.snapshot((img) => { const go = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext('2d'); x.drawImage(img, 0, 0); const r = world().game.canvas.getBoundingClientRect(); let bad = 0; const badPts = [];
        for (const p of pts) { const d = x.getImageData(Math.min(img.width - 1, Math.round(((p.x - r.left) / r.width) * img.width)), Math.min(img.height - 1, Math.round(((p.y - r.top) / r.height) * img.height)), 1, 1).data;
          if (Math.abs(d[0] - clear[0]) <= 3 && Math.abs(d[1] - clear[1]) <= 3 && Math.abs(d[2] - clear[2]) <= 3) { bad++; if (badPts.length < 5) badPts.push(p); } }
        res({ n: pts.length, bad, badPts }); };
        if (img.complete) go(); else img.onload = go; });
    }),
  });
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
// chunk borders crossed by the route
const BORDERS = [
  { id: 'x32', axis: 'x', line: 32, before: { x: 30, y: 15 }, after: { x: 34, y: 15 } },
  { id: 'x64', axis: 'x', line: 64, before: { x: 62, y: 15 }, after: { x: 66, y: 15 } },
  { id: 'y32', axis: 'y', line: 32, before: { x: 66, y: 30 }, after: { x: 66, y: 34 } },
  { id: 'x96', axis: 'x', line: 96, before: { x: 94, y: 53 }, after: { x: 98, y: 53 } },
  { id: 'y64', axis: 'y', line: 64, before: { x: 102, y: 62 }, after: { x: 102, y: 66 } },
];
const CLEAR = [27, 42, 28]; // createGame backgroundColor #1b2a1c
const J = JSON.stringify;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_T }); // survives the reload check
    await g.eval(PAGE_T);
    await g.eval('window.__t.init()');
    const T = (e) => g.eval(`window.__t.${e}`);
    const phone = g.touch;
    const tapXY = async (x, y) => {
      if (phone) {
        await g.cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await g.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased'])
          await g.cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            button: 'left',
            clickCount: 1,
          });
      }
    };
    const settleCamera = () => waitStill(() => T('me()'), { intervalMs: 60 });
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
      const c = await T('obs()');
      obs.maxRt = Math.max(obs.maxRt, c.rt);
      obs.maxRtVisible = Math.max(obs.maxRtVisible, c.rtVisible);
      obs.maxContainers = Math.max(obs.maxContainers, c.containers);
      obs.minContainers = Math.min(obs.minContainers, c.containers);
      obs.samples++;
      if (c.banner) obs.banners.add(c.banner);
      for (const l of c.chat) obs.chat.add(l);
    };
    const waitWalkEnd = async (ms) => {
      // the tap sets a path (or moves us) almost at once; then wait until the walk ends
      await g.waitFor(async () => (await T('pos()')).path > 0, { timeoutMs: 700 }).catch(() => {});
      await g
        .waitFor(async () => (await T('pos()')).path === 0, { timeoutMs: ms, label: 'walk end' })
        .catch(() => {});
    };
    const start = await T('pos()');
    const allTrees = await T('trees()');
    let tapsTotal = 0;

    /** Walk the dense ROUTE with real taps: tap the furthest on-screen route tile ahead, repeat. */
    const walkRoute = async (toIdx, label) => {
      let stuck = 0;
      for (let iter = 0; iter < 120; iter++) {
        await settleCamera();
        const { p, i, best, tgt, nx, cc, top } = await T(`pick(${J(ROUTE)}, ${toIdx})`);
        if (i >= toIdx && best === 0 && p.path === 0) return iter;
        if (!tgt) {
          const G = ROUTE[Math.min(toIdx, ROUTE.length - 1)];
          if (p.path === 0 && Math.abs(G.x - p.x) + Math.abs(G.y - p.y) <= 1) return iter;
          throw new Error(
            `${label}: no visible route tile ahead of ${J(p)} idx ${i} goal ${toIdx}; next ${J(nx)} at ${J(cc)} top ${top}`,
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
        const c = nud[0] || nud[1] ? await T(`tc(${tgt.x + nud[0]}, ${tgt.y + nud[1]})`) : tgt.c;
        await tapXY(c.x, c.y);
        tapsTotal++;
        await waitWalkEnd(8000);
        await observe();
        const q = await T('pos()');
        stuck = q.x === p.x && q.y === p.y ? stuck + 1 : 0;
        if (stuck > 14) throw new Error(`${label}: stuck at ${J(q)} aiming ${J(tgt)}`);
      }
      throw new Error(`${label}: iterations exhausted at ${J(await T('pos()'))}`);
    };
    const idxOf = (x, y) => ROUTE.findIndex((t) => t.x === x && t.y === y);
    /** Tap-walk to a specific tile (<= ~9 tiles away, on screen) with real taps. */
    const tapWalk = async (x, y) => {
      for (let i = 0; i < 8; i++) {
        const p = await T('pos()');
        if (p.x === x && p.y === y && p.path === 0) return;
        const c = await T(`tc(${x}, ${y})`);
        await tapXY(c.x, c.y);
        await waitWalkEnd(5000);
        await observe();
      }
      throw new Error(`tapWalk ${x},${y} ended at ${J(await T('pos()'))}`);
    };
    const borderCheck = async (b, side, tile) => {
      await settleCamera();
      const r = await T(`border(${J(b)}, ${J(tile)}, ${J(CLEAR)})`);
      await g.screenshot(`bigworld-${vp}-${b.id}-${side}`); // only when SHOTS_DIR is set
      return { ...r, shot: `${vp}-${b.id}-${side}` };
    };

    const lines = {};
    // ---- 1. spawn -> causeway -> Whispering Wood
    await check('wood', 'walk spawn -> causeway -> Whispering Wood: banner + chat', async () => {
      expect(start.x === 18 && start.y === 15, 'spawn ' + J(start));
      await walkRoute(idxOf(30, 15), 'to x30');
      const pre = await borderCheck(BORDERS[0], 'before', BORDERS[0].before);
      await walkRoute(idxOf(39, 15), 'to causeway end');
      const post = await borderCheck(BORDERS[0], 'after', BORDERS[0].after);
      lines.x32 = [pre, post];
      await walkRoute(idxOf(47, 15), 'to wood');
      await observe();
      const p = await T('pos()');
      expect(p.x >= 40, 'pos ' + J(p));
      const banners = [...obs.banners];
      const chat = [...obs.chat].filter((l) => /Whispering Wood/i.test(l));
      expect(
        banners.some((b) => /Whispering Wood/i.test(b)),
        'banners seen ' + J(banners),
      );
      expect(chat.length > 0, 'chat lacks Whispering Wood: ' + J([...obs.chat].slice(-6)));
      return `pos ${p.x},${p.y}; banners ${J(banners)}; chat ${J(chat)}; taps ${tapsTotal}`;
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
      const hasAxe = await g.eval(
        `window.__idleRpg.store.getState().game.inventory.slots.some((s) => s && s.itemId.endsWith('_axe'))`,
      );
      expect(hasAxe, 'no axe in starting inventory');
      const logs0 = await T('logs()');
      await g.setLevels({ woodcutting: 20 }); // precondition: a chop that lands inside one short 60 ms-tick session
      await settleCamera();
      let c = await T(`tc(${near.x}, ${near.y})`);
      // phone view is shorter: step along the road toward the tree (real taps) until it is on screen
      for (let ty = p.y + 1; ty <= near.y && !(await T(`onCanvas(${c.x}, ${c.y})`)); ty++) {
        await tapWalk(66, ty);
        await settleCamera();
        c = await T(`tc(${near.x}, ${near.y})`);
      }
      for (let tx = 67; tx < near.x && !(await T(`onCanvas(${c.x}, ${c.y})`)); tx++) {
        await tapWalk(tx, near.y);
        await settleCamera();
        c = await T(`tc(${near.x}, ${near.y})`);
      }
      expect(await T(`onCanvas(${c.x}, ${c.y})`), 'tree not on canvas ' + J(c));
      await g.setTickMs(150); // gather sessions end in ~1 s at 60 ms ticks
      await tapXY(c.x, c.y);
      const logs = await g.waitFor(async () => ((await T('logs()')) > logs0 ? T('logs()') : 0), {
        timeoutMs: 20000,
        label: 'log in inventory',
      });
      await g.setTickMs(60);
      await g.screenshot(`bigworld-${vp}-chopped`);
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
        const bad = out.filter((r) => r.bad > 0);
        expect(
          out.every((r) => r.n >= 10),
          'too few samples ' + J(out.map((r) => r.n)),
        );
        expect(bad.length === 0, 'clear-colour samples at ' + J(bad));
        return out.map((r) => `${r.shot}:${r.n} samples/${r.bad} clear`).join('; ');
      },
    );

    // ---- 4. Fernhaven bank via a real tap on a booth
    await check('bank', 'walk to Fernhaven and open the bank by tapping a booth', async () => {
      await walkRoute(idxOf(94, 63), 'to fernhaven bank front');
      await settleCamera();
      const p0 = await T('pos()');
      let opened = false;
      const tried = [];
      for (const dy of [0, -12, -24, 8]) {
        const c = await T(`tc(93, 62, ${dy})`);
        if (!(await T(`onCanvas(${c.x}, ${c.y})`))) continue;
        await tapXY(c.x, c.y);
        tried.push(dy);
        opened = await g.waitState('', 'g => g.bankOpen', { timeoutMs: 3000 }).then(
          () => true,
          () => false,
        );
        if (opened) break;
      }
      await observe();
      const area = (await T('obs()')).banner;
      await g.screenshot(`bigworld-${vp}-bank-open`);
      expect(
        opened,
        `bankOpen false after tapping booth (93,62) from ${J(p0)} dy tried ${J(tried)}`,
      );
      const panel = await g.eval(`!!document.querySelector('[aria-label*="Bank" i], .bank')`);
      return `from ${p0.x},${p0.y}; tapped booth dy ${tried.at(-1)}; bankOpen true; bank panel in DOM ${panel}; banner ${area}`;
    });

    await check(
      'chunks',
      'live chunk RenderTextures <= 9; entity views bounded while crossing chunks',
      async () => {
        expect(obs.samples > 20, 'samples ' + obs.samples);
        const per = new Map();
        for (const t of allTrees) {
          const k = `${Math.floor(t.x / 32)},${Math.floor(t.y / 32)}`;
          per.set(k, (per.get(k) ?? 0) + 1);
        }
        let maxTrees = 0; // max trees inside any 3x3 chunk window
        for (let cx = 0; cx < 4; cx++)
          for (let cy = 0; cy < 3; cy++) {
            let s = 0;
            for (let dx = -1; dx <= 1; dx++)
              for (let dy = -1; dy <= 1; dy++) s += per.get(`${cx + dx},${cy + dy}`) ?? 0;
            maxTrees = Math.max(maxTrees, s);
          }
        expect(obs.maxRt <= 9, `RT created max ${obs.maxRt}`);
        expect(obs.maxRtVisible <= 9, `RT visible max ${obs.maxRtVisible}`);
        // Rocks, fishing spots, booths and npcs share the world now, so compare with ALL entity spawns, not only trees.
        const spawnTotal = await T('spawnTotal()');
        expect(
          obs.maxContainers < spawnTotal,
          `containers ${obs.maxContainers} >= world entity spawns ${spawnTotal} (views not culled)`,
        );
        expect(
          obs.maxContainers <= maxTrees + 40,
          `containers ${obs.maxContainers} > window max trees ${maxTrees} + 40`,
        );
        return `RT max ${obs.maxRt} (visible ${obs.maxRtVisible}); containers min ${obs.minContainers} max ${obs.maxContainers}; world trees ${allTrees.length}; max trees in a 3x3 window ${maxTrees}; samples ${obs.samples}`;
      },
    );

    await check('reload', 'reload far from spawn: player restored at the same tile', async () => {
      await g.eval(
        'window.__idleRpg.store.getState().closeBank && window.__idleRpg.store.getState().closeBank()',
      );
      const p = await T('pos()');
      expect(p.x > 80, 'not far from spawn ' + J(p));
      // autosave debounce (1 s, real time): wait until the save in localStorage holds this tile, not a fixed sleep
      await g.waitFor(
        () =>
          g.eval(
            `Object.values(localStorage).some((v) => typeof v === 'string' && v.includes('"x":${p.x},"y":${p.y}'))`,
          ),
        { timeoutMs: 6000, label: 'autosave has the tile' },
      );
      await g.cdp.send('Page.navigate', { url: await g.eval('location.href') });
      await g.waitFor(() => g.eval('window.__e.ready() && !!window.__t').catch(() => false), {
        timeoutMs: 25000,
        label: 'ready after reload',
      });
      await g.waitFor(async () => (await T('obs()')).rtVisible >= 1, {
        timeoutMs: 8000,
        label: 'ground back',
      });
      const q = await T('pos()');
      expect(q.x === p.x && q.y === p.y, `before ${J(p)} after ${J(q)}`);
      const c = await T('obs()');
      expect(c.rtVisible >= 1 && c.rtVisible <= 9, 'RT after reload ' + J(c));
      return `restored ${q.x},${q.y}; RT visible ${c.rtVisible}`;
    });
  }),
);
