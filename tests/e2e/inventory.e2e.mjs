/* global fetch, console */
// QA slice: inventory actions (click/right-click/long-press menu, Drop, Examine, stacking, full 28).
// Own vite on E2E_PORT (default 5200). Run: node tests/e2e/inventory.e2e.mjs
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  launchChrome,
  sleep,
  spawnTracked,
  killChild,
  hardTimeout,
  waitFor,
  runMain,
} from './cdp.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5200);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
hardTimeout(6 * 60e3);
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

const H = `window.__q = {
  st: () => window.__idleRpg.store.getState(),
  ready: () => { try { return !!(window.__idleRpg && window.__idleRpg.scene() && window.__idleRpg.store.getState().game); } catch { return false; } },
  inv: () => window.__q.st().game.inventory.slots.map((s) => s && s.itemId + 'x' + s.quantity),
  seed: (items) => { const s = window.__q.st(); const slots = Array(28).fill(null); items.forEach((it, i) => { slots[i] = it; });
    window.__idleRpg.store.setState({ game: { ...s.game, inventory: { ...s.game.inventory, slots } } }); },
  chat: () => window.__q.st().game.chat.map((c) => c.text),
  rect: (sel, i = 0) => { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; },
  rectText: (sel, t) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === t); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; },
  menu: () => { const m = document.querySelector('.menu'); return m ? { title: m.querySelector('.menu-title').textContent, items: [...m.querySelectorAll('.menu-item')].map((b) => b.textContent) } : null; },
  slots: () => [...document.querySelectorAll('.slot')].map((b) => b.getAttribute('aria-label')),
};`;

async function main() {
  const t0 = Date.now();
  await startVite();
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: H });
  const Q = (e) => cdp.eval(`window.__q.${e}`);
  let phase = 'desktop';
  let touch = false;
  const check = async (id, title, fn) => {
    try {
      results.push({ phase, id, title, ok: true, ev: (await fn()) ?? '' });
    } catch (e) {
      let dbg = '';
      try {
        dbg =
          ' DBG ' +
          (await cdp.eval(
            `JSON.stringify([window.innerWidth, window.innerHeight, window.__q.rect('.slot',0), window.__q.rect('.slot-grid'), document.querySelectorAll('.slot').length, !!document.querySelector('.menu')])`,
          ));
      } catch {
        /* page gone */
      }
      results.push({ phase, id, title, ok: false, ev: e.message + dbg });
    }
  };
  const press = async (x, y, kind = 'tap') => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      if (kind === 'long') await sleep(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      const button = kind === 'long' ? 'right' : 'left';
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
    }
    await sleep(250);
  };
  const viewport = async (w, h, mobile) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile,
      maxTouchPoints: mobile ? 5 : 1,
    });
  };
  const load = async () => {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: ORIGIN.slice(0, -1),
      storageTypes: 'local_storage',
    });
    await cdp.send('Page.navigate', { url: ORIGIN + '?tickMs=60' });
    await waitFor(() => Q('ready()').catch(() => false), { timeoutMs: 25000, label: 'ready' });
    await sleep(800);
    const tab = await Q(`rectText('[role=tab]', 'Inventory')`);
    expect(tab, 'Inventory tab missing');
    // The Inventory tab is already open at boot; tapping the active tab collapses the panel.
    if (
      !(await cdp.eval(
        `document.querySelector('.slot-grid') && document.querySelector('.slot').getBoundingClientRect().width > 0`,
      ))
    )
      await press(tab.x, tab.y);
    await waitFor(() => cdp.eval('!!document.querySelector(".slot-grid")'), {
      timeoutMs: 4000,
      label: 'grid',
    });
  };
  const slotRect = async (i) => {
    await cdp.eval(`document.querySelectorAll('.slot')[${i}].scrollIntoView({block:'center'})`);
    await sleep(100);
    const r = await Q(`rect('.slot', ${i})`);
    expect(r, `slot ${i} missing`);
    return r;
  };
  const closeMenu = async () => {
    if (await Q('menu()')) {
      await press(5, 5);
    }
  };
  const pick = async (label) => {
    const r = await Q(`rectText('.menu-item', ${JSON.stringify(label)})`);
    expect(r, `menu item ${label} missing`);
    expect(r.h >= 44 - 0.5, `menu item ${label} tap height ${r.h} < 44`);
    await press(r.x, r.y);
  };

  const run = async () => {
    const open = (kind) => async () => {
      await cdp.eval(
        `window.__q.seed([{itemId:'logs',quantity:1},{itemId:'oak_logs',quantity:1},{itemId:'bronze_axe',quantity:1}])`,
      );
      await sleep(200);
      const r = await slotRect(0);
      await press(r.x, r.y, kind);
      const m = await Q('menu()');
      expect(m, `no menu after ${kind}`);
      expect(m.title === 'Logs', `title ${m.title}`);
      expect(m.items.join() === 'Drop,Examine,Cancel', `options ${m.items}`);
      const mr = await Q(`rect('.menu')`);
      const top = await cdp.eval(
        `document.elementFromPoint(${mr.x},${mr.y})?.closest('.menu') ? 'menu' : 'other'`,
      );
      expect(top === 'menu', 'menu not on top');
      expect(
        mr.x - mr.w / 2 >= 0 && mr.x + mr.w / 2 <= (await cdp.eval('innerWidth')),
        'menu off-screen',
      );
      return `menu "${m.title}": ${m.items.join('/')}`;
    };
    await check('click', 'tap/click item opens menu (its only "default"; no Use)', open('tap'));
    await closeMenu();
    await check(
      'context',
      touch ? 'long-press item opens menu' : 'right-click item opens menu',
      async () => {
        const ev = await open('long')();
        await closeMenu();
        return ev;
      },
    );
    await check('cancel', 'Cancel closes menu, inventory unchanged', async () => {
      const before = await Q('inv()');
      const r = await slotRect(0);
      await press(r.x, r.y);
      await pick('Cancel');
      expect(!(await Q('menu()')), 'menu still open');
      expect(JSON.stringify(await Q('inv()')) === JSON.stringify(before), 'inventory changed');
      return 'closed, inv same';
    });
    await check('examine', 'Examine posts examine text to chat, keeps item', async () => {
      const r = await slotRect(1);
      const n0 = (await Q('chat()')).length;
      await press(r.x, r.y);
      await pick('Examine');
      const chat = await Q('chat()');
      const want = await cdp.eval(
        `import('/src/app/registry.ts').then(m => m.CONTENT.items.get('oak_logs').examine)`,
      );
      expect(
        chat.length === n0 + 1 && chat.at(-1) === want,
        `chat ${JSON.stringify(chat.slice(-2))} want ${want}`,
      );
      const dom = await cdp.eval(
        `document.querySelector('.chatbox')?.innerText.includes(${JSON.stringify(want)})`,
      );
      expect(dom, 'examine text not visible in chatbox DOM');
      expect((await Q('inv()'))[1] === 'oak_logsx1', 'item removed by examine');
      return `chat: "${want}"`;
    });
    await check(
      'drop',
      'Drop removes item from inventory + chat line; no ground item (not implemented)',
      async () => {
        await cdp.eval(
          `window.__q.seed([{itemId:'logs',quantity:1},{itemId:'oak_logs',quantity:1},{itemId:'bronze_axe',quantity:1}])`,
        );
        await sleep(200);
        const r = await slotRect(1);
        await press(r.x, r.y);
        await pick('Drop');
        const inv = await Q('inv()');
        expect(
          inv[1] === null && inv[0] === 'logsx1' && inv[2] === 'bronze_axex1',
          `inv ${inv.slice(0, 4)}`,
        );
        expect(
          (await Q('chat()')).at(-1) === 'You drop the oak logs.',
          `chat ${(await Q('chat()')).at(-1)}`,
        );
        const label = (await Q('slots()'))[1];
        expect(label === 'Empty slot', `slot label ${label}`);
        return `slot1 -> empty, chat "You drop the oak logs."; other slots intact`;
      },
    );
    await check(
      'stack',
      'Logs do not stack: 5 logs = 5 slots, no qty badge (OSRS rule)',
      async () => {
        await cdp.eval(`window.__q.seed([1,2,3,4,5].map(()=>({itemId:'logs',quantity:1})))`);
        await sleep(200);
        const s = await Q('slots()');
        expect(
          s.slice(0, 5).every((l) => l === 'Logs') && s[5] === 'Empty slot',
          `labels ${s.slice(0, 6)}`,
        );
        expect(
          (await cdp.eval(`document.querySelectorAll('.slot-qty').length`)) === 0,
          'qty badge on non-stacked',
        );
        return `5 slots "Logs", 0 qty badges`;
      },
    );
    await check('badge', 'Quantity>1 shows badge + "x N" label (synthetic stack)', async () => {
      await cdp.eval(`window.__q.seed([{itemId:'logs',quantity:12}])`);
      await sleep(200);
      const l = (await Q('slots()'))[0];
      const q = await cdp.eval(`document.querySelector('.slot-qty')?.textContent`);
      expect(l === 'Logs x12' && q === '12', `label ${l} badge ${q}`);
      return `label "${l}", badge ${q}`;
    });
    await check(
      'full',
      '28/28 full state: all slots labelled, none empty, grid fits, drop frees a slot',
      async () => {
        await cdp.eval(`window.__q.seed(Array.from({length:28},()=>({itemId:'logs',quantity:1})))`);
        await sleep(200);
        const s = await Q('slots()');
        expect(s.length === 28 && s.every((l) => l === 'Logs'), `labels ${s.length}`);
        const last = await slotRect(27);
        expect(last.w >= 30, 'last slot tiny');
        await press(last.x, last.y);
        await pick('Drop');
        const inv = await Q('inv()');
        expect(
          inv[27] === null && inv.filter(Boolean).length === 27,
          `inv count ${inv.filter(Boolean).length}`,
        );
        return `28 slots rendered, slot size ${Math.round(last.w)}px, drop -> 27`;
      },
    );
    await check('tap', 'slot tap targets >= 44px', async () => {
      const r = await Q(`rect('.slot', 0)`);
      expect(r.w >= 44 && r.h >= 44, `slot ${r.w}x${r.h}`);
      return `${r.w.toFixed(0)}x${r.h.toFixed(0)}`;
    });
    await check('empty', 'empty slot is inert (no menu)', async () => {
      const r = await slotRect(27);
      await press(r.x, r.y);
      expect(!(await Q('menu()')), 'menu on empty slot');
      return 'no menu';
    });
    await check(
      'drag',
      'drag slot->slot swaps (swapSlots exists in core, no UI wired)',
      async () => {
        await cdp.eval(
          `window.__q.seed([{itemId:'logs',quantity:1},{itemId:'oak_logs',quantity:1}])`,
        );
        await sleep(200);
        const a = await slotRect(0);
        const b = await slotRect(1);
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: a.x, y: a.y }],
          });
          for (let i = 1; i <= 8; i++)
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }],
            });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: a.x,
            y: a.y,
            button: 'left',
            clickCount: 1,
          });
          for (let i = 1; i <= 8; i++)
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: a.x + ((b.x - a.x) * i) / 8,
              y: a.y + ((b.y - a.y) * i) / 8,
              button: 'left',
              buttons: 1,
            });
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: b.x,
            y: b.y,
            button: 'left',
            clickCount: 1,
          });
        }
        await sleep(250);
        await closeMenu();
        const inv = await Q('inv()');
        // Known gap: drag is not implemented (swapSlots is core-only). XFAIL keeps the run green; XPASS means it now exists.
        const swapped = inv[0] === 'oak_logsx1' && inv[1] === 'logsx1';
        expect(!swapped, 'XPASS: drag now swaps, turn this into a real check');
        return 'NOT IMPLEMENTED (XFAIL): no swap after drag, inv ' + inv.slice(0, 2);
      },
    );
  };

  try {
    await viewport(1280, 800, false);
    await load();
    await run();
    phase = 'phone';
    touch = true;
    await viewport(390, 844, true);
    await load();
    await run();
    results.push({
      phase: 'both',
      id: 'errors',
      title: '0 console errors',
      ok: errors.length === 0,
      ev: errors.slice(0, 3).join(' | ') || '0',
    });
  } finally {
    await cdp.close().catch(() => {});
  }
  console.log(`wall-clock ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  let fails = 0;
  for (const r of results) {
    if (!r.ok) fails++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id}: ${r.title} :: ${r.ev}`);
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  return fails ? 1 : 0;
}
runMain(main);
