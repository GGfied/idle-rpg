/* global fetch, console */
// Blocked-action feedback e2e: no axe / level too low / inventory full -> chat line, no chop, short-lived effect.
// Own vite on :5192 (E2E_PORT overrides; never 5173). Run: node tests/e2e/blocked.e2e.mjs  Exit 0 = all pass.
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitStill } from './lib.mjs';
import { hardTimeout, killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

hardTimeout(6 * 60e3);
const PORT = Number(process.env.E2E_PORT ?? 5192);
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
  const live = (o) => o.visible && o.active && o.alpha > 0;
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    g: () => H().store.getState().game,
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    tileClient: async (tx, ty, dy) => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(tx, ty); return window.__t.toClient(w.x, w.y + dy); },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    // effect objects: live Text/Graphics in the world; also total child count (pool growth = leak)
    fx: () => world().children.list.filter((o) => (o.type === 'Text' || (o.type === 'Graphics' && o.depth > 0)) && live(o)).length,
    texts: () => world().children.list.filter((o) => o.type === 'Text' && live(o)).map((o) => o.text),
    total: () => world().children.list.length,
    chat: () => H().store.getState().game.chat.map((l) => l.text),
    trees: async () => { const { CONTENT } = await import('/src/app/registry.ts'); return [...CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, defId: t.defId })); },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
  };
})();`;

async function runPhase(cdp, phase, touch, errors) {
  const T = (e) => cdp.eval(`window.__t.${e}`);
  const waitFor = async (what, pred, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout: ' + what);
      await sleep(50);
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
    await sleep(100);
  };
  const setGame = (expr) =>
    cdp.eval(
      `(() => { const s = window.__idleRpg.store; const g = s.getState().game; s.setState({ game: ${expr} }); })()`,
    );
  const setPlayer = (x, y) =>
    setGame(
      `({ ...g, movement: { ...g.movement, position: { x: ${x}, y: ${y} }, path: [] }, pendingInteraction: null, gathering: { ...g.gathering, session: null } })`,
    );
  const setInv = (kind) => {
    const slot = {
      none: `(s) => (s && s.itemId.endsWith('_axe') ? null : s)`,
      axe: `(s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : null)`,
      full: `(s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : { itemId: 'logs', quantity: 1 })`,
    }[kind];
    return setGame(
      `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map(${slot}) } })`,
    );
  };
  const setWc = (lvl) =>
    cdp.eval(`(async () => { const P = await import('/src/core/progression/index.ts'); const s = window.__idleRpg.store; const g = s.getState().game;
      const xp = P.xpForLevel ? P.xpForLevel(${lvl}) : 0; s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, woodcutting: xp } } } }); return xp; })()`);
  const setEffects = async (text) => {
    const clientOf = () =>
      cdp.eval(
        `(() => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Effects'); if (!g) return null; const b = [...g.querySelectorAll('button')].find((c) => c.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`,
      );
    const rect = (sel) =>
      cdp.eval(
        `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
      );
    if (!(await cdp.eval('!!document.querySelector(".settings")'))) {
      const b = await rect('button[aria-label="Settings"]');
      expect(b, 'no settings button');
      await tap(b.x, b.y);
      await sleep(200);
    }
    const r = await clientOf();
    expect(r, 'no Effects control ' + text);
    await tap(r.x, r.y);
    const c = await rect('button[aria-label="Close settings"]');
    expect(c, 'no close settings');
    await tap(c.x, c.y);
    await sleep(200);
  };

  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(500);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: ORIGIN.slice(0, -1),
    storageTypes: 'local_storage',
  });
  await cdp.send('Page.navigate', { url: ORIGIN });
  await waitFor('ready', () => T('ready()').catch(() => false), 25000);
  await sleep(800);

  const trees = await T('trees()');
  const normal = trees.find((t) => t.defId === 'tree');
  const oak = trees.find((t) => t.defId === 'oak_tree');
  if (!normal || !oak) throw new Error('trees: ' + JSON.stringify(trees.slice(0, 5)));
  // stand on a tile adjacent to the tree (a neighbour with no path), reset camera follow
  const standBy = (t) => [t.x, t.y + 1];

  /** One real tap on the tree; returns observations over ~2.5 s. */
  const attempt = async (tree, label) => {
    await setPlayer(...standBy(tree));
    await sleep(700);
    let p = await T(`tileClient(${tree.x}, ${tree.y}, 0)`);
    if (!(await T(`topIsCanvas(${p.x}, ${p.y})`))) {
      await cdp.eval('window.__idleRpg.store.getState().recentreCamera()');
      await sleep(900);
      p = await T(`tileClient(${tree.x}, ${tree.y}, 0)`);
    }
    // wait for the follow camera to settle (a moving camera makes the computed tap point stale)
    p = await waitStill(() => T(`tileClient(${tree.x}, ${tree.y}, 0)`));
    expect(
      await T(`topIsCanvas(${p.x}, ${p.y})`),
      `${label}: tree point ${JSON.stringify(p)} covered/off-screen`,
    );
    const chat0 = (await T('chat()')).length;
    const fx0 = await T('fx()');
    const total0 = await T('total()');
    const pw = await T('playerWorld()');
    await tap(p.x, p.y);
    let fxMax = 0;
    let texts = [];
    let session = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      fxMax = Math.max(fxMax, (await T('fx()')) - fx0);
      const tx = await T('texts()');
      if (tx.length > texts.length) texts = tx;
      session = session || (await T('g().gathering.session')) !== null;
      await sleep(40);
    }
    const chat = (await T('chat()')).slice(chat0);
    const st = await T('g()').then((g) => ({
      pos: g.movement.position,
      path: g.movement.path.length,
      pend: g.pendingInteraction,
      sess: g.gathering.session,
    }));
    return { chat, fxMax, texts, session, fx0, total0, pw, p, st };
  };
  const settled = async (fx0) => {
    await waitFor('effects gone', async () => (await T('fx()')) <= fx0, 4000);
    return await T('fx()');
  };

  await check('a', 'no axe: no chop, chat explains, effect appears then disappears', async () => {
    await setInv('none');
    await setWc(1);
    let r = await attempt(normal, 'a');
    if (r.chat.length === 0) {
      const r2 = await attempt(normal, 'a2');
      throw new Error(
        `first tap did nothing (chat [] state ${JSON.stringify(r.st)}); second attempt chat ${JSON.stringify(r2.chat)} fx ${r2.fxMax}`,
      );
    }
    expect(!r.session, 'a chop session started');
    expect(
      r.chat.some((l) => /axe/i.test(l)),
      'chat: ' +
        JSON.stringify(r.chat) +
        ' tap ' +
        JSON.stringify(r.p) +
        ' state ' +
        JSON.stringify(r.st),
    );
    expect(r.fxMax > 0, `no effect appeared (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    expect(
      r.texts.some((t) => /axe/i.test(t)),
      'no "axe" label: ' + JSON.stringify(r.texts),
    );
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check('b', 'level too low (oak): requirement in chat, effect shows then goes', async () => {
    await setInv('axe');
    await setWc(1);
    const r = await attempt(oak, 'b');
    expect(!r.session, 'b chop session started');
    expect(
      r.chat.some((l) => /15/.test(l)),
      'chat lacks requirement: ' + JSON.stringify(r.chat),
    );
    expect(r.fxMax > 0, `no effect (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    expect(
      r.texts.some((t) => /15/.test(t)),
      'label lacks level: ' + JSON.stringify(r.texts),
    );
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check('c', 'inventory full: no chop starts, chat line + effect right away', async () => {
    await setInv('full');
    await setWc(1);
    const r = await attempt(normal, 'c');
    const late = r.chat.length ? '' : ' (no chat line within 2.5 s)';
    expect(
      !r.session,
      `chop session started with a full inventory${late}; chat ${JSON.stringify(r.chat)}; state ${JSON.stringify(r.st)}`,
    );
    expect(
      r.chat.some((l) => /full/i.test(l)),
      'chat: ' + JSON.stringify(r.chat),
    );
    expect(r.fxMax > 0, `no effect (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check(
    'c2',
    'inventory full (eventual): chat line + effect after the first failed roll, then session ends',
    async () => {
      await setInv('full');
      await setWc(1);
      await waitFor('previous effects gone', async () => (await T('fx()')) === 0, 5000).catch(
        () => {},
      );
      await setPlayer(...standBy(normal));
      await sleep(700);
      const p = await T(`tileClient(${normal.x}, ${normal.y}, 0)`);
      const chat0 = (await T('chat()')).length;
      const t0 = Date.now();
      await tap(p.x, p.y);
      let fxMax = 0;
      let started = null;
      let msgAt = null;
      const seen = new Set();
      let rawMax = 0;
      const fx0 = await T('fx()');
      while (Date.now() - t0 < 40000 && msgAt === null) {
        if (started === null && (await T('g().gathering.session')) !== null)
          started = Date.now() - t0;
        fxMax = Math.max(fxMax, (await T('fx()')) - fx0);
        rawMax = Math.max(rawMax, await T('fx()'));
        for (const t of await T('texts()')) seen.add(t);
        if ((await T('chat()')).slice(chat0).some((l) => /full/i.test(l))) msgAt = Date.now() - t0;
        await sleep(40);
      }
      for (let i = 0; i < 15; i++) {
        fxMax = Math.max(fxMax, (await T('fx()')) - fx0);
        rawMax = Math.max(rawMax, await T('fx()'));
        for (const t of await T('texts()')) seen.add(t);
        await sleep(40);
      }
      expect(msgAt !== null, 'no inventory-full chat line within 40 s');
      await sleep(300);
      expect(
        (await T('g().gathering.session')) === null,
        'session still running after the message',
      );
      expect(
        seen.has('Inventory full'),
        `no Inventory full label (fx0 ${fx0}, raw max ${rawMax}); texts seen ${JSON.stringify([...seen])}`,
      );
      return `session started at ${started}ms, chat line at ${msgAt}ms, effect +${fxMax} texts ${JSON.stringify([...seen])}`;
    },
  );

  await check('d', 'repeat 10x: effect count and pool size return to baseline', async () => {
    await setInv('none');
    await setWc(1);
    await sleep(2500);
    const fx0 = await T('fx()');
    const total0 = await T('total()');
    const totals = [];
    for (let i = 0; i < 10; i++) {
      await setPlayer(...standBy(normal));
      await sleep(300);
      const p = await T(`tileClient(${normal.x}, ${normal.y}, 0)`);
      await tap(p.x, p.y);
      await sleep(900);
      totals.push(await T('total()'));
    }
    const fx = await settled(fx0).catch(() => T('fx()'));
    await sleep(500);
    const total = await T('total()');
    expect(fx <= fx0, `live effects ${fx0} -> ${fx}`);
    expect(total - total0 <= 6, `pool grew ${total0} -> ${total} (series ${totals})`);
    return `live fx ${fx0}->${fx}; world children ${total0}->${total}; series ${totals}`;
  });

  await check('e', 'Effects Off: no effect, chat line still appears; restored after', async () => {
    await setEffects('Off');
    try {
      await setInv('none');
      await setWc(1);
      const r = await attempt(normal, 'e');
      expect(
        r.chat.some((l) => /axe/i.test(l)),
        'chat missing with effects off: ' + JSON.stringify(r.chat),
      );
      expect(
        r.fxMax === 0,
        `effect appeared with Effects Off (fxMax ${r.fxMax}) texts ${JSON.stringify(r.texts)}`,
      );
      expect(r.texts.length === 0, 'texts with effects off ' + JSON.stringify(r.texts));
      return `chat ${JSON.stringify(r.chat)}; fxMax ${r.fxMax}`;
    } finally {
      await setEffects('On');
    }
  });

  await check('f', 'effect returns after Effects On again', async () => {
    const r = await attempt(normal, 'f');
    expect(r.fxMax > 0, 'no effect after re-enable');
    return `fxMax ${r.fxMax}`;
  });

  await check('z', '0 console errors', async () => {
    expect(errors.length === 0, errors.join(' | '));
    return '0';
  });
}

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  let code = 1;
  try {
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
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
    await runPhase(cdp, 'desktop', false, errors);
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await runPhase(cdp, 'phone', true, errors);
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}: ${r.ev}`);
    code = results.every((r) => r.ok) ? 0 : 1;
  } catch (e) {
    console.log('FATAL', e.stack);
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}: ${r.ev}`);
  } finally {
    await cdp.close().catch(() => {});
    killChild(vite);
    killTracked();
  }
  process.exit(code);
}
main();
