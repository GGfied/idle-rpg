/* global fetch, console */
// Chat scroll e2e: wheel/touch scrolls the chat (not the camera), no walking from chat gestures,
// auto-follow only while at the bottom, world taps still walk. Own vite on :5182 (never 5173),
// fresh headless Chrome profile, real wheel/mouse/touch input over CDP.
// Run: node tests/e2e/chat.e2e.mjs   Exit 0 = all checks passed.
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

setTimeout(() => {
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();

const PORT = 5182;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    say: (n, tag) => { for (let i = 0; i < n; i++) H().store.getState().say(tag + ' ' + i); },
    pos: () => { const p = H().store.getState().game.movement.position; return { x: p.x, y: p.y }; },
    cam: () => { const c = scene().camera, v = c.worldView; return { x: v.x, y: v.y, w: v.width, zoom: c.zoom }; },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = cam.scene.game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    box: () => { const e = document.querySelector('[aria-label=Chat]'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { l: r.left, t: r.top, w: r.width, h: r.height, st: e.scrollTop, sh: e.scrollHeight, ch: e.clientHeight, pe: cs.pointerEvents, ta: cs.touchAction, ob: cs.overscrollBehaviorY }; },
    lastLine: () => { const p = document.querySelectorAll('[aria-label=Chat] p'); return p.length ? p[p.length - 1].textContent : null; },
    topEl: (x, y) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className : null; },
    setScroll: (v) => { document.querySelector('[aria-label=Chat]').scrollTop = v; },
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
  try {
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
      }
    };
    const wheel = (x, y, dy) =>
      cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
    const tap = async (x, y) => {
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased'])
          await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
      await sleep(150);
    };
    const touchDrag = async (x0, y0, x1, y1) => {
      const n = 12;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: x0, y: y0 }],
      });
      for (let i = 1; i <= n; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }],
        });
        await sleep(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(200);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    const run = async () => {
      await cdp.send('Page.navigate', { url: ORIGIN });
      await waitFor('game ready', () => T('ready()'));
      await sleep(800);
      await T("say(40, 'filler')");
      await sleep(300);
      const b = await T('box()');
      const cx = b.l + b.w / 2;
      const cy = b.t + b.h / 2;

      await check('0', 'chat overflows and is at the bottom; CSS applied', async () => {
        const x = await T('box()');
        expect(x.sh > x.ch + 20, `no overflow sh=${x.sh} ch=${x.ch}`);
        expect(x.st + x.ch >= x.sh - 4, `not at bottom st=${x.st}`);
        expect(x.pe === 'auto', `pointer-events ${x.pe}`);
        expect(x.ta === 'pan-y', `touch-action ${x.ta}`);
        expect(x.ob === 'contain', `overscroll ${x.ob}`);
        const top = await T(`topEl(${cx}, ${cy})`);
        expect(top.includes('chatbox') || top.startsWith('P.'), `element at chat centre: ${top}`);
        return `sh=${x.sh} ch=${x.ch} st=${x.st} pe=${x.pe} ta=${x.ta} ob=${x.ob}`;
      });

      await check(
        '1',
        touch
          ? 'touch drag over chat scrolls it, camera/player unchanged'
          : 'wheel over chat scrolls it, camera/player unchanged',
        async () => {
          const before = {
            box: await T('box()'),
            cam: await T('cam()'),
            pos: await T('pos()'),
            pw: await T('playerWorld()'),
          };
          if (touch)
            await touchDrag(cx, cy - 10, cx, cy + 25); // finger down = scroll up
          else {
            await wheel(cx, cy, -60);
            await sleep(100);
            await wheel(cx, cy, -60);
            await sleep(300);
          }
          const after = {
            box: await T('box()'),
            cam: await T('cam()'),
            pos: await T('pos()'),
            pw: await T('playerWorld()'),
          };
          expect(after.box.st < before.box.st, `scrollTop ${before.box.st} -> ${after.box.st}`);
          expect(
            same(before.cam, after.cam),
            `camera moved/zoomed ${JSON.stringify(before.cam)} -> ${JSON.stringify(after.cam)}`,
          );
          expect(same(before.pos, after.pos) && same(before.pw, after.pw), 'player moved');
          return `scrollTop ${before.box.st} -> ${after.box.st}; cam zoom ${after.cam.zoom} unchanged`;
        },
      );

      await check('1b', 'wheel/drag over the WORLD still zooms or pans (control)', async () => {
        if (touch) return 'skipped on touch (pinch needs two fingers)';
        const c0 = await T('cam()');
        await wheel(500, 300, -300);
        await sleep(300);
        const c1 = await T('cam()');
        expect(c1.zoom !== c0.zoom, `wheel on world did not zoom (${c0.zoom})`);
        await wheel(500, 300, 300);
        await sleep(300);
        return `zoom ${c0.zoom} -> ${c1.zoom}`;
      });

      await check(
        '3',
        'scrolled up: new line keeps scrollTop; back at bottom: next line follows',
        async () => {
          await T('setScroll(0)');
          await sleep(150);
          const s0 = (await T('box()')).st;
          expect(s0 <= 1, `could not scroll to top st=${s0}`);
          await T("say(1, 'while-up')");
          await sleep(300);
          const s1 = await T('box()');
          expect(s1.st === s0, `scrollTop jumped ${s0} -> ${s1.st} when line arrived`);
          expect((await T('lastLine()')).startsWith('while-up'), 'new line not rendered');
          // scroll back to bottom using real input
          if (touch) await touchDrag(cx, cy + 20, cx, cy - 30);
          for (let i = 0; i < 40 && (await T('box()')).st + s1.ch < s1.sh - 4; i++) {
            if (touch) await touchDrag(cx, cy + 25, cx, cy - 30);
            else await wheel(cx, cy, 120);
            await sleep(60);
          }
          const s2 = await T('box()');
          expect(s2.st + s2.ch >= s2.sh - 4, `could not reach bottom st=${s2.st} sh=${s2.sh}`);
          await T("say(1, 'follow-me')");
          await sleep(300);
          const s3 = await T('box()');
          expect(
            s3.st + s3.ch >= s3.sh - 4,
            `did not auto-follow st=${s3.st} sh=${s3.sh} ch=${s3.ch}`,
          );
          expect((await T('lastLine()')).startsWith('follow-me'), 'follow line missing');
          return `held at ${s1.st}; bottom reached st=${s2.st}; followed to st=${s3.st} (sh ${s3.sh})`;
        },
      );

      await check('4', 'tap on the world outside the chat still walks the player', async () => {
        const pw = await T('playerWorld()');
        const c = await T(`toClient(${pw.x}, ${pw.y})`);
        const bx = await T('box()');
        const tx = c.x + (touch ? 60 : 110);
        const ty = Math.min(c.y, bx.t - 60);
        expect(
          await cdp.eval(`window.__t.topEl(${tx},${ty})`).then((e) => e.startsWith('CANVAS')),
          'target not canvas',
        );
        const p0 = await T('pos()');
        await tap(tx, ty);
        await waitFor('player moved', async () => !same(await T('pos()'), p0), 6000);
        return `pos ${JSON.stringify(p0)} -> ${JSON.stringify(await T('pos()'))}`;
      });

      await check('5', 'tap ON the chat strip does not walk (expected trade-off)', async () => {
        await sleep(3000);
        const p0 = await T('pos()');
        await tap(cx, cy);
        await sleep(1500);
        const p1 = await T('pos()');
        expect(same(p0, p1), `walked ${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
        return 'player stayed put';
      });
    };

    await run();
    phase = 'phone';
    touch = true;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.eval('localStorage.clear()');
    await run();

    await check('E', 'no console errors', async () => {
      expect(errors.length === 0, errors.join(' | '));
    });
  } finally {
    await cdp.close();
    killChild(vite);
  }
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}: ${r.ev}`);
  }
  killTracked();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  killTracked();
  process.exit(1);
});
