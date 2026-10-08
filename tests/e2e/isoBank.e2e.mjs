/* global fetch, console */
// QA slice: bank in isometric (booths + Bankers). Real pointer/touch input at screen positions
// computed from isoProjection.tileToWorld + the live camera. Port E2E_PORT or 5191 (never 5173).
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, killTracked, hardTimeout } from './cdp.mjs';

hardTimeout(6 * 60e3);
const PORT = Number(process.env.E2E_PORT || 5191);
const ORIGIN = `http://127.0.0.1:${PORT}/?tickMs=60`;
const ROOT = process.env.E2E_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS_DIR || '';
const results = [];
let profile = '';

async function check(id, title, fn) {
  try {
    const evidence = await fn();
    results.push({ id: `${profile}:${id}`, title, ok: true, evidence: evidence ?? '' });
  } catch (e) {
    results.push({ id: `${profile}:${id}`, title, ok: false, evidence: e.message });
  }
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

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
    { cwd: ROOT, stdio: 'ignore', detached: true },
  );
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return proc;
    } catch {
      /* not up */
    }
    await sleep(200);
  }
  killVite(proc);
  throw new Error('vite did not start');
}
function killVite(p) {
  try {
    process.kill(-p.pid, 'SIGKILL');
  } catch {
    p.kill('SIGKILL');
  }
}

const PAGE_HELPERS = `
(() => {
  const H = () => window.__idleRpg;
  const st = () => H().store.getState();
  window.__e2e = {
    ready: async () => { try { const h = H(); if (!h || !h.scene().camera) return false;
      if (!window.__iso) window.__iso = (await import('/src/render/projection.ts')).isoProjection;
      return true; } catch { return false; } },
    snap: () => { const g = st().game; return { pos: g.movement.position, pathLen: g.movement.path.length,
      inv: g.inventory.slots.map((s) => s && { id: s.itemId, n: s.quantity }), bank: g.bank.items, bankOpen: g.bankOpen,
      dialogue: !!st().dialogue }; },
    // world px -> client px: exact inverse of clientToWorld
    toClient: (wx, wy) => { const cam = H().scene().camera, cv = document.querySelector('canvas'), r = cv.getBoundingClientRect();
      const cx = (wx - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2, cy = (wy - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2;
      return { x: r.left + (cx * r.width) / cv.width, y: r.top + (cy * r.height) / cv.height }; },
    tileClient: (tx, ty, upPx) => { const w = window.__iso.tileToWorld(tx, ty); return window.__e2e.toClient(w.x, w.y - (upPx || 0)); },
    walkTo: (x, y) => st().walkTo({ x, y }),
    seed: (n) => { const g = st().game; const slots = g.inventory.slots.map((s) => s);
      let i = 0; for (let k = 0; k < slots.length && i < n; k++) if (!slots[k]) { slots[k] = { itemId: 'logs', quantity: 1 }; i++; }
      H().store.setState({ game: { ...g, inventory: { ...g.inventory, slots } } }); },
    track: () => { const seen = []; window.__seen = seen; H().store.subscribe((s) => { const p = s.game.movement.position; const l = seen[seen.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) seen.push({ x: p.x, y: p.y }); }); },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS'; },
  };
})();
`;

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const errors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        `exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`,
      );
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });

  const E = (x) => cdp.eval(`window.__e2e.${x}`);
  const dom = (js) => cdp.eval(`(() => { ${js} })()`);
  const exists = (sel) => dom(`return !!document.querySelector(${JSON.stringify(sel)});`);
  const waitFor = async (what, pred, ms, poll = 120) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(poll);
    }
  };
  const snap = async () => {
    await waitFor('ready', () => E('ready()').catch(() => false), 15000);
    return E('snap()');
  };
  const load = async () => {
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('ready', () => E('ready()').catch(() => false), 20000);
    await sleep(800);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(SHOTS, `${profile}-${name}.png`), Buffer.from(r.data, 'base64'));
  };
  const key = async (k, code, vk) => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: k,
        code,
        windowsVirtualKeyCode: vk,
        ...(k === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}),
      });
  };

  let touch = false;
  const tapAt = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          button: 'left',
          buttons: type === 'mousePressed' ? 1 : 0,
          clickCount: 1,
        });
    }
  };
  const menuAt = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'right',
        buttons: 2,
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'right',
        clickCount: 1,
      });
    }
  };
  // up = px above the tile's feet (booth sign top ~42, banker torso ~25)
  const tapTile = async (t, up = 0) => {
    const p = await E(`tileClient(${t.x}, ${t.y}, ${up})`);
    await tapAt(p.x, p.y);
    return p;
  };
  const settle = async () => {
    await waitFor('stop', async () => (await snap()).pathLen === 0, 30000);
    await sleep(900);
  };
  const clickBtn = (sel, re) =>
    dom(
      `const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find((e)=>new RegExp(${JSON.stringify(re)}).test(e.textContent||'')); if(!el) return false; el.click(); return true;`,
    );
  const realClickItem = async (re) => {
    const r = await dom(
      `const el=[...document.querySelectorAll('[role=menuitem]')].find((e)=>new RegExp(${JSON.stringify(re)}).test(e.textContent||'')); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};`,
    );
    expect(r, `no menu item ${re}`);
    await tapAt(r.x, r.y);
  };
  const menuLabels = () =>
    dom(`return [...document.querySelectorAll('[role=menuitem]')].map((b)=>b.textContent.trim());`);
  const dialogueText = () =>
    dom(`return document.querySelector('.dialogue-text')?.textContent ?? null;`);
  const choices = () =>
    dom(
      `return [...document.querySelectorAll('.dialogue-choice')].map((b)=>b.textContent.replace(/^\\d+/,'').trim());`,
    );
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const closeAll = async () => {
    await key('Escape', 'Escape', 27);
    await clickBtn('.bank-overlay button', 'Close');
    await sleep(200);
  };

  const BOOTH_UP = 14;
  const BANKER_UP = 22;
  const BOOTHS = [
    { x: 12, y: 9 },
    { x: 14, y: 9 },
  ];
  const BANKERS = [
    { x: 12, y: 8 },
    { x: 14, y: 8 },
  ];
  const profiles = [
    { name: 'desktop', w: 1280, h: 800, touch: false, dpr: 1 },
    { name: 'phone', w: 390, h: 844, touch: true, dpr: 3 },
  ];
  for (const p of profiles) {
    profile = p.name;
    touch = p.touch;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: p.w,
      height: p.h,
      deviceScaleFactor: p.dpr,
      mobile: p.touch,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: p.touch, maxTouchPoints: 5 });
    await load();
    await E('track()');
    await E('walkTo(13, 17)');
    await settle();

    await check(
      'door-in',
      'walk into bank via real taps: tap floor (13,12) from outside passes doorway (13,14)',
      async () => {
        await E('walkTo(13, 16)');
        await settle();
        const before = await dom('return window.__seen.length');
        await tapTile({ x: 13, y: 12 });
        await settle();
        const s = await snap();
        const seen = await dom(`return window.__seen.slice(${before})`);
        await shot('inside');
        expect(
          s.pos.x === 13 && s.pos.y === 12,
          `at ${JSON.stringify(s.pos)}, path ${JSON.stringify(seen)}`,
        );
        expect(
          seen.some((q) => q.x === 13 && q.y === 14),
          `never crossed doorway: ${JSON.stringify(seen)}`,
        );
        return `reached (13,12) via ${seen.map((q) => q.x + ',' + q.y).join(' ')}`;
      },
    );

    await check(
      'door-diag',
      'diagonal approach: tap (12,12) from (12,16), reach (16,11), tap out (13,16): no stuck tiles',
      async () => {
        await E('walkTo(12, 16)');
        await settle();
        await tapTile({ x: 12, y: 12 });
        await settle();
        let s = await snap();
        expect(s.pos.x === 12 && s.pos.y === 12, `in: at ${JSON.stringify(s.pos)}`);
        await E('walkTo(16, 11)');
        await settle();
        expect((await snap()).pos.x === 16, 'could not reach far corner (16,11)');
        await E('walkTo(13, 12)');
        await settle();
        // The follow camera eases after the walk; wait until the doorway's screen point is still
        // so the HUD/canvas hit-test below uses the final position, not a mid-ease one.
        let last = null;
        for (let i = 0; i < 20; i++) {
          const c = await E('tileClient(13, 14, 0)');
          if (last && Math.abs(c.x - last.x) < 1 && Math.abs(c.y - last.y) < 1) break;
          last = c;
          await sleep(200);
        }
        let op = null;
        const tried = [];
        for (const t of [
          { x: 13, y: 15 },
          { x: 12, y: 15 },
          { x: 14, y: 15 },
          { x: 13, y: 16 },
          { x: 12, y: 16 },
          { x: 14, y: 16 },
        ]) {
          const q = await E(`tileClient(${t.x}, ${t.y}, 0)`);
          const onTop =
            q.x > 0 &&
            q.y > 0 &&
            q.x < p.w &&
            q.y < p.h &&
            (await E(`topIsCanvas(${q.x}, ${q.y})`));
          tried.push(
            `${t.x},${t.y}@${Math.round(q.x)},${Math.round(q.y)}:${onTop ? 'ok' : 'covered'}`,
          );
          if (onTop) {
            op = { ...q, t };
            break;
          }
        }
        expect(op, `no canvas-visible exit tile (HUD covers all): ${tried.join(' ')}`);
        const before2 = await dom('return window.__seen.length');
        await tapAt(op.x, op.y);
        await settle();
        s = await snap();
        const seen2 = await dom(`return window.__seen.slice(${before2})`);
        expect(s.pos.x === op.t.x && s.pos.y === op.t.y, `out: at ${JSON.stringify(s.pos)}`);
        expect(
          seen2.some((q) => q.x === 13 && q.y === 14),
          `exit skipped doorway: ${JSON.stringify(seen2)}`,
        );
        return 'in (diag start) to (12,12), far corner (16,11) reachable, out via doorway ok';
      },
    );

    await check(
      'booth-menu',
      'long-press / right-click booth: Bank + Examine + Cancel',
      async () => {
        await E('walkTo(13, 12)');
        await settle();
        const pt = await E(`tileClient(12, 9, ${BOOTH_UP})`);
        await menuAt(pt.x, pt.y);
        await waitFor('menu', () => exists('[role=menu]'), 3000);
        const labels = await menuLabels();
        await shot('booth-menu');
        expect(
          labels.some((l) => /^Bank/.test(l)) &&
            labels.some((l) => /^Examine/.test(l)) &&
            labels.some((l) => /^Cancel/.test(l)),
          `menu: ${JSON.stringify(labels)}`,
        );
        await realClickItem('^Cancel');
        await sleep(300);
        expect(!(await exists('[role=menu]')), 'menu stayed open after Cancel');
        expect(!(await snap()).bankOpen, 'bank opened by Cancel');
        return JSON.stringify(labels);
      },
    );

    await check(
      'npc-menu',
      'long-press / right-click Banker: Talk-to + Bank + Examine + Cancel',
      async () => {
        await sleep(Number(process.env.PRE_SLEEP || 0));
        const probe = [];
        for (const up of [22, 8, 15, 30]) {
          const q = await E(`tileClient(12, 8, ${up})`);
          await menuAt(q.x, q.y);
          await sleep(400);
          probe.push(`${up}:${await exists('[role=menu]')}`);
          if (await exists('[role=menu]')) await realClickItem('^Cancel');
          await sleep(400);
        }
        console.log('probe', profile, probe.join(' '));
        await sleep(300);
        const pt = await E(`tileClient(12, 8, ${BANKER_UP})`);
        await menuAt(pt.x, pt.y);
        const top = await dom(
          `const e=document.elementFromPoint(${pt.x},${pt.y}); return e ? e.tagName+'.'+e.className : null`,
        );
        await waitFor('menu', () => exists('[role=menu]'), 3000).catch(async (e) => {
          throw new Error(
            `${e.message}; pt=${JSON.stringify(pt)} top=${top} cam=${await dom('const c=window.__idleRpg.scene().camera; return JSON.stringify({z:c.zoom,sx:c.scrollX,sy:c.scrollY,w:c.width,h:c.height})')} pos=${JSON.stringify((await snap()).pos)} menu=${await dom('return JSON.stringify(window.__idleRpg.store.getState().menu)')} inViewport=${pt.x >= 0 && pt.y >= 0 && pt.x <= p.w && pt.y <= p.h}`,
          );
        });
        const labels = await menuLabels();
        await shot('npc-menu');
        expect(
          labels.some((l) => /^Talk/.test(l)) &&
            labels.some((l) => /^Bank/.test(l)) &&
            labels.some((l) => /^Examine/.test(l)) &&
            labels.some((l) => /^Cancel/.test(l)),
          `menu: ${JSON.stringify(labels)}`,
        );
        await clickBtn('[role=menuitem]', '^Cancel');
        await sleep(200);
        return JSON.stringify(labels);
      },
    );

    for (const [id, title, tile, up, name] of [
      [
        'booth-menu-bank',
        'booth menu: pick Bank opens the bank panel',
        BOOTHS[0],
        BOOTH_UP,
        'booth',
      ],
      [
        'npc-menu-bank',
        'Banker menu: pick Bank opens the bank panel',
        BANKERS[0],
        BANKER_UP,
        'banker',
      ],
    ])
      await check(id, title, async () => {
        await closeAll();
        await E('walkTo(13, 12)');
        await settle();
        expect(!(await snap()).bankOpen, 'bank already open before pick');
        const pt = await E(`tileClient(${tile.x}, ${tile.y}, ${up})`);
        await menuAt(pt.x, pt.y);
        await waitFor('menu', () => exists('[role=menu]'), 3000);
        await realClickItem('^Bank');
        await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
        expect(await exists('.bank-overlay'), 'bank overlay not in DOM');
        await shot(`${name}-menu-bank`);
        const s = await snap();
        await closeAll();
        return `picked Bank from ${name} menu; player ${JSON.stringify(s.pos)}; bankOpen true`;
      });

    await check('booth-tap', 'tap booth: walks adjacent, bank panel opens', async () => {
      await E('walkTo(16, 12)');
      await settle();
      const p0 = (await snap()).pos;
      await tapTile(BOOTHS[0], BOOTH_UP);
      await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
      const s = await snap();
      await shot('bank-open');
      expect(
        dist(s.pos, BOOTHS[0]) === 1 && s.pos.y >= 9,
        `player ${JSON.stringify(s.pos)} not adjacent to booth (12,9)`,
      );
      expect(await exists('.bank-overlay'), 'bank overlay not in DOM');
      return `from ${JSON.stringify(p0)} to ${JSON.stringify(s.pos)}; bank open`;
    });

    await check('bank-ops', 'deposit-all then withdraw 1 log (+ withdraw all)', async () => {
      await E('seed(4)');
      await sleep(200);
      const before = await snap();
      const bank0 = before.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
      const inv0 = before.inv.filter((i) => i?.id === 'logs').length;
      expect(inv0 >= 4, `seed failed: ${inv0}`);
      expect(await clickBtn('.bank-overlay button', 'Deposit inventory'), 'no Deposit button');
      await sleep(300);
      const a = await snap();
      const bank1 = a.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
      expect(bank1 === bank0 + inv0, `bank logs ${bank0}+${inv0} -> ${bank1}`);
      const slot = () =>
        dom(
          `const s=document.querySelector('.bank-overlay .bank-grid button[aria-label^="Logs"]'); const r=s.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`,
        );
      let sp = await slot();
      await tapAt(sp.x, sp.y);
      await waitFor('withdraw menu', () => exists('[role=menu]'), 3000);
      await clickBtn('[role=menuitem]', '^Withdraw 1$');
      await sleep(300);
      const w1 = await snap();
      const invN = w1.inv.filter((i) => i?.id === 'logs').length;
      expect(invN === 1, `inv logs after withdraw 1 = ${invN}`);
      expect(
        (w1.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0) === bank1 - 1,
        'bank count wrong after withdraw 1',
      );
      sp = await slot();
      await tapAt(sp.x, sp.y);
      await waitFor('withdraw menu 2', () => exists('[role=menu]'), 3000);
      await clickBtn('[role=menuitem]', '^Withdraw all$');
      await sleep(300);
      const wa = await snap();
      expect(wa.inv.filter((i) => i?.id === 'logs').length === bank1, 'withdraw all count wrong');
      await clickBtn('.bank-overlay button', 'Deposit inventory');
      await sleep(200);
      return `bank ${bank0}->${bank1}; withdraw1 ok (inv 1, bank ${bank1 - 1}); withdraw all inv ${bank1}`;
    });

    await check(
      'npc-talk',
      'tap Banker: walks within reach, dialogue opens with banker lines',
      async () => {
        await closeAll();
        await E('walkTo(16, 12)');
        await settle();
        await tapTile(BANKERS[1], BANKER_UP);
        await waitFor('dialogue', () => exists('.dialogue'), 15000);
        const s = await snap();
        await shot('dialogue');
        const txt = await dialogueText();
        expect(/Welcome to Willowbrook Bank/.test(txt ?? ''), `text: ${txt}`);
        expect(
          dist(s.pos, BANKERS[1]) <= 2,
          `player ${JSON.stringify(s.pos)} not within reach of (14,8)`,
        );
        await key('Enter', 'Enter', 13);
        await waitFor('choices', async () => (await choices()).length === 3, 3000);
        const c = await choices();
        expect(c[0] === "I'd like to access my bank.", `choices ${JSON.stringify(c)}`);
        await clickBtn('.dialogue-choice', 'access my bank');
        await waitFor('bank open', async () => (await snap()).bankOpen, 5000);
        await closeAll();
        return `player ${JSON.stringify(s.pos)}; "${txt}"; choice 1 opened bank`;
      },
    );

    await check(
      'npc-talk-1',
      'tap first Banker (12,8) also opens dialogue (not the booth)',
      async () => {
        await closeAll();
        await E('walkTo(12, 12)');
        await settle();
        await tapTile(BANKERS[0], BANKER_UP);
        await waitFor('dialogue', () => exists('.dialogue'), 15000);
        await key('Escape', 'Escape', 27);
        await sleep(300);
        expect(!(await snap()).bankOpen, 'bank opened instead of dialogue');
        return 'ok';
      },
    );
  }

  const real = errors.filter((e) => !/favicon/.test(e));
  results.push({
    id: 'console',
    title: 'no console errors',
    ok: real.length === 0,
    evidence: real.length ? real.join(' | ') : '0 errors',
  });

  await cdp.close();
  killVite(vite);
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(22)} ${r.title}\n      ${String(r.evidence).slice(0, 600)}`,
    );
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  killTracked();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  killTracked();
  process.exit(2);
});
