// Browser smoke test (`npm run e2e`): the core loop on desktop, phone portrait and phone landscape.
// Fast base (lib.mjs): four parallel children (own vite + Chrome each) on 9104-9107 (E2E_PORT overrides the base),
// ?tickMs=60 (rules unchanged, ticks 10x), wait-on-state instead of sleeps, < 60 s budget that fails the run.
//   chain  = a..f2 (chop -> reload -> bank, depend on each other)       desktop
//   smooth = i, h, h2 (sound + real-time smoothness)                    desktop at dpr 1.6
//   g1     = phone 390x844 portrait                                     phone
//   g2     = phone 844x390 landscape                                    landscape
import { check, expect, runParallel, withGame } from './lib.mjs';
import { wsKind } from './cdp.mjs';

const PORT = 9104;
const BUDGET_MS = 60e3;
const PARTS = { chain: 'desktop', smooth: 'desktop', g1: 'phone', g2: 'landscape' };
// runParallel spawns one child per name; part names are labels only, each part maps to its viewport below.
const MINE = (
  await runParallel(import.meta.url, PORT, {
    viewports: Object.keys(PARTS),
    renderers: ['webgl'],
    budgetMs: BUDGET_MS,
  })
).map((c) => c.split(':')[0]);

const TOOLS = new Set([
  'bronze_axe',
  'bronze_pickaxe',
  'small_fishing_net',
  'fishing_rod',
  'tinderbox',
]);
const SWING = 'You swing your axe at the tree.';
const CANOPY_DY = -40; // iso tree: canopy sits ~40 px above the trunk base
const SC = 'window.__idleRpg.scene()';
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---- in-page helpers (installed after load; window.__s) -----------------------------------------
const HELPERS = `(() => { if (window.__s) return; const SC = () => ${SC}; const st = () => window.__idleRpg.store;
  window.__s = {
    snapshot: () => { const g = st().getState().game; return {
      pos: g.movement.position, pathLen: g.movement.path.length,
      pending: g.pendingInteraction && g.pendingInteraction.nodeId,
      session: g.gathering.session && g.gathering.session.nodeId,
      nodes: Object.fromEntries(Object.entries(g.gathering.nodes).map(([k, v]) => [k, v.respawnAt !== null])),
      chat: g.chat.map((c) => c.text), inv: g.inventory.slots.map((s) => s && { id: s.itemId, n: s.quantity }),
      bank: g.bank.items, bankOpen: g.bankOpen, wcXp: g.progression.xp.woodcutting }; },
    // Latch swing lines as they arrive: the chat is capped, a line can scroll out between two reads.
    watchSwing: (line) => { if (window.__swing) return; window.__swing = { total: 0 }; let prev = new Set();
      const look = () => { const chat = st().getState().game.chat; for (const c of chat) if (!prev.has(c) && c.text === line) window.__swing.total++; prev = new Set(chat); };
      st().subscribe(look); look(); },
    swingSeen: () => (window.__swing ? window.__swing.total : 0),
    spawns: async () => { const w = await import('/src/features/world/index.ts'); return { trees: w.TREE_SPAWNS, objects: w.OBJECT_SPAWNS, bank: w.namedLocations.bank.tile }; },
    playerWorld: () => { const c = SC().playerView.container; return { x: c.x, y: c.y }; },
    scroll: () => { const c = SC().camera; return { x: c.scrollX, y: c.scrollY, zoom: c.zoom }; },
    box: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; },
    canvasRect: () => { const r = SC().camera.scene.game.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS'; },
    startSampling: () => { const out = []; window.__samples = out; window.__sampling = true;
      const loop = (t) => { if (!window.__sampling) return; try { const c = SC().playerView.container, cam = SC().camera; const b = cam.getBounds(), v = cam.worldView;
        out.push({ t, x: c.x, y: c.y, sx: cam.scrollX, sy: cam.scrollY, edge: v.x <= b.x + 1 || v.y <= b.y + 1 || v.right >= b.right - 1 || v.bottom >= b.bottom - 1 }); } catch { /* scene swap */ } requestAnimationFrame(loop); };
      requestAnimationFrame(loop); },
    stopSampling: () => { window.__sampling = false; return window.__samples; },
  }; })()`;

await withGame({ port: PORT, budgetMs: BUDGET_MS, viewport: PARTS[MINE[0]] }, async (g) => {
  const logErrors = []; // network/log errors (404s...), which the lib's console check does not see
  await g.cdp.send('Log.enable');
  g.cdp.on((m) => {
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      logErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  const S = async (expr) => {
    await g.eval(HELPERS);
    return g.eval(`window.__s.${expr}`);
  };
  const snap = () => S('snapshot()');
  const clickTile = async (t, dy = 0) => {
    const p = await g.tileClient(t.x, t.y, dy);
    await g.tap(p.x, p.y);
    return p;
  };
  const settle = async () => {
    await g.waitIdle({ timeoutMs: 30000 });
    await g.settle(); // camera finished following (replaces a 1200 ms sleep)
  };
  const nearestTree = async (exclude = []) => {
    const { trees } = await S('spawns()');
    const s = await snap();
    const free = trees.filter((t) => !s.nodes[t.nodeId] && !exclude.includes(t.nodeId));
    for (const t of free.sort((a, b) => dist(a, s.pos) - dist(b, s.pos))) {
      const trunk = await g.tileClient(t.x, t.y);
      const canopy = await g.tileClient(t.x, t.y, CANOPY_DY);
      if (
        (await S(`topIsCanvas(${trunk.x}, ${trunk.y})`)) &&
        (await S(`topIsCanvas(${canopy.x}, ${canopy.y})`))
      )
        return t;
    }
    throw new Error('no visible tree');
  };
  /** Reload WITHOUT clearing storage (g.load() starts a fresh save). */
  const reload = async () => {
    // marker on the OLD page: ready() must come from the reloaded page, not the one still unloading
    await g.eval('window.__oldPage = 1');
    await g.cdp.send('Page.reload');
    await g.waitFor(
      () =>
        g
          .eval(`!window.__oldPage && !!window.__idleRpg?.store`)
          .then((ok) => ok && g.page('ready()'))
          .catch(() => false),
      {
        timeoutMs: 25000,
        label: 'game ready after reload',
      },
    );
  };

  const chain = async () => {
    await check('a', 'page loads with no console errors', async () => {
      await g.waitTicks(10); // let boot-time errors arrive (tick-based, not a fixed 1.5 s)
      const real = [...g.consoleErrors(), ...logErrors].filter((e) => !/favicon/.test(e));
      expect(real.length === 0, `console errors: ${real.join(' | ')}`);
      return `0 errors; websocket: ${wsKind}`;
    });

    await check('b', 'HUD: inventory with bronze axe icon, minimap, 3 orbs, chatbox', async () => {
      const r = await g.eval(`(() => ({
          axe: !!document.querySelector('.slot-grid button[aria-label="Bronze axe"] img.slot-icon[src]'),
          slots: document.querySelectorAll('.slot-grid .slot').length,
          minimap: !!document.querySelector('.minimap'),
          orbs: document.querySelectorAll('.orbs .orb').length,
          chat: !!document.querySelector('.chatbox'),
        }))()`);
      expect(r.axe, 'no bronze axe slot with an <img> icon');
      expect(r.slots === 28, `expected 28 slots, got ${r.slots}`);
      expect(r.minimap && r.chat, `minimap=${r.minimap} chat=${r.chat}`);
      expect(r.orbs === 3, `expected 3 orbs, got ${r.orbs}`);
      return JSON.stringify(r);
    });

    await settle();
    let firstTree;
    await check('c', 'click a tree trunk: walk, swing message, a log within 30 s', async () => {
      firstTree = await nearestTree();
      await S(`watchSwing(${JSON.stringify(SWING)})`);
      await clickTile(firstTree);
      await g
        .waitFor(
          async () => {
            const n = await snap();
            return n.session === firstTree.nodeId || n.inv.some((i) => i && i.id === 'logs');
          },
          { timeoutMs: 20000, label: 'chop session on the tree (or a log)' },
        )
        .catch(async (e) => {
          const n = await snap();
          throw new Error(
            `${e.message}: clicked ${firstTree.nodeId} (${firstTree.x},${firstTree.y}); now pos ${JSON.stringify(n.pos)} path ${n.pathLen} pending ${n.pending} session ${n.session} chat tail ${JSON.stringify(n.chat.slice(-6))}`,
          );
        });
      const s = await snap();
      expect(dist(s.pos, firstTree) <= 1, `not next to the tree: pos ${JSON.stringify(s.pos)}`);
      const gotLog = async () => (await snap()).inv.some((i) => i && i.id === 'logs');
      const t0 = Date.now();
      while (!(await gotLog())) {
        expect(Date.now() - t0 < 30000, 'no log within 30 s');
        const n = await snap();
        if (!n.session && !n.pending) await clickTile(await nearestTree()); // tree fell: chop another
        // wait on state: a log, or the session/pending ending (then re-click)
        await g
          .waitState(
            '',
            `g => g.inventory.slots.some((x) => x && x.itemId === 'logs') || (!g.gathering.session && !g.pendingInteraction)`,
            { timeoutMs: 8000 },
          )
          .catch(() => {});
      }
      const done = await snap();
      return `chop session + logs=${done.inv.filter((i) => i && i.id === 'logs').length}; wcXp=${done.wcXp}`;
    });

    await check('d', 'click a tree CANOPY also starts chopping', async () => {
      await settle();
      const t = await nearestTree([firstTree?.nodeId]);
      await S(`watchSwing(${JSON.stringify(SWING)})`);
      await clickTile(t, CANOPY_DY);
      const hit = await g
        .waitFor(
          async () => {
            const s = await snap();
            return s.pending === t.nodeId || s.session === t.nodeId ? s : null;
          },
          { timeoutMs: 4000, label: 'chop intent on the canopy-clicked tree' },
        )
        .catch(() => null);
      expect(
        hit,
        `canopy click on ${t.nodeId} (${t.x},${t.y}) did not start chopping (pending/session = the tree actually picked, if another id = picking hit a neighbour tree): ${JSON.stringify(await snap().then((s) => ({ pos: s.pos, pathLen: s.pathLen, pending: s.pending, session: s.session })))}`,
      );
      const logsBefore = hit.inv.filter((i) => i && i.id === 'logs').length;
      // swing line is posted at the animation impact (~2 s real time); at fast ticks the session can end first
      await g.waitFor(
        async () => {
          const s = await snap();
          return (
            s.session === t.nodeId || s.inv.filter((i) => i && i.id === 'logs').length > logsBefore
          );
        },
        { timeoutMs: 20000, label: 'chop session on the canopy-clicked tree (or a log)' },
      );
      return `${t.nodeId} at (${t.x},${t.y}) chopping after canopy click`;
    });

    let saved;
    await check('e', 'reload keeps logs and XP', async () => {
      await g.waitState('inventory', `i => i.slots.some((x) => x && x.itemId === 'logs')`, {
        timeoutMs: 30000,
      });
      const pos = await g.state('movement.position');
      await g.teleport(pos.x, pos.y, { settleMs: 0 }); // stop chopping so the state is stable across the reload
      // wait for the debounced save (1 s) to hold exactly this state, instead of a fixed 1.5 s sleep
      await g.waitFor(
        async () => {
          const s = await snap();
          const raw = await g.eval(`localStorage.getItem('idle-rpg:save:1') || ''`);
          const logs = s.inv.filter((i) => i && i.id === 'logs').length;
          const ok =
            raw.includes(`"woodcutting":${s.wcXp}`) &&
            raw.split('"itemId":"logs"').length - 1 === logs;
          if (ok) saved = s;
          return ok;
        },
        { timeoutMs: 8000, label: 'debounced save holds the current logs + xp' },
      );
      await reload();
      const after = await snap();
      const count = (s) => s.inv.filter((i) => i && i.id === 'logs').length;
      expect(count(after) === count(saved), `logs ${count(saved)} -> ${count(after)}`);
      expect(after.wcXp === saved.wcXp, `xp ${saved.wcXp} -> ${after.wcXp}`);
      expect(after.chat.includes('Welcome back.'), 'no "Welcome back." after reload');
      return `logs ${count(after)}, wcXp ${after.wcXp}`;
    });

    let axeLeft = null;
    await check(
      'f',
      'bank: open, deposit all, inventory empty except axe, bank count correct',
      async () => {
        await settle();
        const { objects, bank } = await S('spawns()');
        const chest = objects.find((o) => /bank/.test(o.kind));
        expect(chest, 'no bank object in OBJECT_SPAWNS');
        await g.walkTo(bank.x, bank.y); // travel shortcut; the booth click below is real
        await settle();
        const before = await snap();
        const logs = before.inv.filter((i) => i && i.id === 'logs').length;
        expect(logs > 0, 'no logs to deposit');
        await clickTile(chest);
        await g.waitState('bankOpen', 'b => b === true', { timeoutMs: 20000 }).catch(async (e) => {
          const s = await snap();
          const cp = await g.tileClient(chest.x, chest.y);
          const top = await g.eval(
            `(() => { const e = document.elementFromPoint(${cp.x}, ${cp.y}); return e ? e.tagName + '.' + e.className : 'none'; })()`,
          );
          throw new Error(
            `${e.message}: chest (${chest.x},${chest.y}) client (${cp.x | 0},${cp.y | 0}) top element ${top}; player ${JSON.stringify(before.pos)} -> ${JSON.stringify(s.pos)}, path ${s.pathLen}, last chat: ${s.chat.at(-1)}`,
          );
        });
        const deposit = await g.eval(
          `(() => { const b = [...document.querySelectorAll('.bank-overlay button')].find((x) => /Deposit inventory/.test(x.textContent)); if (!b) return false; b.click(); return true; })()`,
        );
        expect(deposit, 'no "Deposit inventory" button');
        await g
          .waitState('inventory', `i => !i.slots.some((x) => x && x.itemId === 'logs')`, {
            timeoutMs: 3000,
          })
          .catch(() => {});
        const after = await snap();
        const left = after.inv.filter(Boolean).map((i) => i.id);
        const banked = after.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
        const label = await g.eval(`document.querySelector('.bank-capacity')?.textContent`);
        expect(banked === logs, `bank has ${banked} logs, deposited ${logs}`);
        expect(!left.includes('logs'), `logs left in inventory: ${JSON.stringify(left)}`);
        axeLeft = left;
        await g.eval(
          `[...document.querySelectorAll('.bank-overlay button')].find((x) => /Close/.test(x.textContent))?.click()`,
        );
        return `deposited ${logs} logs; bank logs ${banked}; "${label}"; inventory ${JSON.stringify(left)}`;
      },
    );

    await check(
      'f2',
      'bank: deposit all keeps the bronze axe in the inventory (no tool = cannot chop)',
      async () => {
        expect(axeLeft !== null, 'check f did not run');
        expect(
          axeLeft.includes('bronze_axe') &&
            !axeLeft.includes('logs') &&
            axeLeft.every((id) => TOOLS.has(id)), // deposit all keeps every tool
          `inventory after deposit all: ${JSON.stringify(axeLeft)}`,
        );
        return 'axe kept';
      },
    );
  };

  const smooth = async () => {
    // (i) sound: the game's synth AudioContext is created on the first user gesture. Record contexts created
    // from now on (Phaser's own boot context is read from game.sound), then one real click.
    await check('i', 'sound: AudioContext running after a click', async () => {
      await g.eval(
        `(() => { window.__audio = []; const N = window.AudioContext; window.AudioContext = class extends N { constructor(...a) { super(...a); window.__audio.push(this); } }; })()`,
      );
      await settle();
      await clickTile({ x: 25, y: 15 });
      const states = () =>
        g.eval(
          `(() => { const ph = ${SC}.camera.scene.game.sound.context; return [...(ph ? [ph.state] : []), ...window.__audio.map((c) => c.state)]; })()`,
        );
      await g
        .waitFor(async () => (await states()).at(-1) === 'running', { timeoutMs: 3000 })
        .catch(() => {});
      const st = await states();
      const created = await g.eval('window.__audio.length');
      expect(created > 0, `no AudioContext was created by the click (${st.join(',')})`);
      // Phaser creates its own context at boot (stays suspended); the game's synth context is created last.
      expect(
        st.at(-1) === 'running',
        `game AudioContext states (Phaser first, game last): ${st.join(',')}`,
      );
      return `contexts ${st.join(',')}`;
    });

    // h / h2 measure per-frame smoothness of REAL ticks: realTime (600 ms) is the thing under test here.
    await check(
      'h',
      'smoothness at dpr 1.6: straight walk, per-frame player step within +-15% of the mean, camera never stalls',
      () =>
        g.realTime(async () => {
          // diagonal steps cover sqrt(2) tiles per tick by design, so start on the straight path row
          await g.teleportSettled(10, 15);
          const goal = { x: 17, y: 15 };
          await S('startSampling()');
          await clickTile(goal);
          await g.waitState('movement.position', 'p => p.x === 17 && p.y === 15', {
            timeoutMs: 20000,
          });
          await g.waitIdle();
          const all = await S('stopSampling()');
          // steady-state part only: drop the first/last 15% (acceleration at the ends, camera catching up)
          const cut = Math.floor(all.length * 0.15);
          const mid = all.slice(cut, all.length - cut);
          const steps = [];
          const camSteps = [];
          for (let i = 1; i < mid.length; i++) {
            // per nominal 60 fps frame: a host-load dropped frame (dt 50 ms) legitimately moves 3x as far
            steps.push(
              (Math.hypot(mid[i].x - mid[i - 1].x, mid[i].y - mid[i - 1].y) * (1000 / 60)) /
                Math.max(1, mid[i].t - mid[i - 1].t),
            );
            camSteps.push(Math.hypot(mid[i].sx - mid[i - 1].sx, mid[i].sy - mid[i - 1].sy));
          }
          const moving = steps.filter((d) => d > 0);
          expect(moving.length > 40, `only ${moving.length} moving frames`);
          const mean = moving.reduce((a, b) => a + b, 0) / moving.length;
          const offIdx = steps
            .map((d, i) => (d > 0 && Math.abs(d - mean) > mean * 0.15 ? i : -1))
            .filter((i) => i >= 0);
          const off = offIdx.length;
          const offDt = offIdx.map((i) => (mid[i + 1].t - mid[i].t).toFixed(1)).join('/');
          const stalls = camSteps.filter(
            (d, i) => steps[i] > 0 && d === 0 && !mid[i + 1].edge,
          ).length;
          const info = `${mid.length} frames, player step mean ${mean.toFixed(2)} px (min ${Math.min(...moving).toFixed(2)}, max ${Math.max(...moving).toFixed(2)}), ${off} frames off by >15%, ${stalls} camera 0-px stalls (off-frame dt ms: ${offDt || '-'}, typical dt ${(mid[mid.length - 1].t - mid[0].t) / (mid.length - 1)})`;
          expect(off === 0, info);
          expect(stalls === 0, info);
          return info;
        }),
    );

    await check('h2', 'movement smoothness: max per-frame jump < 6 px over 3 mid-walk clicks', () =>
      g.realTime(async () => {
        await settle();
        const start = await g.state('movement.position');
        await S('startSampling()');
        const targets = [start.x + 8, start.x - 4, start.x + 7, start.x - 6].map((x) => ({
          x: Math.max(5, Math.min(33, x)),
          y: 15,
        }));
        for (let i = 0; i < targets.length; i++) {
          const from = await g.state('movement.position');
          await clickTile(targets[i]);
          if (i < targets.length - 1)
            // re-click mid-walk: after 2 tiles of the current walk (was a fixed 1.3 s = ~2 ticks)
            await g.waitState('movement.position', `p => Math.abs(p.x - ${from.x}) >= 2`, {
              timeoutMs: 6000,
            });
          else await g.waitIdle({ timeoutMs: 10000 }); // last walk runs to the end (was a fixed 3.5 s)
        }
        await g.sleep(200); // a few frames after arrival so the last steps are sampled
        const samples = await S('stopSampling()');
        expect(samples.length > 60, `only ${samples.length} frames sampled`);
        let max = 0,
          at = 0,
          moved = 0;
        for (let i = 1; i < samples.length; i++) {
          const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
          moved += d;
          if (d > max) {
            max = d;
            at = i;
          }
        }
        // camera: while the player moves, it must not stall (0 px) for several frames in a row, nor jump
        let camMax = 0,
          stall = 0,
          worstStall = 0;
        for (let i = 1; i < samples.length; i++) {
          const pd = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
          const cd = Math.hypot(
            samples[i].sx - samples[i - 1].sx,
            samples[i].sy - samples[i - 1].sy,
          );
          camMax = Math.max(camMax, cd);
          stall = pd > 0.2 && cd === 0 && !samples[i].edge ? stall + 1 : 0;
          worstStall = Math.max(worstStall, stall);
        }
        expect(camMax < 6, `camera jumped ${camMax.toFixed(2)} px in one frame`);
        expect(
          worstStall <= 3,
          `camera stalled for ${worstStall} consecutive frames while the player moved`,
        );
        expect(moved > 100, `player barely moved (${moved.toFixed(0)} px)`);
        expect(
          max < 6,
          `max per-frame jump ${max.toFixed(2)} px at frame ${at}, dt ${(samples[at].t - samples[at - 1].t).toFixed(1)} ms`,
        );
        return `${samples.length} frames, travelled ${moved.toFixed(0)} px, max jump ${max.toFixed(2)} px; camera max ${camMax.toFixed(2)} px, worst stall ${worstStall} frames`;
      }),
    );
  };

  // (g) phone viewport, portrait or landscape, touch input.
  const phone = async (width, height, label) => {
    await settle();
    const hud = await S("box('.hud')");
    const chat = await S("box('.chatbox')");
    const cv = await S('canvasRect()');
    const pw = await S('playerWorld()');
    const pc = await g.page(`toClient(${pw.x}, ${pw.y - 16})`);
    const coveredTop = Math.min(hud.top, chat && chat.height > 0 ? chat.top : Infinity); // chat folds (0x0) on phone
    const inCanvas = pc.x >= cv.left && pc.x <= cv.right && pc.y >= cv.top && pc.y <= cv.bottom;
    const portrait = height > width;
    if (portrait)
      expect(
        hud.width >= width - 2 && hud.bottom >= height - 2,
        `not a bottom sheet: ${JSON.stringify(hud)}`,
      );
    const visibleAbove = portrait ? pc.y < coveredTop : pc.x < hud.left;
    expect(
      inCanvas && visibleAbove,
      `player at (${pc.x | 0},${pc.y | 0}) not in the visible area (hud ${JSON.stringify(hud)} chat top ${chat?.top})`,
    );
    // drag pans the camera and does not walk
    const posBefore = (await snap()).pos;
    const scrollBefore = await S('scroll()');
    // drag away from the nearest world edge, otherwise the camera is clamped and cannot pan
    const dirX = scrollBefore.x > 100 ? 1 : -1;
    const dirY = scrollBefore.y > 100 ? 1 : -1;
    const sx = pc.x,
      sy = Math.max(60, Math.min(pc.y - 120, coveredTop - 40));
    const touch = (type, x, y) =>
      g.cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', sx + i * 8 * dirX, sy + i * 6 * dirY);
      await g.sleep(16);
    }
    await touch('touchEnd', 0, 0);
    await g.sleep(100);
    const scrollSoon = await S('scroll()');
    // pan settled (camera still) instead of a fixed 1.4 s; a drag must not re-follow the player
    await g.settle();
    const scrollAfter = await S('scroll()');
    const after = await snap();
    expect(
      Math.hypot(scrollAfter.x - scrollBefore.x, scrollAfter.y - scrollBefore.y) > 20,
      `camera did not pan: ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollSoon)} (100 ms) -> ${JSON.stringify(scrollAfter)}; drag from (${sx | 0},${sy | 0}); element there: ${await g.eval(`document.elementFromPoint(${sx}, ${sy})?.className || 'none'`)}`,
    );
    expect(
      after.pathLen === 0 && dist(after.pos, posBefore) === 0,
      `drag walked the player: ${JSON.stringify(posBefore)} -> ${JSON.stringify(after.pos)} path ${after.pathLen}`,
    );
    // compass re-centres the camera on the player (also proves following resumes), then tap walks
    await g.eval(`document.querySelector('.minimap-n')?.click()`);
    await g.settle();
    const target = { x: posBefore.x + 3, y: posBefore.y };
    const tp = await g.tileClient(target.x, target.y);
    await touch('touchStart', tp.x, tp.y);
    await touch('touchEnd', 0, 0);
    await g
      .waitState(
        'movement.position',
        `p => Math.max(Math.abs(p.x - ${posBefore.x}), Math.abs(p.y - ${posBefore.y})) >= 2`,
        { timeoutMs: 8000 },
      )
      .catch(() => {
        throw new Error('tap did not walk the player');
      });
    // long press opens the context menu
    await settle();
    // press a spot just beside the (centred) player, which is always inside the visible area
    const me = await S('playerWorld()');
    const mp = await g.page(`toClient(${me.x}, ${me.y - 16})`);
    const lp = { x: mp.x + 50, y: mp.y + 30 };
    expect(
      await S(`topIsCanvas(${lp.x}, ${lp.y})`),
      `long-press point (${lp.x | 0},${lp.y | 0}) is not on the canvas`,
    );
    await touch('touchStart', lp.x, lp.y);
    await g.sleep(900); // the long-press hold itself is what's tested (900 ms threshold)
    const menu = await g.eval(`!!document.querySelector('[role=menu]')`);
    await touch('touchEnd', 0, 0);
    await g.sleep(200);
    const menuAfterRelease = await g.eval(`!!document.querySelector('[role=menu]')`);
    expect(menu, 'long press did not open the context menu');
    expect(menuAfterRelease, 'context menu closed on finger release');
    return `${label}: hud ${hud.width | 0}x${hud.height | 0}, player (${pc.x | 0},${pc.y | 0}), pan ${Math.hypot(scrollAfter.x - scrollBefore.x, scrollAfter.y - scrollBefore.y).toFixed(0)}px, tap walks, long-press menu stays`;
  };

  const RUN = {
    chain,
    smooth,
    g1: () =>
      check(
        'g1',
        'phone 390x844 portrait: bottom sheet, player visible, drag pans, tap + long-press',
        () => phone(390, 844, '390x844'),
      ),
    g2: () =>
      check('g2', 'phone 844x390 landscape: player visible, drag pans, tap + long-press', () =>
        phone(844, 390, '844x390'),
      ),
  };
  let first = true;
  for (const part of MINE) {
    const needLoad = !first || part === 'smooth';
    if (!first) await g.setViewport(PARTS[part]);
    if (part === 'smooth')
      // smoothness is checked at dpr 1.6 (the user's laptop), not the lib's desktop dpr 1
      await g.cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1.6,
        mobile: false,
      });
    if (needLoad) await g.load();
    first = false;
    await RUN[part]();
  }
});
