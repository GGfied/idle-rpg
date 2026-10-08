/* global fetch, console */
// Browser smoke test: starts `vite --port 5174`, drives headless Chrome over CDP (no dependencies)
// and checks the core loop on desktop and a phone viewport. Run with `npm run e2e`.
// Exit code 0 = every check passed (or failed as declared in EXPECTED_FAIL); 1 = anything else.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, wsKind } from './cdp.mjs';

const PORT = 5174; // never 5173: that is the developer's own dev server
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Checks that are known to fail today. They must fail; if one passes, the run fails (remove it here). */
const EXPECTED_FAIL = new Set(); // none today

const SWING = 'You swing your axe at the tree.';
const results = [];

async function check(id, title, fn) {
  const t0 = Date.now();
  try {
    const evidence = await fn();
    results.push({ id, title, ok: true, evidence: evidence ?? '', ms: Date.now() - t0 });
  } catch (e) {
    results.push({ id, title, ok: false, evidence: e.message, ms: Date.now() - t0 });
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function startVite() {
  const proc = spawn(
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
      /* not up yet */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`vite did not start on ${PORT}`);
}

// ---- in-page helpers (installed before every page load) --------------------------------------
const PAGE_HELPERS = `
(() => {
  // Record every AudioContext the game creates.
  window.__audio = [];
  const Native = window.AudioContext;
  if (Native) {
    window.AudioContext = class extends Native {
      constructor(...a) { super(...a); window.__audio.push(this); }
    };
  }
  // No production hook exists (see the report: request \`window.__game\` in dev). Until then, capture the
  // Phaser.Game instance by wrapping the constructor the moment the Phaser global is assigned.
  let P;
  Object.defineProperty(window, 'Phaser', {
    configurable: true,
    get: () => P,
    set: (v) => {
      P = v;
      const Orig = v.Game;
      const Wrapped = function (...a) { const g = new Orig(...a); window.__phaserGame = g; return g; };
      Wrapped.prototype = Orig.prototype;
      v.Game = Wrapped;
    },
  });
  const scene = () => window.__phaserGame && window.__phaserGame.scene.getScene('world');
  const game = () => scene().deps.store.getState().game;
  window.__e2e = {
    ready: () => { try { const s = scene(); return !!(s && s.player && s.cam && s.deps.store); } catch { return false; } },
    snapshot: () => {
      const g = game();
      return {
        pos: g.movement.position, pathLen: g.movement.path.length,
        pending: g.pendingInteraction && g.pendingInteraction.nodeId,
        session: g.gathering.session && g.gathering.session.nodeId,
        nodes: Object.fromEntries(Object.entries(g.gathering.nodes).map(([k, v]) => [k, v.respawnAt !== null])),
        chat: g.chat.map((c) => c.text),
        inv: g.inventory.slots.map((s) => s && { id: s.itemId, n: s.quantity }),
        bank: g.bank.items, bankOpen: g.bankOpen,
        wcXp: g.progression.xp.woodcutting,
      };
    },
    spawns: async () => {
      const w = await import('/src/features/world/index.ts');
      return { trees: w.TREE_SPAWNS, objects: w.OBJECT_SPAWNS, bank: w.namedLocations.bank.tile };
    },
    // World pixel -> client pixel, through the camera's visible world rectangle.
    toClient: (wx, wy) => {
      const s = scene(), cam = s.cameras.main, v = cam.worldView;
      const cv = s.game.canvas, r = cv.getBoundingClientRect();
      const cx = ((wx - v.x) / v.width) * cam.width, cy = ((wy - v.y) / v.height) * cam.height;
      return { x: r.left + (cx * r.width) / cv.width, y: r.top + (cy * r.height) / cv.height };
    },
    // Test shortcut for TRAVEL only (the behaviour under test is always driven by real clicks).
    walkTo: (x, y) => scene().deps.store.getState().walkTo({ x, y }),
    playerWorld: () => { const c = scene().player.container; return { x: c.x, y: c.y }; },
    scroll: () => { const c = scene().cameras.main; return { x: c.scrollX, y: c.scrollY, zoom: c.zoom }; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; },
    canvasRect: () => { const r = scene().game.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; },
    topElementIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS'; },
    startSampling: () => {
      const out = []; window.__samples = out; window.__sampling = true;
      const loop = (t) => { if (!window.__sampling) return; const c = scene().player.container, cam = scene().cameras.main; const b = cam.getBounds(), v = cam.worldView; out.push({ t, x: c.x, y: c.y, sx: cam.scrollX, sy: cam.scrollY, edge: v.x <= b.x + 1 || v.y <= b.y + 1 || v.right >= b.right - 1 || v.bottom >= b.bottom - 1 }); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    stopSampling: () => { window.__sampling = false; return window.__samples; },
    audioStates: () => window.__audio.map((c) => c.state),
  };
})();
`;

// ---- test driver --------------------------------------------------------------------------------
async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const consoleErrors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        `exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`,
      );
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(
        `console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`,
      );
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1.6,
    mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });

  const E = (expr) => cdp.eval(`window.__e2e.${expr}`);
  const snap = async () => {
    // a Vite full reload (source edited while the suite runs) briefly leaves no scene
    await waitFor('game ready', () => E('ready()').catch(() => false), 15000);
    return E('snapshot()');
  };
  const waitFor = async (what, pred, timeoutMs, pollMs = 150) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(pollMs);
    }
  };
  const load = async () => {
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('game ready', () => E('ready()').catch(() => false), 20000);
    await sleep(800);
  };
  const mouse = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  const clickWorld = async (wx, wy) => {
    const p = await E(`toClient(${wx}, ${wy})`);
    await mouse(p.x, p.y);
    return p;
  };
  const tileCentre = (t) => [t.x * 32 + 16, t.y * 32 + 16];
  const settle = async () => {
    await waitFor('player to stop', async () => (await snap()).pathLen === 0, 30000);
    await sleep(1200); // let the camera finish following
  };
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const nearestTree = async (exclude = []) => {
    const { trees } = await E('spawns()');
    const s = await snap();
    const free = trees.filter((t) => !s.nodes[t.nodeId] && !exclude.includes(t.nodeId));
    for (const t of free.sort((a, b) => dist(a, s.pos) - dist(b, s.pos))) {
      // only trees whose trunk and canopy points are visible and not under a HUD element
      const trunk = await E(`toClient(${t.x * 32 + 16}, ${t.y * 32 + 16})`);
      const canopy = await E(`toClient(${t.x * 32 + 16}, ${t.y * 32 - 5})`);
      if (
        (await E(`topElementIsCanvas(${trunk.x}, ${trunk.y})`)) &&
        (await E(`topElementIsCanvas(${canopy.x}, ${canopy.y})`))
      )
        return t;
    }
    throw new Error('no visible tree');
  };

  try {
    await load();

    await check('a', 'page loads with no console errors', async () => {
      await sleep(1500);
      const real = consoleErrors.filter((e) => !/favicon/.test(e));
      expect(real.length === 0, `console errors: ${real.join(' | ')}`);
      return `0 errors (${consoleErrors.length - real.length} favicon ignored); websocket: ${wsKind}`;
    });

    await check('b', 'HUD: inventory with bronze axe icon, minimap, 3 orbs, chatbox', async () => {
      const r = await cdp.eval(`(() => ({
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
    await check('c', 'click a tree trunk: walk, swing message, a log within 120 s', async () => {
      firstTree = await nearestTree();
      await clickWorld(...tileCentre(firstTree));
      await waitFor('swing message', async () => (await snap()).chat.includes(SWING), 20000);
      const s = await snap();
      expect(dist(s.pos, firstTree) <= 1, `not next to the tree: pos ${JSON.stringify(s.pos)}`);
      const gotLog = async () => (await snap()).inv.some((i) => i && i.id === 'logs');
      const deadline = Date.now() + 120000;
      while (!(await gotLog())) {
        expect(Date.now() < deadline, 'no log within 120 s');
        const n = await snap();
        if (!n.session && !n.pending) {
          const t = await nearestTree();
          await clickWorld(...tileCentre(t)); // tree fell or was interrupted: chop another
        }
        await sleep(500);
      }
      const done = await snap();
      return `chat has swing line; logs=${done.inv.filter((i) => i && i.id === 'logs').length}; wcXp=${done.wcXp}`;
    });

    await check('d', 'click a tree CANOPY also starts chopping', async () => {
      await settle();
      const t = await nearestTree([firstTree?.nodeId]);
      const before = (await snap()).chat.filter((l) => l === SWING).length;
      await clickWorld(t.x * 32 + 16, t.y * 32 - 5);
      const hit = await waitFor(
        'chop intent on the canopy-clicked tree',
        async () => {
          const s = await snap();
          return s.pending === t.nodeId || s.session === t.nodeId ? s : null;
        },
        4000,
      ).catch(() => null);
      expect(
        hit,
        `canopy click on ${t.nodeId} (${t.x},${t.y}) did not start chopping; walked/idle instead: ${JSON.stringify(await snap().then((s) => ({ pos: s.pos, pathLen: s.pathLen })))}`,
      );
      await waitFor(
        'swing message',
        async () => (await snap()).chat.filter((l) => l === SWING).length > before,
        20000,
      );
      return `${t.nodeId} at (${t.x},${t.y}) chopping after canopy click`;
    });

    let saved;
    await check('e', 'reload keeps logs and XP', async () => {
      await waitFor(
        'a log',
        async () => (await snap()).inv.some((i) => i && i.id === 'logs'),
        120000,
      );
      await sleep(1500); // debounce is 1 s
      saved = await snap();
      await load();
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
        const { objects, bank } = await E('spawns()');
        const chest = objects.find((o) => /bank/.test(o.kind));
        expect(chest, 'no bank object in OBJECT_SPAWNS');
        await E(`walkTo(${bank.x}, ${bank.y})`); // travel shortcut; the booth click below is real
        await settle();
        const before = await snap();
        const logs = before.inv.filter((i) => i && i.id === 'logs').length;
        expect(logs > 0, 'no logs to deposit');
        await clickWorld(chest.x * 32 + 16, chest.y * 32 + 16);
        const before2 = await snap();
        await waitFor('bank open', async () => (await snap()).bankOpen, 20000).catch(async (e) => {
          const s = await snap();
          const cp = await E(`toClient(${chest.x * 32 + 16}, ${chest.y * 32 + 16})`);
          const top = await cdp.eval(
            `(() => { const e = document.elementFromPoint(${cp.x}, ${cp.y}); return e ? e.tagName + '.' + e.className : 'none'; })()`,
          );
          throw new Error(
            `${e.message}: chest (${chest.x},${chest.y}) client (${cp.x | 0},${cp.y | 0}) top element ${top}; player ${JSON.stringify(before2.pos)} -> ${JSON.stringify(s.pos)}, path ${s.pathLen}, last chat: ${s.chat.at(-1)}`,
          );
        });
        const deposit = await cdp.eval(
          `(() => { const b = [...document.querySelectorAll('.bank-overlay button')].find((x) => /Deposit inventory/.test(x.textContent)); if (!b) return false; b.click(); return true; })()`,
        );
        expect(deposit, 'no "Deposit inventory" button');
        await sleep(400);
        const after = await snap();
        const left = after.inv.filter(Boolean).map((i) => i.id);
        const banked = after.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
        const label = await cdp.eval(`document.querySelector('.bank-capacity')?.textContent`);
        expect(banked === logs, `bank has ${banked} logs, deposited ${logs}`);
        expect(!left.includes('logs'), `logs left in inventory: ${JSON.stringify(left)}`);
        axeLeft = left;
        await cdp.eval(
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
          axeLeft.length === 1 && axeLeft[0] === 'bronze_axe',
          `inventory after deposit all: ${JSON.stringify(axeLeft)}`,
        );
        return 'axe kept';
      },
    );

    await check(
      'h',
      'smoothness at dpr 1.6: straight walk, per-frame player step within +-15% of the mean, camera never stalls',
      async () => {
        await settle();
        // diagonal steps cover sqrt(2) tiles per tick by design, so start on the straight path row
        await E('walkTo(10, 15)');
        await settle();
        const goal = { x: 17, y: 15 };
        await E('startSampling()');
        await clickWorld(...tileCentre(goal));
        await waitFor('arrival', async () => dist((await snap()).pos, goal) === 0, 20000);
        await sleep(300);
        const all = await E('stopSampling()');
        // steady-state part only: drop the first/last 15% (acceleration at the ends, camera catching up)
        const cut = Math.floor(all.length * 0.15);
        const mid = all.slice(cut, all.length - cut);
        const steps = [];
        const camSteps = [];
        for (let i = 1; i < mid.length; i++) {
          steps.push(Math.hypot(mid[i].x - mid[i - 1].x, mid[i].y - mid[i - 1].y));
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
      },
    );

    await check(
      'h2',
      'movement smoothness: max per-frame jump < 6 px over 3 mid-walk clicks',
      async () => {
        await settle();
        const start = (await snap()).pos;
        await E('startSampling()');
        const targets = [start.x + 8, start.x - 4, start.x + 7, start.x - 6].map((x) => ({
          x: Math.max(5, Math.min(33, x)),
          y: 15,
        }));
        for (let i = 0; i < targets.length; i++) {
          const [wx, wy] = tileCentre(targets[i]);
          await clickWorld(wx, wy);
          await sleep(i === targets.length - 1 ? 3500 : 1300);
        }
        const samples = await E('stopSampling()');
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
        // camera: while the player moves, the camera must not stall (0 px) for several frames in a row
        // and must not jump either.
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
      },
    );

    // (i) sound: a saved unmuted setting, a fresh load, one real click.
    await check('i', 'sound: AudioContext running after a click', async () => {
      await load();
      await settle();
      const [wx, wy] = tileCentre({ x: 25, y: 15 });
      await clickWorld(wx, wy);
      await sleep(600);
      const states = await E('audioStates()');
      expect(states.length > 0, 'no AudioContext was created by the click');
      // Phaser creates its own context at boot (stays suspended); the game's synth context is created last.
      expect(
        states.at(-1) === 'running',
        `game AudioContext states (Phaser first, game last): ${states.join(',')}`,
      );
      return `contexts ${states.join(',')}`;
    });

    // (g) phone viewport, portrait then landscape, touch input.
    const phone = async (width, height, label) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await load();
      await settle();
      const hud = await E("rect('.hud')");
      const chat = await E("rect('.chatbox')");
      const cv = await E('canvasRect()');
      const pw = await E('playerWorld()');
      const pc = await E(`toClient(${pw.x}, ${pw.y - 16})`);
      const coveredTop = Math.min(hud.top, chat?.top ?? Infinity);
      const inCanvas = pc.x >= cv.left && pc.x <= cv.right && pc.y >= cv.top && pc.y <= cv.bottom;
      const portrait = height > width;
      if (portrait) {
        expect(
          hud.width >= width - 2 && hud.bottom >= height - 2,
          `not a bottom sheet: ${JSON.stringify(hud)}`,
        );
      }
      const visibleAbove = portrait ? pc.y < coveredTop : pc.x < hud.left;
      expect(
        inCanvas && visibleAbove,
        `player at (${pc.x | 0},${pc.y | 0}) not in the visible area (hud ${JSON.stringify(hud)} chat top ${chat?.top})`,
      );
      // drag pans the camera and does not walk
      const posBefore = (await snap()).pos;
      const scrollBefore = await E('scroll()');
      // drag away from the nearest world edge, otherwise the camera is clamped and cannot pan
      const dirX = scrollBefore.x > 100 ? 1 : -1;
      const dirY = scrollBefore.y > 100 ? 1 : -1;
      const sx = pc.x,
        sy = Math.max(60, Math.min(pc.y - 120, coveredTop - 40));
      const touch = (type, x, y) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
        });
      await touch('touchStart', sx, sy);
      for (let i = 1; i <= 10; i++) {
        await touch('touchMove', sx + i * 8 * dirX, sy + i * 6 * dirY);
        await sleep(16);
      }
      await touch('touchEnd', 0, 0);
      await sleep(100);
      const scrollSoon = await E('scroll()');
      await sleep(1400);
      const scrollAfter = await E('scroll()');
      const after = await snap();
      expect(
        Math.hypot(scrollAfter.x - scrollBefore.x, scrollAfter.y - scrollBefore.y) > 20,
        `camera did not pan: ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollSoon)} (100 ms) -> ${JSON.stringify(scrollAfter)}; drag from (${sx | 0},${sy | 0}); element there: ${await cdp.eval(`document.elementFromPoint(${sx}, ${sy})?.className || 'none'`)}`,
      );
      expect(
        after.pathLen === 0 && dist(after.pos, posBefore) === 0,
        `drag walked the player: ${JSON.stringify(posBefore)} -> ${JSON.stringify(after.pos)} path ${after.pathLen}`,
      );
      // compass re-centres the camera on the player (also proves following resumes), then tap walks
      await cdp.eval(`document.querySelector('.minimap-n')?.click()`);
      await sleep(1500);
      const target = { x: posBefore.x + 3, y: posBefore.y };
      await E('startSampling()');
      await E('stopSampling()');
      const tp = await E(`toClient(${target.x * 32 + 16}, ${target.y * 32 + 16})`);
      await touch('touchStart', tp.x, tp.y);
      await touch('touchEnd', 0, 0);
      await waitFor(
        'tap to walk',
        async () => dist((await snap()).pos, posBefore) >= 2,
        8000,
      ).catch(() => {
        throw new Error('tap did not walk the player');
      });
      // long press opens the context menu
      await settle();
      // press a spot just beside the (centred) player, which is always inside the visible area
      const me = await E('playerWorld()');
      const mp = await E(`toClient(${me.x}, ${me.y - 16})`);
      const lp = { x: mp.x + 50, y: mp.y + 30 };
      expect(
        await E(`topElementIsCanvas(${lp.x}, ${lp.y})`),
        `long-press point (${lp.x | 0},${lp.y | 0}) is not on the canvas`,
      );
      await touch('touchStart', lp.x, lp.y);
      await sleep(900);
      const menu = await cdp.eval(`!!document.querySelector('[role=menu]')`);
      await touch('touchEnd', 0, 0);
      await sleep(200);
      const menuAfterRelease = await cdp.eval(`!!document.querySelector('[role=menu]')`);
      expect(menu, 'long press did not open the context menu');
      expect(menuAfterRelease, 'context menu closed on finger release');
      return `${label}: hud ${hud.width | 0}x${hud.height | 0}, player (${pc.x | 0},${pc.y | 0}), pan ${Math.hypot(scrollAfter.x - scrollBefore.x, scrollAfter.y - scrollBefore.y).toFixed(0)}px, tap walks, long-press menu stays`;
    };
    await check(
      'g1',
      'phone 390x844 portrait: bottom sheet, player visible, drag pans, tap + long-press',
      () => phone(390, 844, '390x844'),
    );
    await check('g2', 'phone 844x390 landscape: player visible, drag pans, tap + long-press', () =>
      phone(844, 390, '844x390'),
    );
  } finally {
    await cdp.close();
    vite.kill();
  }

  let bad = 0;
  console.log('\nE2E results');
  for (const r of results) {
    const expected = EXPECTED_FAIL.has(r.id);
    const tag = r.ok ? (expected ? 'XPASS' : 'PASS') : expected ? 'XFAIL' : 'FAIL';
    if (tag === 'FAIL' || tag === 'XPASS') bad++;
    console.log(
      `${tag.padEnd(5)} (${r.id}) ${r.title} [${(r.ms / 1000).toFixed(1)}s]\n        ${r.evidence}`,
    );
  }
  console.log(`\n${results.length} checks, ${bad} unexpected`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
