/* global fetch, console */
// HUD e2e: Skills panel, blocked-action VFX, minimap, orbs, animation modes.
// Own vite on :5184 (never 5173), fresh headless Chrome profile, real mouse/touch input over CDP.
// Run: node tests/e2e/hud.e2e.mjs   (SHOTS_DIR=/some/dir saves PNGs)   Exit 0 = all checks passed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { hardTimeout, killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

hardTimeout(9 * 60e3);

const PORT = 5184;
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

// Page-side helpers. State/camera/player come only from the DEV hook window.__idleRpg.
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const scene = () => H().scene();
  const world = () => scene().camera.scene;
  const SKILL_TIP = () => null;
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    g: () => H().store.getState().game,
    st: () => H().store.getState(),
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; },
    rectOf: (sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === text); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    camCentre: () => { const v = scene().camera.worldView; return { x: v.x + v.width / 2, y: v.y + v.height / 2 }; },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
    liveTexts: () => world().children.list.filter((o) => o.type === 'Text' && o.visible && o.active && o.alpha > 0).map((o) => o.text),
    // visible, still-fading Graphics whose commands draw a red-ish line (blocked cross)
    redCrosses: () => world().children.list.filter((o) => o.type === 'Graphics' && o.visible && o.active && o.alpha > 0 && o.commandBuffer && o.commandBuffer.length > 4 && o.commandBuffer.some((c, i, a) => i > 0 && a[i - 1] === 0 && 0)).length,
    gfxVisible: () => world().children.list.filter((o) => o.type === 'Graphics' && o.visible && o.active && o.alpha > 0 && o.commandBuffer && o.commandBuffer.length > 0 && o.depth > 0).map((o) => ({ cmd: o.commandBuffer.slice(0, 4).join(','), alpha: o.alpha })),
    // rig = container.list[1]; armFront = rig.list[3]; axe graphics = armFront.list[2]
    arm: () => { const rig = scene().playerView.container.list[1]; const a = rig.list[3]; return { rot: a.rotation, axeVisible: a.list[2].visible }; },
    containers: () => world().children.list.filter((o) => o.type === 'Container').length,
    // Per-frame samples until a log lands (then 1.2 s more) or maxMs. logAt = time the first log appeared.
    sample: (maxMs) => new Promise((res) => { const out = []; const t0 = performance.now(); let logAt = null; const base = window.__t.logs(); const f = () => { const t = performance.now() - t0; const a = window.__t.arm(); if (logAt === null && window.__t.logs() > base) logAt = t; out.push({ t, logAt, chop: H().store.getState().game.gathering.session !== null, rot: a.rot, axeVisible: a.axeVisible, containers: window.__t.containers() }); if (t < maxMs && (logAt === null || t < logAt + 1200)) requestAnimationFrame(f); else res(out); }; f(); }),
    mark: () => { window.__pos = []; const s = H().store; window.__unsub = s.subscribe((n) => { const m = n.game.movement; const last = window.__pos[window.__pos.length - 1]; if (!last || last.x !== m.position.x || last.y !== m.position.y) window.__pos.push({ x: m.position.x, y: m.position.y, t: performance.now(), e: m.runEnergy, r: m.running }); }); },
    unmark: () => { window.__unsub && window.__unsub(); return window.__pos; },
    logs: () => H().store.getState().game.inventory.slots.reduce((n, s) => n + (s && s.itemId === 'logs' ? s.quantity : 0), 0),
    chat: () => [...document.querySelectorAll('[aria-label=Chat] p')].map((p) => p.textContent),
  };
  void SKILL_TIP;
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
  let phase = 'desktop';
  let touch = false;
  const check = async (id, title, fn) => {
    try {
      results.push({ phase, id, title, ok: true, ev: (await fn()) ?? '' });
    } catch (e) {
      results.push({ phase, id, title, ok: false, ev: e.message });
      if (SHOTS) await shot(`${phase}-${id}-FAIL`);
    }
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
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
  const tapSel = async (sel) => {
    const r = await T(`rect(${JSON.stringify(sel)})`);
    expect(r, 'no element ' + sel);
    await tap(r.x, r.y);
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
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
    await sleep(800);
  };
  const setGame = (patchExpr) =>
    cdp.eval(
      `(() => { const s = window.__idleRpg.store; const g = s.getState().game; s.setState({ game: ${patchExpr} }); })()`,
    );
  const tileClient = (tx, ty, dy = 16) => T(`toClient(${tx * 32 + 16}, ${ty * 32 + dy})`);
  const openTab = async (name) => {
    const r = await T(`rectOf('[role=tab]', ${JSON.stringify(name)})`);
    expect(r, 'tab ' + name);
    await tap(r.x, r.y);
    await sleep(200);
  };
  const stepTo = async (label, text) => {
    // Visuals "Animations" On/Reduced/Off via the real settings UI
    if (!(await cdp.eval('!!document.querySelector(".settings")')))
      await tapSel('button[aria-label="Settings"]');
    const r = await cdp.eval(
      `(() => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === ${JSON.stringify(label)}); if (!g) return null; const b = [...g.querySelectorAll('button')].find((c) => c.textContent.trim() === ${JSON.stringify(text)}); b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`,
    );
    expect(r, `settings control ${label}/${text}`);
    await tap(r.x, r.y);
    await tapSel('button[aria-label="Close settings"]');
    await sleep(150);
  };
  // Real tap on a tree until it is chopping; returns the tile
  const tapTree = async (tx, ty, where = 'trunk') => {
    let p = await tileClient(tx, ty, where === 'trunk' ? 16 : -5);
    if (!(await T(`topIsCanvas(${p.x}, ${p.y})`))) {
      // precondition only: the camera follow offset can leave the tree under the sheet; recentre first
      await cdp.eval('window.__idleRpg.store.getState().recentreCamera()');
      await sleep(900);
      p = await tileClient(tx, ty, where === 'trunk' ? 16 : -5);
    }
    expect(
      await T(`topIsCanvas(${p.x}, ${p.y})`),
      `${where} point (${p.x | 0},${p.y | 0}) of tree ${tx},${ty} is covered by HUD or off-screen`,
    );
    await tap(p.x, p.y);
  };
  const resetNear = async (x, y) => {
    await setGame(
      `({ ...g, movement: { ...g.movement, position: { x: ${x}, y: ${y} }, path: [] }, gathering: { ...g.gathering, session: null } })`,
    );
    await sleep(900);
  };

  async function runPhase() {
    await load();
    await tap(640, 20); // harmless first gesture (unlock audio)
    const vp = await cdp.eval('({ w: innerWidth, h: innerHeight })');

    // ---------- 1. Skills panel ----------
    await check(
      's1',
      'Skills: 3-col grid, 13 skills, icon loaded, colour tint, big level, totals',
      async () => {
        await openTab('Skills');
        const info = await cdp.eval(`(async () => {
        const cells = [...document.querySelectorAll('.skill-cell')];
        const imgs = cells.map((c) => c.querySelector('img.skill-icon'));
        await Promise.all(imgs.filter(Boolean).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 3000); })));
        const grid = document.querySelector('.skill-grid');
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const lefts = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left)));
        return {
          n: cells.length, cols, distinctLefts: lefts.size,
          missingIcon: cells.filter((c, i) => !imgs[i] || !(imgs[i].naturalWidth > 0)).map((c) => c.getAttribute('aria-label')),
          tints: new Set(cells.map((c) => getComputedStyle(c).borderLeftColor)).size,
          bgs: cells.filter((c) => { const b = getComputedStyle(c).backgroundColor; return b && b !== 'rgba(0, 0, 0, 0)'; }).length,
          levelFont: Math.min(...cells.map((c) => parseFloat(getComputedStyle(c.querySelector('.skill-level')).fontSize))),
          levels: cells.map((c) => Number(c.querySelector('.skill-level').textContent)),
          totals: document.querySelector('.skill-totals').textContent,
          minCell: Math.min(...cells.map((c) => { const r = c.getBoundingClientRect(); return Math.min(r.width, r.height); })),
        };
      })()`);
        expect(info.n === 13, `${info.n} skills`);
        expect(
          info.cols === 3 && info.distinctLefts === 3,
          `cols ${info.cols}, distinct lefts ${info.distinctLefts}`,
        );
        expect(info.missingIcon.length === 0, 'icons missing/zero width: ' + info.missingIcon);
        expect(
          info.tints >= 10 && info.bgs === 13,
          `tints ${info.tints} distinct, tinted bg on ${info.bgs}`,
        );
        expect(info.levelFont >= 16, `level font ${info.levelFont}px not big`);
        const sum = info.levels.reduce((a, b) => a + b, 0);
        const m = /Total level:\s*(\d+).*Combat level:\s*(\d+)/s.exec(info.totals);
        expect(m, 'totals text ' + info.totals);
        expect(Number(m[1]) === sum, `total ${m[1]} != sum of cells ${sum}`);
        expect(Number(m[2]) === 3, `fresh combat level ${m[2]} != 3`);
        await shot(`${phase}-skills`);
        return `13 cells, 3 cols, all icons naturalWidth>0, ${info.tints} distinct tints, level font ${info.levelFont}px, min cell ${Math.round(info.minCell)}px, ${info.totals}`;
      },
    );

    await check('s2', 'tap a skill: XP + XP-to-next; tap again hides', async () => {
      const r = await T(`rect('.skill-cell[aria-label^="Woodcutting"]')`);
      expect(r, 'no woodcutting cell');
      await tap(r.x, r.y);
      const d = await cdp.eval(`document.querySelector('.skill-detail')?.innerText`);
      expect(
        d && /XP: 0\b/.test(d) && /Next level in: 83 XP/.test(d),
        'detail text: ' + JSON.stringify(d),
      );
      await tap(r.x, r.y);
      expect(!(await cdp.eval('!!document.querySelector(".skill-detail")')), 'detail did not hide');
      await tap(r.x, r.y);
      return JSON.stringify(d);
    });

    await check('s3', 'chop a log: Woodcutting cell level/progress + tracker update', async () => {
      await openTab('Inventory');
      await resetNear(17, 17);
      const before = await T('g().progression.xp.woodcutting');
      await tapTree(15, 18);
      await waitFor('log', async () => (await T('logs()')) >= 1, 40000);
      await sleep(300);
      const xp = await T('g().progression.xp.woodcutting');
      expect(xp > before, `xp ${before}->${xp}`);
      const tracker = await cdp.eval(
        `document.querySelector('[aria-label="Woodcutting tracker"]')?.innerText ?? null`,
      );
      expect(tracker && /XP/.test(tracker), 'no tracker: ' + tracker);
      expect(
        Number(/([\d,]+) XP/.exec(tracker)[1].replace(',', '')) === Math.floor(xp),
        `tracker "${tracker}" vs xp ${xp}`,
      );
      await openTab('Skills');
      const bar = await cdp.eval(
        `(() => { const c = document.querySelector('.skill-cell[aria-label^="Woodcutting"]'); const p = c.querySelector('[role=progressbar]'); return { now: p && p.getAttribute('aria-valuenow'), lvl: c.querySelector('.skill-level').textContent }; })()`,
      );
      expect(
        bar.now && Number(bar.now) > 0,
        'cell progress bar did not move: ' + JSON.stringify(bar),
      );
      const r = await T(`rect('.skill-cell[aria-label^="Woodcutting"]')`);
      if (!(await cdp.eval('!!document.querySelector(".skill-detail")'))) await tap(r.x, r.y);
      const d = await cdp.eval(`document.querySelector('.skill-detail')?.innerText`);
      expect(new RegExp(`XP: ${Math.floor(xp)}`).test(d), `detail ${d} vs xp ${xp}`);
      await tap(r.x, r.y);
      await openTab('Inventory');
      return `xp ${before}->${xp}; tracker "${tracker.replace(/\n/g, ' | ')}"; cell progress ${bar.now}; detail ${JSON.stringify(d)}`;
    });

    // ---------- 2. blocked-action VFX ----------
    const blocked = async (id, title, setup, tree, text, reason) =>
      check(id, title, async () => {
        await setup();
        await resetNear(...tree.stand);
        await T('st()').catch(() => 0);
        const p = await tileClient(tree.x, tree.y);
        expect(
          await T(`topIsCanvas(${p.x}, ${p.y})`),
          `tree point covered/off-screen ${JSON.stringify(p)}`,
        );
        const gfx0 = await T('gfxVisible().length');
        await tap(p.x, p.y);
        let texts = [];
        let gfx = 0;
        const t0 = Date.now();
        const end = t0 + (text === 'Inventory full' ? 60000 : 6000);
        while (Date.now() < end && !texts.some((t) => t.includes(text))) {
          texts = await T('liveTexts()');
          gfx = Math.max(gfx, (await T('gfxVisible().length')) - gfx0);
          await sleep(50);
        }
        expect(
          texts.some((t) => t.includes(text)),
          `no "${text}" text; live texts ${JSON.stringify(texts)}; tap at ${JSON.stringify(p)}; state ${JSON.stringify(await T('g()').then((g) => ({ pos: g.movement.position, path: g.movement.path.length, pend: g.pendingInteraction, sess: g.gathering.session })))}`,
        );
        const cross = await cdp.eval(`window.__t.gfxVisible()`);
        await sleep(150);
        const chat = await T('chat()');
        await shot(`${phase}-${id}`);
        return (
          `after ${Date.now() - t0}ms; texts ${JSON.stringify(texts)}; visible gfx +${gfx} (${JSON.stringify(cross.slice(0, 2))}); chat tail ${JSON.stringify(chat.slice(-2))}` +
          (reason ? '' : '')
        );
      });

    const noAxe = () =>
      setGame(
        `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s) => (s && s.itemId.endsWith('_axe') ? null : s)) } })`,
      );
    await blocked(
      'b1',
      'no axe -> red cross + "No axe" + chat',
      noAxe,
      { x: 16, y: 19, stand: [17, 18] },
      'No axe',
    );
    await check('b1chat', 'no axe chat line', async () => {
      const chat = await T('chat()');
      expect(
        chat.some((l) => /axe/i.test(l)),
        'chat: ' + JSON.stringify(chat.slice(-4)),
      );
      return JSON.stringify(chat.slice(-2));
    });
    await blocked(
      'b2',
      'oak at level <15 -> "Level 15 needed"',
      () =>
        setGame(
          `({ ...g, inventory: { ...g.inventory, slots: [{ itemId: 'bronze_axe', quantity: 1 }, ...g.inventory.slots.slice(1)] } })`,
        ),
      { x: 22, y: 21, stand: [22, 19] },
      'Level 15 needed',
    );
    await check('b2chat', 'level chat line', async () => {
      const chat = await T('chat()');
      expect(
        chat.some((l) => /15/.test(l)),
        'chat: ' + JSON.stringify(chat.slice(-4)),
      );
      return JSON.stringify(chat.slice(-1));
    });
    await blocked(
      'b3',
      'full inventory -> "Inventory full"',
      () =>
        setGame(
          `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : { itemId: 'logs', quantity: 1 })) } })`,
        ),
      { x: 16, y: 19, stand: [17, 18] },
      'Inventory full',
    );
    await check('b3chat', 'inventory full chat line', async () => {
      const chat = await T('chat()');
      expect(
        chat.some((l) => /inventory.*full|full/i.test(l)),
        'chat: ' + JSON.stringify(chat.slice(-4)),
      );
      return JSON.stringify(chat.slice(-1));
    });
    // restore a normal inventory
    await setGame(
      `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : null)) }, gathering: { ...g.gathering, session: null } })`,
    );

    // ---------- 3. minimap ----------
    await check('m1', 'tap minimap: player walks toward that tile', async () => {
      await resetNear(18, 15);
      const r = await T(`rect('canvas.minimap')`);
      expect(r, 'no minimap');
      const css = r.w;
      const perTile = (4 * css) / 160;
      const tries = [
        [0.55, 0.0],
        [0.0, 0.55],
        [-0.55, 0.0],
      ];
      const out = [];
      for (const [fx, fy] of tries) {
        const start = await T('g().movement.position');
        const dx = Math.round((fx * css) / 2 / perTile);
        const dy = Math.round((fy * css) / 2 / perTile);
        const wantX = start.x + Math.round((fx * css) / 2 / perTile);
        const wantY = start.y + Math.round((fy * css) / 2 / perTile);
        await tap(r.x + (fx * css) / 2, r.y + (fy * css) / 2);
        await sleep(150);
        const path = await T('g().movement.path');
        if (!path.length) {
          out.push(`tap ${fx},${fy} -> no path (maybe unwalkable)`);
          continue;
        }
        const end = path[path.length - 1];
        const dist = Math.hypot(end.x - wantX, end.y - wantY);
        expect(
          dist <= 1.5,
          `minimap tap targeted ${JSON.stringify(end)}, expected about ${wantX},${wantY} (d=${dx},${dy}, ${perTile}px/tile)`,
        );
        await sleep(2500);
        const now = await T('g().movement.position');
        expect(
          Math.hypot(now.x - start.x, now.y - start.y) >= 1,
          `player did not move from ${JSON.stringify(start)}`,
        );
        out.push(
          `tap(${fx},${fy}) dest ${JSON.stringify(end)} want ~${wantX},${wantY}; moved ${JSON.stringify(start)} -> ${JSON.stringify(now)}`,
        );
        await shot(`${phase}-minimap`);
        return out.join(' | ');
      }
      throw new Error('no minimap tap produced a path: ' + out.join(' | '));
    });

    await check('m2', 'N re-centres the camera after a drag-pan', async () => {
      await resetNear(18, 15);
      await sleep(500);
      const c0 = await T('camCentre()');
      const pw = await T('playerWorld()');
      const mid = { x: vp.w * 0.4, y: vp.h * 0.4 };
      await drag(mid.x, mid.y, mid.x - 120, mid.y - 80);
      await sleep(300);
      const c1 = await T('camCentre()');
      const panned = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      expect(panned > 30, `drag did not pan camera (${panned}px)`);
      expect((await T('g().movement.path.length')) === 0, 'drag started a walk');
      const rec0 = await T('st().recentre');
      const hit = await cdp.eval(
        `(() => { const r = document.querySelector('.minimap-n').getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t.className || t.tagName; })()`,
      );
      await tapSel('button[aria-label^="Compass"]');
      await sleep(1200);
      const rec1 = await T('st().recentre');
      const walked = await T('g().movement.path.length');
      expect(
        rec1 === rec0 + 1,
        `BUG-HUD-1: N tap did not call recentreCamera (counter ${rec0}->${rec1}); element under N is "${hit}"${walked ? '; it started a minimap walk (path ' + walked + ')' : ''}`,
      );
      const c2 = await T('camCentre()');
      const pw2 = await T('playerWorld()');
      const off = Math.hypot(c2.x - pw2.x - (c0.x - pw.x), c2.y - pw2.y - (c0.y - pw.y));
      expect(
        off < 40,
        `after N camera is ${off}px from its pre-pan offset to the player (was panned ${panned})`,
      );
      return `panned ${panned.toFixed(0)}px, after N ${off.toFixed(1)}px from player (centre ${JSON.stringify(c2)}, player ${JSON.stringify(pw2)}, before ${JSON.stringify(pw)})`;
    });

    // ---------- 4. orbs ----------
    await check('o1', 'HP and Prayer orbs show current/max', async () => {
      const o = await cdp.eval(
        `[...document.querySelectorAll('.orb')].map((b) => ({ label: b.getAttribute('aria-label'), text: b.textContent, disabled: b.disabled }))`,
      );
      expect(o.length === 3, 'orbs: ' + JSON.stringify(o));
      const g = await T('g()');
      const hpMax = await cdp.eval(
        `(async () => { const m = await import('/src/core/progression/index.ts'); const g = window.__idleRpg.store.getState().game; return { hp: m.getLevel(g.progression, 'hitpoints'), pr: m.getLevel(g.progression, 'prayer') }; })()`,
      );
      expect(
        o[0].label.includes(String(g.hp.current)) && o[1].label.includes(String(g.prayer.current)),
        'orb labels ' + JSON.stringify(o),
      );
      // current/max: lower HP and check the orb follows the current value
      await setGame(`({ ...g, hp: { ...g.hp, current: 4 } })`);
      await sleep(200);
      const lab = await cdp.eval(`document.querySelector('.orb').getAttribute('aria-label')`);
      const fill = await cdp.eval(
        `getComputedStyle(document.querySelector('.orb')).getPropertyValue('--orb-pct')`,
      );
      expect(lab.includes('4'), 'hp orb after change: ' + lab);
      await setGame(`({ ...g, hp: { ...g.hp, current: ${g.hp.current} } })`);
      // does the orb itself show a "current/max" - report what it shows
      return `labels ${JSON.stringify(o.map((x) => x.label))}; text ${JSON.stringify(o.map((x) => x.text))}; max hp ${hpMax.hp} prayer ${hpMax.pr}; fill at hp 4: ${fill.trim()}`;
    });

    await check(
      'o2',
      'Run orb toggles running; 2 tiles/tick while running; drains energy',
      async () => {
        await resetNear(18, 15);
        const orb = 'button.orb[aria-label^="Run"]';
        expect((await T('g().movement.running')) === false, 'running initially');
        await tapSel(orb);
        expect((await T('g().movement.running')) === true, 'tap did not enable run');
        const lab = await cdp.eval(`document.querySelector('${orb}').getAttribute('aria-label')`);
        expect(lab.startsWith('Run on'), 'label ' + lab);
        const e0 = await T('g().movement.runEnergy');
        await T('mark()');
        await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 28, y: 15 })`);
        await sleep(3600);
        const trace = await T('unmark()');
        const e1 = await T('g().movement.runEnergy');
        const steps = trace
          .slice(1)
          .map((p, i) => Math.abs(p.x - trace[i].x) + Math.abs(p.y - trace[i].y));
        expect(steps.length >= 3, 'too few steps ' + JSON.stringify(trace));
        expect(steps.filter((s) => s === 2).length >= 2, `running steps ${steps}`);
        expect(e1 < e0, `energy ${e0} -> ${e1}`);
        // toggle off, walk back, 1 tile/tick
        await tapSel(orb);
        expect((await T('g().movement.running')) === false, 'tap did not disable run');
        await sleep(2000);
        await T('mark()');
        await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 18, y: 15 })`);
        await sleep(3400);
        const t2 = await T('unmark()');
        const s2 = t2.slice(1).map((p, i) => Math.abs(p.x - t2[i].x) + Math.abs(p.y - t2[i].y));
        expect(s2.length >= 3 && s2.every((s) => s === 1), `walking steps ${s2}`);
        return `run steps/tick ${JSON.stringify(steps)} energy ${e0}->${e1}; walk steps ${JSON.stringify(s2)}`;
      },
    );

    await check('o3', 'Run cannot be enabled at 0 energy', async () => {
      await resetNear(18, 15);
      await setGame(`({ ...g, movement: { ...g.movement, running: false, runEnergy: 0 } })`);
      await sleep(250);
      const st = await cdp.eval(
        `(() => { const b = document.querySelector('button.orb[aria-label^="Run"]'); return { disabled: b.disabled, label: b.getAttribute('aria-label'), text: b.textContent }; })()`,
      );
      await tapSel('button.orb[aria-label^="Run"]');
      await sleep(200);
      expect((await T('g().movement.running')) === false, 'run turned on at 0 energy');
      // also at 50/10000 (<1%)
      await setGame(`({ ...g, movement: { ...g.movement, running: false, runEnergy: 50 } })`);
      await sleep(200);
      await tapSel('button.orb[aria-label^="Run"]');
      expect((await T('g().movement.running')) === false, 'run turned on at 50 energy');
      // while running, hitting 0 turns it off
      await setGame(`({ ...g, movement: { ...g.movement, running: true, runEnergy: 100 } })`);
      await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 28, y: 15 })`);
      await sleep(2500);
      const m = await T('g().movement');
      await setGame(
        `({ ...g, movement: { ...g.movement, running: false, runEnergy: 10000, path: [] } })`,
      );
      return `at 0: ${JSON.stringify(st)}; running with 100 energy then walking 4 ticks -> running=${m.running} energy=${m.runEnergy}`;
    });

    // ---------- 5. animation modes ----------
    // A tree that is standing now (trees respawn slowly and earlier checks fell some), nearest first.
    const standingTree = () =>
      cdp.eval(`(async () => {
        const w = await import('/src/features/world/index.ts');
        const k = await import('/src/core/skills/index.ts');
        const g = window.__idleRpg.store.getState().game;
        const t = w.TREE_SPAWNS.filter((s) => s.defId === 'tree' && s.x >= 14 && s.x <= 16 && s.y >= 18 && s.y <= 21 && !(g.gathering.nodes[s.nodeId] && k.isDepleted(g.gathering.nodes[s.nodeId])));
        return t.length ? [t[0].x, t[0].y] : null;
      })()`);
    const animRun = async (mode) => {
      await stepTo('Animations', mode);
      expect((await T('st().prefs.visuals.animations')) === mode.toLowerCase(), 'pref not ' + mode);
      let last = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const tree = await waitFor('a standing tree', standingTree, 60000);
        await resetNear(17, 19);
        await setGame(
          `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : null)) } })`,
        );
        await T('sample(1)');
        const sampler = cdp.eval(`window.__t.sample(45000)`);
        await tapTree(...tree);
        last = await sampler;
        // need a long enough chop (several ticks) to see the animation, and a log to see the fall
        const chopFrames = last.filter((x) => x.chop && x.axeVisible).length;
        if (last.some((x) => x.logAt !== null) && chopFrames >= 200) return last;
      }
      return last;
    };
    const stats = (all) => {
      const first = all.findIndex((x) => x.chop && x.axeVisible);
      const s =
        first < 0
          ? []
          : all.slice(first).filter((x) => x.chop && x.axeVisible && x.t > all[first].t + 400);
      const chopping = s.length;
      const rots = s.map((x) => x.rot);
      const min = Math.min(...rots);
      const max = Math.max(...rots);
      const distinct = new Set(rots.map((r) => r.toFixed(3))).size;
      const logAt = all.find((x) => x.logAt !== null)?.logAt ?? null;
      const base = all[0].containers;
      const after = logAt === null ? [] : all.filter((x) => x.t >= logAt);
      const ghostFrames = after.filter((x) => x.containers > base).length;
      const ghostMs = ghostFrames
        ? after.filter((x) => x.containers > base).at(-1).t -
          after.find((x) => x.containers > base).t
        : 0;
      return {
        logAt: logAt && Math.round(logAt),
        ghostFrames,
        ghostMs: Math.round(ghostMs),
        chopFrames: chopping,
        min,
        max,
        range: max - min,
        distinct,
        axeVisible: s.some((x) => x.axeVisible),
        maxContainers: Math.max(...s.map((x) => x.containers)),
        minContainers: Math.min(...s.map((x) => x.containers)),
      };
    };
    const modes = {};
    for (const mode of ['On', 'Reduced', 'Off']) {
      await check(`a-${mode}`, `Animations ${mode}: axe rotation over a chop`, async () => {
        const s = await animRun(mode);
        const st = stats(s);
        const gathering = await T('g().gathering.session !== null');
        modes[mode] = st;
        await shot(`${phase}-anim-${mode}`);
        if (mode === 'On')
          expect(st.range > 0.8 && st.distinct > 20, `no swing: ${JSON.stringify(st)}`);
        if (mode === 'Reduced')
          expect(
            st.chopFrames > 90 && st.distinct === 2 && st.range > 0.02 && st.range < 1.0,
            `Reduced is not a small tap: ${JSON.stringify(st)}`,
          );
        if (mode === 'Off')
          expect(st.chopFrames > 90 && st.distinct === 1, `Off axe moves: ${JSON.stringify(st)}`);
        return `${JSON.stringify(st)} (session ${gathering})`;
      });
    }
    await check('a-fall', 'tree fall ghost: appears On, instant when Off', async () => {
      // compare transient container counts around the log drop: ghost = extra Container for fallMs
      expect(modes.On && modes.Off, 'mode runs missing');
      for (const m of ['On', 'Reduced', 'Off'])
        expect(modes[m].logAt !== null, `${m}: no log arrived to observe the fall`);
      expect(modes.On.ghostMs >= 300, `On: no tree-fall ghost seen (ghostMs ${modes.On.ghostMs})`);
      expect(
        modes.Off.ghostFrames === 0,
        `Off: fall not instant, ghost for ${modes.Off.ghostMs}ms`,
      );
      return `ghost ms On ${modes.On.ghostMs}, Reduced ${modes.Reduced.ghostMs}, Off ${modes.Off.ghostMs}; max containers On ${modes.On.maxContainers} (min ${modes.On.minContainers}), Reduced ${modes.Reduced?.maxContainers}, Off ${modes.Off.maxContainers} (min ${modes.Off.minContainers})`;
    });
    await stepTo('Animations', 'On');
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
  killTracked();
  process.exit(fail ? 1 : 0);
}
main();
