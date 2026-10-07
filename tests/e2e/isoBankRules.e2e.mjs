/* global fetch, console */
// QA slice: bank RULES in isometric (walk-away closes, persistence, counter unreachable). Real pointer/touch input at screen positions
// computed from isoProjection.tileToWorld + the live camera. Port E2E_PORT or 5202 (never 5173).
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, killTracked, hardTimeout } from './cdp.mjs';

hardTimeout(6 * 60e3);
const PORT = Number(process.env.E2E_PORT || 5202);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const realClickItem = async (re) => {
    const r = await dom(
      `const el=[...document.querySelectorAll('[role=menuitem]')].find((e)=>new RegExp(${JSON.stringify(re)}).test(e.textContent||'')); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};`,
    );
    expect(r, `no menu item ${re}`);
    await tapAt(r.x, r.y);
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const menuLabels = () =>
    dom(`return [...document.querySelectorAll('[role=menuitem]')].map((b)=>b.textContent.trim());`);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dialogueText = () =>
    dom(`return document.querySelector('.dialogue-text')?.textContent ?? null;`);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const FORBID = [
    [12, 9],
    [14, 9],
    [12, 8],
    [14, 8],
    [13, 8],
    [11, 8],
    [15, 8],
    [12, 7],
    [13, 7],
    [14, 7],
  ];
  const bad = (q) =>
    FORBID.some(([x, y]) => q.x === x && q.y === y) || (q.y < 9 && q.x >= 9 && q.x <= 17);
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
    await dom(`localStorage.clear()`).catch(() => {});
    await load();
    await E('track()');
    await E('walkTo(16, 12)');
    await settle();

    let bankAfterDeposit = null;
    await check(
      'walk-away',
      'bank open, tap ground away from booth: player walks away, bank panel closes',
      async () => {
        await tapTile({ x: 12, y: 9 }, BOOTH_UP);
        await waitFor('bank open', async () => (await snap()).bankOpen, 15000);
        await settle();
        const s0 = await snap();
        expect(await exists('.bank-overlay'), 'overlay missing');
        expect(dist(s0.pos, { x: 12, y: 9 }) === 1, `not adjacent: ${JSON.stringify(s0.pos)}`);
        // deposit first (logs) so persistence check has content
        await E('seed(5)');
        await sleep(200);
        expect(await clickBtn('.bank-overlay button', 'Deposit inventory'), 'no deposit button');
        await sleep(300);
        bankAfterDeposit = (await snap()).bank;
        const logs = bankAfterDeposit.find((b) => b.itemId === 'logs')?.quantity ?? 0;
        expect(logs >= 5, `deposit logged ${logs}`);
        let op = null;
        const cands = [
          { x: 16, y: 12 },
          { x: 15, y: 13 },
          { x: 16, y: 11 },
          { x: 13, y: 13 },
          { x: 13, y: 15 },
          { x: 13, y: 16 },
          { x: 18, y: 15 },
        ];
        for (let y = 9; y <= 22; y++)
          for (let x = 6; x <= 26; x++)
            if (x === 18 || (y > 14 && x > 10 && x < 20) || (y <= 14 && x >= 10 && x <= 16))
              cands.push({ x, y });
        for (const t of cands) {
          if (dist(t, s0.pos) < 3) continue;
          const q = await E(`tileClient(${t.x}, ${t.y}, 0)`);
          if (
            q.x > 0 &&
            q.y > 0 &&
            q.x < p.w &&
            q.y < p.h &&
            (await E(`topIsCanvas(${q.x}, ${q.y})`))
          ) {
            op = { ...q, t };
            break;
          }
        }
        expect(op, 'no canvas-visible ground tile while bank open (overlay covers all)');
        await shot('before-away');
        await tapAt(op.x, op.y);
        await waitFor('bank closed', async () => !(await snap()).bankOpen, 5000);
        const closedEarly = await snap();
        await settle();
        const s1 = await snap();
        await shot('after-away');
        expect(!(await exists('.bank-overlay')), 'overlay still in DOM');
        expect(
          dist(s1.pos, s0.pos) >= 3,
          `moved only ${dist(s1.pos, s0.pos)}: ${JSON.stringify(s0.pos)} -> ${JSON.stringify(s1.pos)}`,
        );
        return `deposit logs ${logs}; tapped ${JSON.stringify(op.t)}; closed while at ${JSON.stringify(closedEarly.pos)}; ${JSON.stringify(s0.pos)} -> ${JSON.stringify(s1.pos)}`;
      },
    );

    await check('persist', 'reload: bank contents identical', async () => {
      const before = JSON.stringify((await snap()).bank);
      expect(JSON.stringify(bankAfterDeposit) === before, 'bank changed without action');
      await sleep(3500);
      await load();
      const after = JSON.stringify((await snap()).bank);
      expect(after === before, `bank before ${before} after ${after}`);
      return `bank identical (${before.length} bytes): ${before.slice(0, 120)}`;
    });

    await check(
      'counter-blocked',
      'tap staff tiles / booths / wall behind counter: player never enters them',
      async () => {
        await E('track()');
        await E('walkTo(13, 11)');
        await settle();
        await closeAll();
        const log = [];
        const targets = [
          [12, 8, 0],
          [14, 8, 0],
          [12, 8, 22],
          [13, 8, 0],
          [12, 9, 0],
          [14, 9, 0],
          [13, 7, 0],
          [11, 8, 0],
        ];
        for (const [x, y, up] of targets) {
          await E('walkTo(13, 11)');
          await settle();
          await closeAll();
          await E('track()');
          const q = await E(`tileClient(${x}, ${y}, ${up})`);
          if (!(
            q.x > 0 &&
            q.y > 0 &&
            q.x < p.w &&
            q.y < p.h &&
            (await E(`topIsCanvas(${q.x}, ${q.y})`))
          )) {
            log.push(`${x},${y},${up}:offscreen/HUD`);
            continue;
          }
          await tapAt(q.x, q.y);
          await sleep(400);
          await settle();
          const seen = await dom('return window.__seen');
          const s = await snap();
          if (await exists('.dialogue')) await key('Escape', 'Escape', 27);
          await closeAll();
          const visited = seen.filter(bad);
          log.push(
            `${x},${y},${up}->end ${s.pos.x},${s.pos.y} visited ${seen.map((z) => z.x + ',' + z.y).join('>')}`,
          );
          expect(
            visited.length === 0 && !bad(s.pos),
            `entered forbidden: ${JSON.stringify(visited)} end ${JSON.stringify(s.pos)} (tap ${x},${y})`,
          );
          expect(s.pos.y >= 9, `end not on public side: ${JSON.stringify(s.pos)}`);
        }
        const tapped = log.filter((l) => !/offscreen/.test(l)).length;
        expect(tapped >= 4, `only ${tapped} targets tappable: ${log.join(' | ')}`);
        return log.join(' | ');
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
