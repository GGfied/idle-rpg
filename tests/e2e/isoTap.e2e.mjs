/* global fetch, console */
// Isometric tap accuracy e2e: tap ground -> walks to THAT tile; tap tree trunk/canopy/just below feet -> chops it;
// tap empty ground between trees -> walks, no chop. Own vite on :5189 (E2E_PORT overrides), real mouse/touch taps.
// Run: node tests/e2e/isoTap.e2e.mjs      Exit 0 = all checks passed.
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hardTimeout, killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

hardTimeout(Number(process.env.E2E_MAX_MS ?? 6 * 60e3));

const PORT = Number(process.env.E2E_PORT ?? 5189);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

async function startVite() {
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    [
      '--config',
      resolve(ROOT, process.env.E2E_ROOT_CFG ?? 'tests/e2e/vite.frozen.config.mjs'),
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

// In-page helpers. All geometry here is computed independently of clientToTile/objectAtPoint
// (only tileToWorld + VIEW_HIT_BOUNDS data are reused), and the camera maths is cross-checked with Phaser's own getWorldPoint.
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const cam = () => H().scene().camera;
  const canvas = () => document.querySelector('canvas');
  const tw = (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  window.__t = {
    ready: () => { try { return !!(H() && H().store.getState().game && H().scene().camera && canvas()); } catch { return false; } },
    g: () => H().store.getState().game,
    // Centre the camera on world point (wx,wy) (+jitter), return a function-free descriptor.
    aim: (wx, wy) => { const c = cam(); c.stopFollow(); c.setScroll(wx - c.width / 2, wy - c.height / 2); return { sx: c.scrollX, sy: c.scrollY }; },
    toClient: (wx, wy) => {
      const c = cam(), r = canvas().getBoundingClientRect(), cv = canvas();
      const cx = (wx - (c.scrollX + c.width / 2)) * c.zoom + c.width / 2;
      const cy = (wy - (c.scrollY + c.height / 2)) * c.zoom + c.height / 2;
      const x = r.left + (cx * r.width) / cv.width, y = r.top + (cy * r.height) / cv.height;
      const back = c.getWorldPoint(cx, cy);
      const top = document.elementFromPoint(x, y);
      return { x, y, cvOk: top === cv, topTag: top ? top.tagName + '.' + top.className : null, camErr: Math.hypot(back.x - wx, back.y - wy), zoom: c.zoom, r: [r.left, r.top, r.width, r.height], cw: cv.width };
    },
    tw,
    walkable: async (x, y) => { const w = await import('/src/features/world/index.ts'); return w.createCollisionGrid().isWalkable(x, y); },
    boostWc: async () => { const m = await import('/src/core/progression/index.ts'); const s = H().store; const g = s.getState().game;
      s.setState({ game: { ...g, progression: m.addXp(g.progression, 'woodcutting', 5000).state } }); },
    place: (x, y) => { const s = H().store; const g = s.getState().game;
      s.setState({ game: { ...g, movement: { ...g.movement, position: { x, y }, path: [], running: false }, gathering: { ...g.gathering, session: null } } }); },
    pathEnd: () => { const m = H().store.getState().game.movement; return { end: m.path.length ? m.path[m.path.length - 1] : null, pos: m.position, len: m.path.length }; },
    session: () => H().store.getState().game.gathering.session,
    spy: () => { const s = H().store; window.__calls = []; const st = s.getState();
      if (st.__spied) return; const w = {};
      for (const k of ['interactTree', 'walkTo']) { const o = st[k]; w[k] = (...a) => { window.__calls.push(k + ':' + JSON.stringify(a)); return o(...a); }; }
      s.setState({ ...w, __spied: true });
      window.__seen = []; let last = null;
      s.subscribe((st) => { const n = st.game.gathering.session?.nodeId ?? null; if (n !== last) { last = n; if (n) window.__seen.push(n); } }); },
    clearCalls: () => { window.__calls.length = 0; window.__seen.length = 0; },
    logs: () => (JSON.stringify(H().store.getState().game.inventory).match(/logs/g) || []).length,
    seen: () => window.__seen.join(','),
    calls: () => window.__calls.join(' ; '),
    // Independent pixel oracle: world px of the opaque art of tree id that no tree drawn in front
    // (greater container depth) covers, nearest to want (world px). Same texture alpha the player sees.
    visiblePoint: (id, ids, want) => {
      const sc = cam().scene;
      const alphaAt = (tid, wx, wy) => {
        const v = sc.views.tree(tid); if (!v || !v.art.visible) return 0;
        const a = v.art, dx = wx - v.container.x - a.x, dy = wy - v.container.y - a.y;
        const c = Math.cos(-a.rotation), s = Math.sin(-a.rotation);
        const lx = (dx * c - dy * s) / a.scaleX + a.displayOriginX, ly = (dx * s + dy * c) / a.scaleY + a.displayOriginY;
        if (lx < 0 || ly < 0 || lx >= a.width || ly >= a.height) return 0;
        return sc.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), a.texture.key, a.frame.name);
      };
      const me = sc.views.tree(id), b = me.art.getBounds();
      const front = ids.filter((o) => o !== id && sc.views.tree(o) && sc.views.tree(o).container.depth >= me.container.depth);
      const vis = (x, y) => alphaAt(id, x, y) > 200 && !front.some((o) => alphaAt(o, x, y) > 0);
      let best = null;
      for (let y = b.y; y < b.bottom; y += 2) for (let x = b.x; x < b.right; x += 2) {
        // 3x3 neighbourhood (4 px) all visible: a tap here is unambiguously on this tree's leaves
        if (!(vis(x, y) && vis(x - 5, y) && vis(x + 5, y) && vis(x, y - 5) && vis(x, y + 5))) continue;
        const d = Math.hypot(x - want.x, y - want.y);
        if (!best || d < best.d) best = { x, y, d };
      }
      return best;
    },
    // "The tree you see wins": frontmost tree with an opaque pixel (alpha>20) at the world point; below the
    // feet line the rect alone counts. stable=false when a +-5 px (sway margin) neighbour disagrees or a non-tree claims it.
    expectedAt: (wx, wy) => {
      const sc = cam().scene;
      const alphaAt = (tid, x, y) => {
        const v = sc.views.tree(tid); if (!v || !v.art.visible) return -1;
        const a = v.art, dx = x - v.container.x - a.x, dy = y - v.container.y - a.y;
        const c = Math.cos(-a.rotation), s = Math.sin(-a.rotation);
        const lx = (dx * c - dy * s) / a.scaleX + a.displayOriginX, ly = (dx * s + dy * c) / a.scaleY + a.displayOriginY;
        if (lx < 0 || ly < 0 || lx >= a.width || ly >= a.height) return 0;
        return sc.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), a.texture.key, a.frame.name);
      };
      const one = (x, y) => {
        let best = null, bd = -Infinity, other = null;
        for (const r of window.__rects) {
          if (!(x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h)) continue;
          const isTree = r.kind === 'tree' || r.kind === 'oak_tree';
          if (!isTree) { other = r.id; continue; }
          if (y < r.feet.y) { const al = alphaAt(r.id, x, y); if (al >= 0 && al <= 20) continue; }
          const d = sc.views.tree(r.id)?.container.depth ?? 0;
          if (d > bd) { bd = d; best = r.id; }
        }
        return other ? 'obj:' + other : best;
      };
      const c = one(wx, wy);
      const stable = [[5, 0], [-5, 0], [0, -5], [0, 2]].every(([dx, dy]) => one(wx + dx, wy + dy) === c) && !(c && c.startsWith('obj:'));
      return { id: c, stable };
    },
    // A point where id is the visible tree although a tree drawn IN FRONT has its hit rect there (transparent gap).
    gapPoint: (id) => {
      const sc = cam().scene, me = sc.views.tree(id), b = me.art.getBounds(), md = me.container.depth;
      let best = null;
      for (let y = b.y; y < b.bottom; y += 2) for (let x = b.x; x < b.right; x += 2) {
        const gapOf = window.__rects.filter((r) => r.id !== id && (r.kind === 'tree' || r.kind === 'oak_tree')
          && (sc.views.tree(r.id)?.container.depth ?? 0) > md && x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h && y < r.feet.y);
        if (!gapOf.length) continue;
        const e = window.__t.expectedAt(x, y);
        if (e.id === id && e.stable) { const d = Math.hypot(x - me.container.x, y - me.container.y); if (!best || d < best.d) best = { x, y, d, over: gapOf.map((r) => r.id).join('+') }; }
      }
      return best;
    },
    allStanding: () => Object.keys(H().store.getState().game.gathering.nodes).length === 0,
    node: (id) => JSON.stringify(H().store.getState().game.gathering.nodes[id] ?? 'standing'),
    swings: () => (JSON.stringify(H().store.getState().game).match(/You swing your axe/g) || []).length,
    // Hit rects (world px) of every interactive target, from render's drawn-bounds data.
    rects: async () => {
      const r = await import('/src/render/index.ts');
      const w = await import('/src/features/world/index.ts');
      const reg = await import('/src/app/registry.ts');
      const out = window.__rects = [];
      const add = (id, kind, x, y) => { const b = r.VIEW_HIT_BOUNDS[kind]; const f = tw(x, y); const bw = Math.max(b.radius * 2, 32);
        out.push({ id, kind, x, y, feet: f, rect: { x: f.x - bw / 2, y: f.y - b.up, w: bw, h: b.up + 8 }, up: b.up, radius: b.radius }); };
      for (const t of w.TREE_SPAWNS) add(t.nodeId, t.defId, t.x, t.y);
      for (const o of w.OBJECT_SPAWNS) add(o.objectId, o.kind, o.x, o.y);
      for (const n of reg.CONTENT.npcs.values()) add(n.spawnId, 'npc', n.x, n.y);
      return out;
    },
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
  const waitFor = async (what, pred, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout: ' + what);
      await sleep(100);
    }
  };
  let phase = '';
  let touch = false;
  const check = async (id, title, fn) => {
    try {
      results.push({ phase, id, title, ok: true, ev: (await fn()) ?? '' });
    } catch (e) {
      results.push({ phase, id, title, ok: false, ev: e.message });
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
  const load = async () => {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: ORIGIN.slice(0, -1),
      storageTypes: 'local_storage',
    });
    await cdp.send('Page.navigate', { url: ORIGIN + (process.env.E2E_QUERY ?? '?tickMs=60') });
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
    await sleep(1000);
  };
  const inRect = (p, r, m = 0) =>
    p.x >= r.x - m && p.x < r.x + r.w + m && p.y >= r.y - m && p.y < r.y + r.h + m;

  /** Aim the camera at world (wx,wy)+jitter, return the client px of (wx,wy)+(ox,oy) or throw if not on the canvas. */
  async function aimAndLocate(wx, wy, ox, oy, jit) {
    await T(`aim(${wx + jit.x}, ${wy + jit.y})`);
    const c = await T(`toClient(${wx + ox}, ${wy + oy})`);
    return c;
  }

  async function runPhase() {
    await load();
    const rects = await T('rects()');
    await T('boostWc()');
    await T('spy()');
    const blockedTiles = new Set(rects.map((r) => `${r.x},${r.y}`));

    // ---- ground taps ----
    await check(
      'g1',
      'ground tile taps resolve to the tapped tile (centre + diamond edges)',
      async () => {
        const tiles = [
          [15, 13],
          [21, 14],
          [16, 16],
          [20, 12],
        ];
        const pts = [[0, 0]];
        for (const k of [0.92])
          for (const [dx, dy] of [
            [32, 0],
            [-32, 0],
            [0, 16],
            [0, -16],
            [16, 8],
            [-16, 8],
            [16, -8],
            [-16, -8],
          ])
            pts.push([dx * k, dy * k]);
        // two camera scrolls: centred, and a fractional offset so the tile is off-centre
        const jits = [
          { x: 0, y: 0 },
          { x: 37.5, y: -21.25 },
        ];
        let n = 0,
          skippedCover = 0,
          skippedObj = 0;
        const fails = [];
        let blockedN = 0;
        for (const [tx, ty] of tiles) {
          if (!(await T(`walkable(${tx}, ${ty})`))) {
            blockedN++;
            continue;
          }
          const f = await T(`tw(${tx}, ${ty})`);
          for (const jit of jits) {
            for (const [ox, oy] of pts) {
              const wp = { x: f.x + ox, y: f.y + oy };
              if (rects.some((r) => inRect(wp, r.rect, 2))) {
                skippedObj++;
                continue;
              }
              await T('place(18, 15)');
              const c = await aimAndLocate(f.x, f.y, ox, oy, jit);
              if (!c.cvOk) {
                skippedCover++;
                continue;
              }
              expect(c.camErr < 0.5, 'camera maths vs Phaser getWorldPoint err ' + c.camErr);
              await tap(c.x, c.y);
              const p0 = await T('pathEnd()');
              // a 1-step path may already be consumed by a tick: then the player stands on the tile
              const p = {
                ...p0,
                end: p0.end ?? (p0.pos.x !== 18 || p0.pos.y !== 15 ? p0.pos : null),
              };
              n++;
              if (!p.end || p.end.x !== tx || p.end.y !== ty)
                fails.push(
                  `tile(${tx},${ty}) off(${ox.toFixed(1)},${oy.toFixed(1)}) jit(${jit.x},${jit.y}) -> ${JSON.stringify(p.end)} @${c.x.toFixed(1)},${c.y.toFixed(1)} zoom ${c.zoom}`,
                );
            }
          }
        }
        expect(n >= 50, `too few taps ran: ${n} (cover-skipped ${skippedCover})`);
        expect(fails.length === 0, `${fails.length}/${n} wrong: ` + fails.slice(0, 6).join(' | '));
        return `${n} taps all resolved to tapped tile (${blockedN} unwalkable tiles skipped; skipped: ${skippedCover} HUD-covered, ${skippedObj} in an object's bounds)`;
      },
    );

    // ---- tree taps: "the tree you see wins" -> expected = frontmost tree with an opaque pixel under the point ----
    const treeIds = rects
      .filter((q) => q.kind === 'tree' || q.kind === 'oak_tree')
      .map((q) => q.id);
    for (const id of ['oak_4', 'tree_10', 'tree_9']) {
      const r = rects.find((q) => q.id === id);
      const spots = [
        ['trunk', 0, -6],
        ['canopy', 0, -(r.up - r.radius)],
        ['canopy-top', 0, -(r.up - 3)],
        ['below-feet', 0, 7],
      ];
      const start = { oak_4: [24, 17], tree_10: [9, 11], tree_9: [18, 12] }[id];
      const plans = [];
      for (const [name, ox, oy] of spots) {
        await T(`aim(${r.feet.x}, ${r.feet.y})`);
        await sleep(250); // let the scene un-cull the art at the new scroll
        const cands = []; // [ox, oy, how]
        if (name !== 'below-feet') {
          const v = await T(
            `visiblePoint(${JSON.stringify(id)}, ${JSON.stringify(treeIds)}, ${JSON.stringify({ x: r.feet.x + ox, y: r.feet.y + oy })})`,
          );
          if (v)
            cands.push([
              v.x - r.feet.x,
              v.y - r.feet.y,
              `own leaf px (${v.d.toFixed(0)} px from ideal)`,
            ]);
        }
        for (const [dx, dy] of [
          [0, 0],
          [-4, 0],
          [4, 0],
          [0, -2],
          [0, 2],
          [-8, 0],
          [8, 0],
          [0, -4],
          [-12, 0],
          [12, 0],
          [-8, -3],
          [8, -3],
        ])
          cands.push([ox + dx, oy + dy, 'ideal' + (dx || dy ? `+(${dx},${dy})` : '')]);
        let plan = null;
        for (const [cx, cy, how] of cands) {
          const e = await T(`expectedAt(${r.feet.x + cx}, ${r.feet.y + cy})`);
          if (e.stable && (!e.id || treeIds.includes(e.id))) {
            plan = { name, cx, cy, how, exp: e.id };
            break;
          }
        }
        plans.push(plan ?? { name, none: true });
      }
      const own = plans.filter((q) => !q.none && q.exp === id).length;
      await check(
        `own-${id}`,
        `${id} keeps >=1 tap spot that is its own visible leaf/trunk/below-feet`,
        async () => {
          expect(
            own >= 1,
            `0 of ${spots.length} spots resolve to ${id}: ` +
              JSON.stringify(plans.map((q) => [q.name, q.exp])),
          );
          return (
            `${own}/${spots.length} spots own it: ` +
            plans.map((q) => `${q.name}=${q.none ? 'unstable' : q.exp}`).join(', ')
          );
        },
      );
      await check(
        `gap-${id}`,
        `tap a transparent gap of a front tree's canopy over ${id} -> chops ${id}`,
        async () => {
          await T(`place(${start[0]}, ${start[1]})`);
          await waitFor('trees standing', async () => (await T('allStanding()')) && true, 20000);
          await T(`aim(${r.feet.x + 23}, ${r.feet.y + 11})`);
          await sleep(250);
          // sample the gap and tap it back to back: the canopy sways, so a stale point drifts
          const gp = await T(`gapPoint(${JSON.stringify(id)})`);
          if (!gp) return 'n/a: no front tree rect overlaps a visible pixel of ' + id;
          await T('clearCalls()');
          const c = await T(`toClient(${gp.x}, ${gp.y})`);
          expect(c.cvOk, 'tap point covered by ' + c.topTag);
          await tap(c.x, c.y);
          await sleep(300);
          const calls = await T('calls()');
          expect(
            calls === `interactTree:["${id}"]`,
            `gap over ${gp.over} should chop ${id}, got ${calls}`,
          );
          return `gap under ${gp.over} rect at ${gp.x.toFixed(0)},${gp.y.toFixed(0)}: ${calls}`;
        },
      );
      for (const plan of plans) {
        const exp = plan.exp;
        const label = plan.none ? '?' : (exp ?? 'ground');
        await check(
          plan.none || exp === id ? `t-${id}-${plan.name}` : `tv-${id}-${plan.name}`,
          plan.none
            ? `tap ${id} ${plan.name}: no stable point`
            : exp === id
              ? `tap ${id} ${plan.name} -> walks adjacent and chops ${id}`
              : `tap ${id} ${plan.name} (covered) -> visible ${label} wins`,
          async () => {
            if (plan.none)
              return (
                'skipped: every candidate point straddles two trees (own-' +
                id +
                ' covers the target)'
              );
            await T(`place(${start[0]}, ${start[1]})`);
            // An earlier check may have felled a tree (one log, then a stump): tapping a stump is a no-op.
            await waitFor('trees standing', async () => (await T('allStanding()')) && true, 20000);
            const before = await T('swings()');
            const logs0 = await T('logs()');
            await T('clearCalls()');
            const c = await aimAndLocate(r.feet.x, r.feet.y, plan.cx, plan.cy, { x: 23, y: 11 });
            expect(c.cvOk, 'tap point covered by ' + c.topTag);
            await tap(c.x, c.y);
            if (!exp) {
              await sleep(1500);
              const ses = await T('session()');
              const calls = await T('calls()');
              expect(
                !ses && (await T('swings()')) === before && !calls.includes('interactTree'),
                `expected ground walk but ${calls} session ${JSON.stringify(ses)}`,
              );
              return `${plan.how}: walked, no chop (${calls})`;
            }
            const got = await waitFor(
              'chop start',
              async () => {
                const seen = (await T('seen()')).split(',').filter(Boolean);
                const sw = await T('swings()');
                const gained = (await T('logs()')) - logs0;
                return seen.length && (sw > before || gained > 0) ? { seen } : null;
              },
              14000,
            ).catch(() => null);
            const pos = (await T('pathEnd()')).pos;
            const calls = await T('calls()');
            const X = rects.find((q) => q.id === exp);
            expect(
              got,
              `no chop of ${exp}: seen [${await T('seen()')}] calls [${calls}] pos ${JSON.stringify(pos)}`,
            );
            expect(
              got.seen.every((n) => n === exp) && calls === `interactTree:["${exp}"]`,
              `visible tree is ${exp} (${plan.how}) but ${calls} / chopped [${got.seen}]`,
            );
            const d = Math.max(Math.abs(pos.x - X.x), Math.abs(pos.y - X.y));
            expect(
              d === 1 && (pos.x === X.x || pos.y === X.y),
              `not adjacent: pos ${JSON.stringify(pos)} tree (${X.x},${X.y})`,
            );
            return `${plan.how}: ${calls}, chopped ${got.seen}, player ${pos.x},${pos.y} vs tree ${X.x},${X.y}`;
          },
        );
      }
    }

    // ---- empty ground between trees ----
    const pairs = [
      ['tree_6', 'tree_7'],
      ['oak_2', 'oak_4'],
      ['tree_10', 'tree_12'],
      ['tree_1', 'tree_3'],
    ];
    for (const [a, b] of pairs) {
      await check(
        `b-${a}-${b}`,
        `tap empty ground between ${a} and ${b} -> walks, no chop`,
        async () => {
          const A = rects.find((q) => q.id === a),
            B = rects.find((q) => q.id === b);
          const mid = { x: (A.feet.x + B.feet.x) / 2, y: (A.feet.y + B.feet.y) / 2 };
          let best = null;
          for (let tx = Math.min(A.x, B.x) - 2; tx <= Math.max(A.x, B.x) + 2; tx++)
            for (let ty = Math.min(A.y, B.y) - 2; ty <= Math.max(A.y, B.y) + 2; ty++) {
              if (blockedTiles.has(`${tx},${ty}`)) continue;
              const f = await T(`tw(${tx}, ${ty})`);
              if (rects.some((q) => inRect(f, q.rect, 4))) continue;
              const dd = Math.hypot(f.x - mid.x, f.y - mid.y);
              if (!best || dd < best.dd) best = { tx, ty, f, dd };
            }
          expect(best, 'no free ground tile between pair');
          // player on the far side so the walk is real
          await T('place(18, 15)');
          const c = await aimAndLocate(best.f.x, best.f.y, 0, 0, { x: -19, y: 9 });
          expect(c.cvOk, 'covered by ' + c.topTag);
          const before = await T('swings()');
          await tap(c.x, c.y);
          await sleep(1500);
          const p = await T('pathEnd()');
          const ses = await T('session()');
          const sw = await T('swings()');
          expect(!ses && sw === before, `chopped: session ${JSON.stringify(ses)}`);
          const moved = p.pos.x !== 18 || p.pos.y !== 15 || p.end;
          expect(moved, 'did not walk');
          const target = p.end ?? p.pos;
          // path end may have advanced (walked); final destination must be the tile once arrived
          await waitFor('arrive', async () => (await T('pathEnd()')).len === 0, 20000);
          const fin = (await T('pathEnd()')).pos;
          expect(
            fin.x === best.tx && fin.y === best.ty,
            `ended at ${JSON.stringify(fin)} wanted ${best.tx},${best.ty} (end seen ${JSON.stringify(target)})`,
          );
          return `tile (${best.tx},${best.ty}) between ${a}/${b}: walked there, no chop`;
        },
      );
    }

    await check(
      'c-flat',
      'zoom-in taps at corner/edge of screen still resolve (camera scrolled far)',
      async () => {
        // far world corner area so the camera is clamped/scrolled hard
        const tx = 30,
          ty = 14;
        const f = await T(`tw(${tx}, ${ty})`);
        await T('place(18, 15)');
        const c = await aimAndLocate(f.x, f.y, 0, 0, { x: 0, y: 0 });
        expect(c.cvOk, 'covered ' + c.topTag);
        await tap(c.x, c.y);
        const p = await T('pathEnd()');
        expect(
          p.end && p.end.x === tx && p.end.y === ty,
          `end ${JSON.stringify(p.end)} wanted ${tx},${ty}`,
        );
        return `(${tx},${ty}) ok`;
      },
    );
  }

  let code = 1;
  try {
    const setView = async (w, h, dpr, mobile) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: dpr,
        mobile,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
    };
    const only = process.env.E2E_VIEWPORT ?? 'both'; // desktop | phone | both
    if (only !== 'phone') {
      phase = 'desktop dpr1';
      await setView(1280, 800, 1, false);
      await runPhase();
      phase = 'desktop dpr1.6';
      await setView(1280, 800, 1.6, false);
      await runPhase();
    }
    if (only !== 'desktop') {
      phase = 'phone';
      touch = true;
      await setView(390, 844, 2, true);
      await runPhase();
    }
    phase = 'all';
    await check('console', 'no console errors / exceptions', async () => {
      expect(errors.length === 0, errors.join(' | '));
      return '0 errors';
    });
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}\n     ${r.ev}`);
    code = results.every((r) => r.ok) ? 0 : 1;
  } catch (e) {
    console.log('ERROR', e);
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}\n     ${r.ev}`);
  } finally {
    await cdp.close().catch(() => {});
    killChild(vite);
    killTracked();
  }
  process.exit(code);
}
main().catch((e) => {
  console.log('FATAL', e);
  killTracked();
  process.exit(2);
});
