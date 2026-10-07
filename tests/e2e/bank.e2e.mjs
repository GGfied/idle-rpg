/* global fetch, console */
// QA slice: Willowbrook Bank building, booths, Bankers and the banker dialogue, driven with real
// pointer/touch events over CDP at 1280x800 (mouse) and 390x844 (touch + long-press).
// Own dev server on 5182 (never 5173). Run: node tests/e2e/bank.e2e.mjs
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const PORT = 5182;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
  proc.kill();
  throw new Error('vite did not start');
}

const PAGE_HELPERS = `
(() => {
  let P;
  Object.defineProperty(window, 'Phaser', { configurable: true, get: () => P, set: (v) => {
    P = v; const Orig = v.Game;
    const W = function (...a) { const g = new Orig(...a); window.__phaserGame = g; return g; };
    W.prototype = Orig.prototype; v.Game = W; } });
  const scene = () => window.__phaserGame && window.__phaserGame.scene.getScene('world');
  const st = () => scene().deps.store.getState();
  window.__e2e = {
    ready: () => { try { const s = scene(); return !!(s && s.player && s.cam && s.deps.store); } catch { return false; } },
    snap: () => { const g = st().game; return { pos: g.movement.position, pathLen: g.movement.path.length,
      inv: g.inventory.slots.map((s) => s && { id: s.itemId, n: s.quantity }), bank: g.bank.items, bankOpen: g.bankOpen,
      dialogue: !!st().dialogue, chat: g.chat.map((c) => c.text) }; },
    toClient: (wx, wy) => { const s = scene(), cam = s.cameras.main, v = cam.worldView, cv = s.game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    walkTo: (x, y) => st().walkTo({ x, y }),
    seed: (n) => { const g = st().game; const slots = g.inventory.slots.map((s) => s);
      let i = 0; for (let k = 0; k < slots.length && i < n; k++) if (!slots[k]) { slots[k] = { itemId: 'logs', quantity: 1 }; i++; }
      scene().deps.store.setState({ game: { ...g, inventory: { ...g.inventory, slots } } }); },
    texts: () => { const out = []; const walk = (l) => l.forEach((o) => { if (o.type === 'Text' && o.visible) out.push(o.text); if (o.list) walk(o.list); });
      walk(scene().children.list); return out; },
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
  const world = async (wx, wy) => E(`toClient(${wx}, ${wy})`);
  const tapTile = async (t, dy = 0) => {
    const p = await world(t.x * 32 + 16, t.y * 32 + 16 + dy);
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

  const BOOTHS = [
    { x: 12, y: 9 },
    { x: 14, y: 9 },
  ];
  const BANKERS = [
    { x: 12, y: 8 },
    { x: 14, y: 8 },
  ];

  const profiles = [
    { name: 'desktop', w: 1280, h: 800, touch: false, dpr: 1.6 },
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
    await E(`walkTo(13, 17)`);
    await settle();

    await check(
      'render',
      'bank building renders (screenshot), Banker nameplates, door gap passable',
      async () => {
        await E(`walkTo(13, 15)`);
        await settle();
        await shot('outside');
        const texts = await E('texts()');
        const nameplates = texts.filter((t) => t === 'Banker').length;
        expect(
          nameplates === 2,
          `expected 2 "Banker" nameplates, got ${nameplates}; texts=${JSON.stringify(texts)}`,
        );
        return `2 Banker nameplates; screenshot ${SHOTS ? 'saved' : 'off'}`;
      },
    );

    await check(
      'door',
      'walk in through the door gap (13,14) with a real tap on the floor inside',
      async () => {
        const inside = { x: 13, y: 12 };
        await tapTile(inside);
        await settle();
        const s = await snap();
        expect(
          s.pos.x === 13 && s.pos.y === 12,
          `player at ${JSON.stringify(s.pos)}, wanted (13,12)`,
        );
        await shot('inside');
        return `now (13,12) after passing door (13,14)`;
      },
    );

    await check('minimap', 'minimap shows yellow NPC dots', async () => {
      const n = await dom(
        `const c=document.querySelector('.minimap'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4){ if(Math.abs(d[i]-255)<8&&Math.abs(d[i+1]-225)<8&&Math.abs(d[i+2]-53)<8&&d[i+3]>200) n++;} return n;`,
      );
      expect(n >= 8, `only ${n} yellow pixels`);
      return `${n} yellow pixels`;
    });

    await check(
      'booth-menu',
      'long-press / right-click a booth: Bank + Examine + Cancel',
      async () => {
        const pt = await world(BOOTHS[0].x * 32 + 16, BOOTHS[0].y * 32 + 16);
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
        await clickBtn('[role=menuitem]', '^Cancel');
        await sleep(200);
        expect(!(await exists('[role=menu]')), 'menu stayed open after Cancel');
        expect(!(await snap()).bankOpen, 'bank opened by Cancel');
        return JSON.stringify(labels);
      },
    );

    await check('booth-tap', 'tap booth 1: walks adjacent, opens bank', async () => {
      await E(`walkTo(13, 12)`);
      await settle();
      await tapTile(BOOTHS[0]);
      await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
      const s = await snap();
      await shot('bank-open');
      expect(dist(s.pos, BOOTHS[0]) <= 2, `player ${JSON.stringify(s.pos)} not near booth`);
      return `player ${JSON.stringify(s.pos)}, booth (12,9)`;
    });

    await check('bank-ops', 'deposit inventory / withdraw 1 / withdraw all counts', async () => {
      await E('seed(4)');
      await sleep(200);
      const before = await snap();
      const bankLogs0 = before.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
      const invLogs0 = before.inv.filter((i) => i?.id === 'logs').length;
      expect(invLogs0 >= 4, `seed failed: ${invLogs0} logs`);
      expect(await clickBtn('.bank-overlay button', 'Deposit inventory'), 'no Deposit button');
      await sleep(300);
      const a = await snap();
      const bankLogs1 = a.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
      expect(
        bankLogs1 === bankLogs0 + invLogs0,
        `bank logs ${bankLogs0}+${invLogs0} -> ${bankLogs1}`,
      );
      expect(
        a.inv.every((i) => !i || /_(axe|pickaxe)$/.test(i.id)),
        `deposit-all left non-tools: ${JSON.stringify(a.inv.filter(Boolean))}`,
      );
      // withdraw 1 via the bank slot menu (tap)
      const slot = async () =>
        dom(
          `const s=document.querySelector('.bank-overlay .bank-grid button[aria-label^="Logs"]'); const r=s.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`,
        );
      let sp = await slot();
      await tapAt(sp.x, sp.y);
      await waitFor('withdraw menu', () => exists('[role=menu]'), 3000);
      const lab = await menuLabels();
      expect(
        lab.includes('Withdraw 1') && lab.includes('Withdraw all'),
        `slot menu ${JSON.stringify(lab)}`,
      );
      await clickBtn('[role=menuitem]', '^Withdraw 1$');
      await sleep(300);
      const w1 = await snap();
      expect(
        w1.inv.filter((i) => i?.id === 'logs').length === 1,
        `after withdraw 1 inv logs=${w1.inv.filter((i) => i?.id === 'logs').length}`,
      );
      expect(
        (w1.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0) === bankLogs1 - 1,
        'bank count after withdraw 1 wrong',
      );
      sp = await slot();
      await tapAt(sp.x, sp.y);
      await waitFor('withdraw menu 2', () => exists('[role=menu]'), 3000);
      await clickBtn('[role=menuitem]', '^Withdraw all$');
      await sleep(300);
      const wa = await snap();
      const invN = wa.inv.filter((i) => i?.id === 'logs').length;
      expect(invN === bankLogs1, `after withdraw all inv logs ${invN}, expected ${bankLogs1}`);
      expect(!wa.bank.some((b) => b.itemId === 'logs'), 'logs remain in bank after withdraw all');
      // deposit again so the persistence check has something to see
      await clickBtn('.bank-overlay button', 'Deposit inventory');
      await sleep(300);
      return `bank logs ${bankLogs1}; wd1 ok; wd-all ok (inv ${invN}); redeposited`;
    });

    await check('walk-away', 'walking away closes the bank', async () => {
      // the overlay may cover the canvas on phone; close-by-walking is a ground tap, so use a tap on a visible tile
      await clickBtn('.bank-overlay button', 'Close');
      await sleep(200);
      await E(`walkTo(13, 12)`);
      await settle();
      await tapTile(BOOTHS[0]);
      await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
      await sleep(300);
      const pt = await world(13 * 32 + 16, 12 * 32 + 16);
      const topCanvas = await E(`topIsCanvas(${pt.x}, ${pt.y})`);
      if (topCanvas) {
        await tapAt(pt.x, pt.y);
      } else {
        // bank overlay covers the canvas: use the walk shortcut (user-equivalent movement) instead
        await E(`walkTo(13, 13)`);
      }
      await waitFor('walked', async () => (await snap()).pathLen === 0, 10000);
      await sleep(400);
      const s = await snap();
      const note = topCanvas ? 'ground tap' : 'walkTo shortcut (overlay covers canvas)';
      expect(
        !s.bankOpen,
        `bank still open after walking away (${note}); pos ${JSON.stringify(s.pos)}`,
      );
      return `closed via ${note}`;
    });

    await check('counter', 'cannot walk behind the counter (alcoves and booth tiles)', async () => {
      const bad = [];
      for (const t of [...BANKERS, ...BOOTHS, { x: 13, y: 8 }, { x: 13, y: 9 }]) {
        await E(`walkTo(13, 12)`);
        await settle();
        await E(`walkTo(${t.x}, ${t.y})`);
        await sleep(2500);
        const s = await snap();
        if (
          s.pos.y < 9 ||
          (s.pos.x === t.x && s.pos.y === t.y && (t.y === 9 || t.y === 8) && t.x !== 13)
        )
          bad.push(`(${t.x},${t.y}) -> ${JSON.stringify(s.pos)}`);
        // also: tap-walk behind the counter, real input
        await settle().catch(() => undefined);
      }
      // real tap on the banker's alcove tile is a Talk-to, so tap the wall tile behind (12,7) instead
      await E(`walkTo(13, 12)`);
      await settle();
      await tapTile({ x: 12, y: 7 });
      await sleep(3000);
      const s = await snap();
      if (s.pos.y < 9) bad.push(`tap (12,7) -> ${JSON.stringify(s.pos)}`);
      expect(bad.length === 0, `reached behind counter: ${bad.join('; ')}`);
      await closeAll();
      return 'never reached y<9 or booth/alcove tiles';
    });

    await check(
      'talk',
      'Talk-to banker (tap) walks within reach and opens the dialogue',
      async () => {
        await E(`walkTo(16, 12)`);
        await settle();
        await closeAll();
        await tapTile(BANKERS[0], -6);
        await waitFor('dialogue', () => exists('.dialogue'), 15000);
        const s = await snap();
        await shot('dialogue');
        const txt = await dialogueText();
        expect(/Good day! Welcome to Willowbrook Bank/.test(txt ?? ''), `text: ${txt}`);
        expect(
          dist(s.pos, BANKERS[0]) <= 2,
          `player ${JSON.stringify(s.pos)} not within reach of banker`,
        );
        return `player ${JSON.stringify(s.pos)}; "${txt}"`;
      },
    );

    await check(
      'flow',
      'Enter / tap continue; choice 2 answers and returns; choice 1 opens bank',
      async () => {
        await key('Enter', 'Enter', 13);
        await waitFor('choices', async () => (await choices()).length === 3, 3000);
        const c = await choices();
        expect(
          c[0] === "I'd like to access my bank." &&
            c[1] === 'What is this place?' &&
            c[2] === 'Nothing, thanks.',
          `choices ${JSON.stringify(c)}`,
        );
        await shot('choices');
        await clickBtn('.dialogue-choice', 'What is this place');
        await waitFor(
          'about text',
          async () => /keep your things safe/.test((await dialogueText()) ?? ''),
          3000,
        );
        // continue by tap
        await dom(`document.querySelector('.dialogue-main')?.click();`);
        await waitFor('choices again', async () => (await choices()).length === 3, 3000);
        await clickBtn('.dialogue-choice', 'access my bank');
        await waitFor('bank open', async () => (await snap()).bankOpen, 5000);
        expect(!(await exists('.dialogue')), 'dialogue still open after opening bank');
        await clickBtn('.bank-overlay button', 'Close');
        return 'greeting -> Enter -> choices ok; about -> tap -> back; choice 1 opened bank, dialogue closed';
      },
    );

    await check(
      'close-nothing',
      '"Nothing, thanks" closes; Escape closes; ground click closes',
      async () => {
        const open = async () => {
          await tapTile(BANKERS[0], -6);
          await waitFor('dialogue', () => exists('.dialogue'), 15000);
          await dom(`document.querySelector('.dialogue-main')?.click();`);
          await waitFor('choices', async () => (await choices()).length === 3, 3000);
        };
        await sleep(300);
        await open();
        await clickBtn('.dialogue-choice', 'Nothing, thanks');
        await sleep(300);
        expect(!(await exists('.dialogue')), '"Nothing, thanks" did not close');
        await open();
        await key('Escape', 'Escape', 27);
        await sleep(300);
        expect(!(await exists('.dialogue')), 'Escape did not close');
        await open();
        const pt = await world(16 * 32 + 16, 12 * 32 + 16);
        const topCanvas = await E(`topIsCanvas(${pt.x}, ${pt.y})`);
        let note = 'ground tap';
        if (topCanvas) await tapAt(pt.x, pt.y);
        else {
          // find any canvas-visible tile (dialogue box covers part of the screen on phones)
          let found = null;
          for (let ty = 8; ty <= 14 && !found; ty++)
            for (let tx = 10; tx <= 16 && !found; tx++) {
              const q = await world(tx * 32 + 16, ty * 32 + 16);
              if (q.x > 0 && q.y > 0 && (await E(`topIsCanvas(${q.x}, ${q.y})`)))
                found = { q, tx, ty };
            }
          expect(found, 'no visible ground tile to tap while the dialogue is open');
          note = `ground tap at (${found.tx},${found.ty})`;
          await tapAt(found.q.x, found.q.y);
        }
        await sleep(500);
        const still = await exists('.dialogue');
        expect(!still, `dialogue stayed open after ${note}`);
        return `all three closed it (${note})`;
      },
    );

    await check(
      'banker2',
      'second Banker (booth 2) opens the dialogue and booth 2 opens bank',
      async () => {
        await settle();
        await E(`walkTo(14, 12)`);
        await settle();
        await tapTile(BANKERS[1], -6);
        await waitFor('dialogue', () => exists('.dialogue'), 15000);
        await key('Escape', 'Escape', 27);
        await sleep(300);
        await tapTile(BOOTHS[1]);
        await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
        await clickBtn('.bank-overlay button', 'Close');
        return 'ok';
      },
    );

    await check('persist', 'bank contents persist across reload', async () => {
      await closeAll();
      const before = await snap();
      expect(before.bank.length > 0, 'bank empty before reload; nothing to verify');
      await sleep(1600);
      await load();
      const after = await snap();
      expect(
        JSON.stringify(after.bank) === JSON.stringify(before.bank),
        `bank ${JSON.stringify(before.bank)} -> ${JSON.stringify(after.bank)}`,
      );
      return JSON.stringify(after.bank);
    });
  }

  const real = errors.filter((e) => !/favicon/.test(e));
  results.push({
    id: 'console',
    title: 'no console errors',
    ok: real.length === 0,
    evidence: real.length ? real.join(' | ') : '0 errors',
  });

  await cdp.close();
  vite.kill();
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(22)} ${r.title}\n      ${String(r.evidence).slice(0, 600)}`,
    );
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
