/* global fetch, console */
// Level-up e2e: real chop -> level-up popup/chat/effects/skills/tracker, Notifications + Effects toggles. Own vite on :5201.
// Run: node tests/e2e/levelUp.e2e.mjs   (E2E_PORT overrides the port for mutation copies; E2E_ROOT the tree.)
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

setTimeout(() => {
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();

const PORT = Number(process.env.E2E_PORT ?? 5201);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = process.env.E2E_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

async function startVite() {
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
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
  const live = (o) => o.visible && o.active && o.alpha > 0;
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    st: () => H().store.getState(),
    xp: () => H().store.getState().game.progression.xp.woodcutting,
    lvl: async () => { const P = await import('/src/core/progression/index.ts'); return P.levelForXp(H().store.getState().game.progression.xp.woodcutting); },
    logs: async () => { const I = await import('/src/core/inventory/index.ts'); return I.countItem(H().store.getState().game.inventory, 'logs'); },
    // set Woodcutting xp to (xp needed for level L) - 1 so one log crosses into L
    justBelow: async (L) => { const P = await import('/src/core/progression/index.ts'); const s = H().store, g = s.getState().game;
      s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, woodcutting: P.xpForLevel(L) - 1 } } } }); },
    chop: async () => { const { CONTENT } = await import('/src/app/registry.ts'); const s = H().store; const me = s.getState().game.movement.position; let best = null;
      for (const [id, t] of CONTENT.trees) { const d = Math.abs(t.x - me.x) + Math.abs(t.y - me.y); if (best === null || d < best.d) best = { id, d }; }
      s.getState().interactTree(best.id); return best; },
    // sampler: max count of live gold (level-up ring/sparkle) arcs seen since reset
    gold: () => world().children.list.filter((o) => o.type === 'Arc' && o.fillColor === 0xffe14d && live(o)).length,
    startSampler: () => { window.__max = 0; clearInterval(window.__iv); window.__iv = setInterval(() => { window.__max = Math.max(window.__max, window.__t.gold()); }, 8); },
    max: () => window.__max,
    popup: () => { const e = document.querySelector('.levelup'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, html: e.innerHTML, x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; },
    popups: () => document.querySelectorAll('.levelup').length,
    chat: () => H().store.getState().game.chat.map((l) => l.text),
    chatDom: () => document.querySelector('[role=log]')?.textContent ?? '',
    rectOf: (sel, text, starts) => { const e = [...document.querySelectorAll(sel)].find((x) => starts ? x.textContent.trim().startsWith(text) : x.textContent.trim() === text); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    playerClient: () => { const c = scene().playerView.container; return window.__t.toClient(c.x, c.y); },
    pos: () => { const p = H().store.getState().game.movement.position; return p.x + ',' + p.y; },
    switchState: (label) => { const e = [...document.querySelectorAll('[role=switch]')].find((x) => x.textContent.trim().startsWith(label)); return e ? e.getAttribute('aria-checked') : null; },
  };
})();`;

async function runPhase(cdp, phase, touch, errors) {
  const T = (e) => cdp.eval(`window.__t.${e}`);
  const waitFor = async (what, pred, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout: ' + what);
      await sleep(40);
    }
  };
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
    await sleep(200);
  };
  const tapSel = async (sel, text, starts) => {
    const r = await T(
      text
        ? `rectOf(${JSON.stringify(sel)}, ${JSON.stringify(text)}, ${!!starts})`
        : `rect(${JSON.stringify(sel)})`,
    );
    expect(r, `not found: ${sel} ${text ?? ''}`);
    await sleep(100);
    const r2 = await T(
      text
        ? `rectOf(${JSON.stringify(sel)}, ${JSON.stringify(text)}, ${!!starts})`
        : `rect(${JSON.stringify(sel)})`,
    );
    await tap(r2.x, r2.y);
    return r2;
  };
  if (touch) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
  }
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(400);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: ORIGIN.slice(0, -1),
    storageTypes: 'local_storage',
  });
  await cdp.send('Page.navigate', { url: ORIGIN + '?tickMs=60' });
  await waitFor('ready', () => T('ready()').catch(() => false), 25000);
  await sleep(1200);
  const NAME = 'Woodcutting';
  const LINE = (n) =>
    `Congratulations, you've just advanced your ${NAME} level. You are now level ${n}.`;

  // chop until xp rises (tree may be depleted/respawning), returns when xp > before
  const chopOne = async () => {
    const xp0 = await T('xp()');
    const logs0 = await T('logs()');
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      await T('chop()');
      for (let i = 0; i < 40; i++) {
        if ((await T('xp()')) > xp0) return { xp0, logs0 };
        await sleep(50);
      }
    }
    throw new Error('no xp from chopping in 15 s');
  };

  await check(
    'L0',
    'control: chop with no level boundary = log + no popup + no gold fx',
    async () => {
      await T('startSampler()');
      const lvl0 = await T('lvl()');
      const { logs0 } = await chopOne();
      await sleep(500);
      const logs1 = await T('logs()');
      expect(logs1 === logs0 + 1, `logs ${logs0}->${logs1}`);
      expect((await T('lvl()')) === lvl0, 'level changed');
      expect((await T('popups()')) === 0, 'popup without level-up');
      expect((await T('max()')) === 0, 'gold fx without level-up');
      return `lvl ${lvl0}, logs ${logs0}->${logs1}, popups 0, gold max 0`;
    },
  );

  let gold1 = 0;
  await check(
    'L1',
    'real chop across a boundary: level 1->2 (xp 82 -> >=83), log gained',
    async () => {
      await T('justBelow(2)');
      await T('startSampler()');
      const { xp0, logs0 } = await chopOne();
      await sleep(300);
      const lvl = await T('lvl()');
      const logs1 = await T('logs()');
      gold1 = await T('max()');
      expect(lvl === 2, `level ${lvl}`);
      expect(logs1 === logs0 + 1, `logs ${logs0}->${logs1}`);
      return `xp ${xp0}->${await T('xp()')}, level 2, logs ${logs0}->${logs1}`;
    },
  );

  await check('L1b', 'tracker (HUD) shows Woodcutting Lv 2 right after the chop', async () => {
    const tr = await cdp.eval(
      `document.querySelector('[aria-label="Woodcutting tracker"]')?.textContent ?? null`,
    );
    expect(tr && tr.includes('Lv 2'), 'tracker ' + tr);
    return `tracker "${tr}"`;
  });

  await check(
    'L2',
    'popup shows skill name + new level, plain text (no markup in text)',
    async () => {
      const p = await waitFor('popup', () => T('popup()'), 3000);
      expect(p.text.includes('Congratulations!'), p.text);
      expect(p.text.includes('Your Woodcutting level is now 2.'), p.text);
      expect(!/<script|&lt;/i.test(p.html), 'html leak');
      const vw = await cdp.eval('innerWidth');
      expect(p.l >= 0 && p.r <= vw && p.t >= 0, `popup off-screen ${JSON.stringify(p)}`);
      return `"${p.text}" rect ${Math.round(p.l)}-${Math.round(p.r)} x ${Math.round(p.t)}-${Math.round(p.b)} vw ${vw}`;
    },
  );

  await check(
    'L3',
    'popup does not block play: tap ground away from it, player walks',
    async () => {
      const p = await T('popup()');
      expect(p, 'popup gone already');
      const pc = await T('playerClient()');
      const start = await T('pos()');
      const vw = await cdp.eval('innerWidth');
      const vh = await cdp.eval('innerHeight');
      let moved = null;
      for (const [dx, dy] of [
        [70, 40],
        [-70, 40],
        [70, -40],
        [-70, -40],
        [0, 90],
        [0, -90],
      ]) {
        const x = pc.x + dx,
          y = pc.y + dy;
        if (x > p.l - 8 && x < p.r + 8 && y > p.t - 8 && y < p.b + 8) continue;
        if (x < 5 || y < 5 || x > vw - 5 || y > vh - 5) continue;
        const top = await cdp.eval(
          `(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName + '.' + e.className : null; })()`,
        );
        if (!String(top).startsWith('CANVAS')) continue;
        await tap(x, y);
        await sleep(1200);
        if ((await T('pos()')) !== start) {
          moved = { dx, dy, from: start, to: await T('pos()') };
          break;
        }
      }
      expect(moved, 'player never moved while popup visible');
      return `moved ${moved.from} -> ${moved.to} (tap offset ${moved.dx},${moved.dy}) popup still: ${!!(await T('popup()'))}`;
    },
  );

  await check('L4', 'chat gets the level-up line (store + DOM)', async () => {
    const chat = await T('chat()');
    expect(chat.includes(LINE(2)), 'store chat lacks line: ' + JSON.stringify(chat.slice(-3)));
    const dom = await T('chatDom()');
    expect(dom.includes(LINE(2)), 'chat DOM lacks line');
    return `"${LINE(2)}" in store + DOM, count ${chat.filter((c) => c === LINE(2)).length}`;
  });

  await check('L5', 'Effects On: gold level-up ring/sparkles played (>0 live arcs)', async () => {
    expect(gold1 > 0, `gold max ${gold1}`);
    return `max live gold arcs ${gold1}`;
  });

  await check('L6', 'popup dismisses by tap (not blocking afterwards)', async () => {
    await tapSel('.levelup');
    await waitFor('popup gone', async () => (await T('popups()')) === 0, 1500);
    return 'popup removed after tap';
  });

  await check('L7', 'skills grid shows new level', async () => {
    await tapSel('[role=tab]', 'Skills');
    await waitFor('grid', () => cdp.eval('!!document.querySelector(".skill-cell")'), 3000);
    const lbl = await cdp.eval(
      `document.querySelector('.skill-cell[aria-label^="Woodcutting"]')?.getAttribute('aria-label')`,
    );
    expect(lbl === 'Woodcutting level 2', 'grid label ' + lbl);
    const lv = await cdp.eval(
      `document.querySelector('.skill-cell[aria-label^="Woodcutting"] .skill-level')?.textContent`,
    );
    expect(lv === '2', 'cell level ' + lv);
    return `grid "${lbl}", cell level ${lv}`;
  });

  await check('L8', 'popup auto-dismisses by timeout (~4 s)', async () => {
    await T('justBelow(3)');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const t0 = Date.now();
    await chopOne();
    await waitFor('popup', () => T('popup()'), 3000);
    const shown = Date.now();
    await waitFor('popup timeout', async () => (await T('popups()')) === 0, 6000);
    const ms = Date.now() - shown;
    expect(ms > 2500 && ms < 5500, `popup lived ${ms} ms`);
    return `popup lived ~${ms} ms (spec 4000)`;
  });

  await check(
    'L9',
    'two level-ups in a row: one popup, shows latest, no stacking, timer restarts',
    async () => {
      await T('justBelow(4)');
      await chopOne();
      await waitFor(
        'popup4',
        async () => (await T('popup()'))?.text.includes('level is now 4'),
        3000,
      );
      await sleep(1500);
      await T('justBelow(5)');
      await chopOne();
      await sleep(200);
      const n = await T('popups()');
      const p = await T('popup()');
      expect(n === 1, `${n} popups`);
      expect(p.text.includes('level is now 5'), p.text);
      // 1.5 s + ~0.3 s elapsed since first popup; 4 s timer from first would end it ~2.2 s from now; restarted timer lasts longer
      await sleep(2800);
      const still = await T('popups()');
      expect(still === 1, 'second popup died with first popup timer');
      await waitFor('popup gone', async () => (await T('popups()')) === 0, 4000);
      const chat = await T('chat()');
      expect(chat.includes(LINE(4)) && chat.includes(LINE(5)), 'chat lines missing');
      return `1 popup (level 5), survived first timer, then dismissed; chat has L4 + L5 lines`;
    },
  );

  await check(
    'L10',
    'Effects Off: level applied + popup shows, NO gold fx; restore On',
    async () => {
      await cdp.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'off' } })`);
      await sleep(200);
      await T('justBelow(6)');
      await T('startSampler()');
      await chopOne();
      await sleep(900);
      const lvl = await T('lvl()');
      const max = await T('max()');
      const pop = await T('popup()');
      expect(lvl === 6, 'level ' + lvl);
      expect(max === 0, 'gold fx with Effects Off: ' + max);
      expect(pop, 'popup missing with Effects Off');
      await cdp.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on' } })`);
      await tapSel('.levelup');
      return `level 6, gold max ${max}, popup shown`;
    },
  );

  await check(
    'L11',
    'Settings > Level-up popup Off (real tap): popup suppressed, level + chat still applied',
    async () => {
      await tapSel('[aria-label="Settings"]');
      await waitFor('switch', () => T(`switchState('Level-up popup')`), 3000);
      expect((await T(`switchState('Level-up popup')`)) === 'true', 'default not On');
      await tapSel('[role=switch]', 'Level-up popup', true);
      expect((await T(`switchState('Level-up popup')`)) === 'false', 'toggle did not turn Off');
      await tapSel('[aria-label="Close settings"]');
      await sleep(300);
      await T('justBelow(7)');
      await chopOne();
      await sleep(800);
      const lvl = await T('lvl()');
      const n = await T('popups()');
      const storeNotice = await cdp.eval('window.__idleRpg.store.getState().levelUp');
      const chat = await T('chat()');
      expect(lvl === 7, 'level ' + lvl);
      expect(n === 0 && storeNotice === null, `popup ${n} store ${JSON.stringify(storeNotice)}`);
      expect(chat.includes(LINE(7)), 'chat line missing');
      // turn back On and verify popup returns
      await tapSel('[aria-label="Settings"]');
      await waitFor('switch', () => T(`switchState('Level-up popup')`), 3000);
      await tapSel('[role=switch]', 'Level-up popup', true);
      expect((await T(`switchState('Level-up popup')`)) === 'true', 'did not turn back On');
      await tapSel('[aria-label="Close settings"]');
      await sleep(300);
      await T('justBelow(8)');
      await chopOne();
      await waitFor('popup back', () => T('popup()'), 3000);
      return `level 7 applied, 0 popups, chat line present; re-enabled -> popup returns`;
    },
  );

  await check('X', '0 console errors / exceptions', async () => {
    expect(errors.length === 0, errors.join(' | '));
    return '0';
  });
  errors.length = 0;
}

async function main() {
  const t0 = Date.now();
  let code = 1;
  let vite = null;
  let cdp = null;
  try {
    vite = await startVite();
    cdp = await launchChrome({ width: 1280, height: 800 });
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
    await runPhase(cdp, 'desktop', false, errors);
    await runPhase(cdp, 'phone', true, errors);
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title} :: ${r.ev}`);
    const bad = results.filter((r) => !r.ok);
    console.log(
      `\n${results.length - bad.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
    code = bad.length ? 1 : 0;
  } catch (e) {
    console.error('E2E ERROR', e);
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} :: ${r.ev}`);
  } finally {
    try {
      cdp?.close?.();
    } catch {
      /* ignore */
    }
    if (vite) killChild(vite);
    killTracked();
  }
  process.exit(code);
}
main();
