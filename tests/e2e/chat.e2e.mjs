/* global console */
// Chat scroll e2e: wheel/touch scrolls the chat (not the camera), no walking from chat gestures,
// auto-follow only while at the bottom, world taps still walk. Fast base: runParallel desktop + phone children,
// ?tickMs=60, wait-on-state/settle instead of fixed sleeps, budget 60 s. Real wheel/mouse/touch input over CDP.
// Run: node tests/e2e/chat.e2e.mjs   Exit 0 = all checks passed.
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const PORT = 9111; // C3 block 9101-9150 (children 9111, 9112)
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'], // DOM scroll + input routing test: nothing drawn is asserted
  budgetMs: BUDGET_MS,
});

const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const scene = () => H().scene();
  window.__t = {
    say: (n, tag) => { for (let i = 0; i < n; i++) H().store.getState().say(tag + ' ' + i); },
    pos: () => { const p = H().store.getState().game.movement.position; return { x: p.x, y: p.y }; },
    cam: () => { const c = scene().camera, v = c.worldView; return { x: v.x, y: v.y, w: v.width, zoom: c.zoom }; },
    // Fractional scroll: worldView is integer-rounded, so a 1 px step of the easing tail looks like "settled" there.
    scroll: () => { const c = scene().camera; return { x: c.scrollX, y: c.scrollY }; },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
    box: () => { const e = document.querySelector('[aria-label=Chat]'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { l: r.left, t: r.top, w: r.width, h: r.height, st: e.scrollTop, sh: e.scrollHeight, ch: e.clientHeight, pe: cs.pointerEvents, ta: cs.touchAction, ob: cs.overscrollBehaviorY }; },
    lastLine: () => { const p = document.querySelectorAll('[aria-label=Chat] p'); return p.length ? p[p.length - 1].textContent : null; },
    topEl: (x, y) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className : null; },
    setScroll: (v) => { document.querySelector('[aria-label=Chat]').scrollTop = v; },
  };
})()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g) => {
  await g.eval(PAGE);
  const T = (e) => g.eval(`window.__t.${e}`);
  const touch = g.touch;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const wheel = (x, y, dy) =>
    g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
  // Scroll position / camera stopped moving (replaces fixed 100-300 ms sleeps after a gesture).
  const scrollStill = () =>
    waitStill(async () => ({ x: (await T('box()')).st, y: (await T('box()')).sh }), {
      intervalMs: 60,
      stable: 2,
      max: 40,
    });
  const camStill = () =>
    // Settle on the FRACTIONAL scroll (eps 0.02 px, 3 stable reads). The phone camera glides ~20 px when the chat
    // strip opens (HUD inset change) and its last 1 px worldView step (282 -> 283) landed AFTER the baseline when
    // settle watched the integer worldView with eps 0.5 (evidence: no-drag control showed the same step, +19 ms).
    waitStill(() => T('scroll()'), { intervalMs: 80, stable: 3, max: 60, eps: 0.02 });
  const lastLineIs = (prefix) =>
    g.waitFor(async () => ((await T('lastLine()')) ?? '').startsWith(prefix), {
      timeoutMs: 4000,
      label: `line ${prefix}`,
    });

  // Phone: the chat strip boots minimized (data-min); open it with a real tap on its toggle.
  if (
    touch &&
    (await g.eval(`document.querySelector('[aria-label=Chat]').dataset.min === 'true'`))
  ) {
    const r = await g.eval(
      `(() => { const r = document.querySelector('.chat-toggle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await g.tap(r.x, r.y);
    await g.waitFor(
      () => g.eval(`document.querySelector('[aria-label=Chat]').dataset.min !== 'true'`),
      { timeoutMs: 4000, label: 'chat expanded' },
    );
  }
  await T("say(40, 'filler')");
  await lastLineIs('filler 39');
  await scrollStill();
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
      await camStill();
      const before = {
        box: await T('box()'),
        cam: await T('cam()'),
        pos: await T('pos()'),
        pw: await T('playerWorld()'),
      };
      if (touch)
        await g.drag(cx, cy - 10, cx, cy + 25, 12); // finger down = scroll up
      else {
        await wheel(cx, cy, -60);
        await wheel(cx, cy, -60);
      }
      await g
        .waitFor(async () => (await T('box()')).st < before.box.st, {
          timeoutMs: 2000,
          label: 'chat scrolled',
        })
        .catch(() => {});
      await scrollStill();
      await camStill(); // a wrongly routed gesture would have to finish moving the camera first
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
    await g
      .waitFor(async () => (await T('cam()')).zoom !== c0.zoom, {
        timeoutMs: 2000,
        label: 'zoom changed',
      })
      .catch(() => {});
    const c1 = await T('cam()');
    expect(c1.zoom !== c0.zoom, `wheel on world did not zoom (${c0.zoom})`);
    await wheel(500, 300, 300);
    await camStill();
    return `zoom ${c0.zoom} -> ${c1.zoom}`;
  });

  await check(
    '3',
    'scrolled up: new line keeps scrollTop; back at bottom: next line follows',
    async () => {
      await T('setScroll(0)');
      await scrollStill();
      const s0 = (await T('box()')).st;
      expect(s0 <= 1, `could not scroll to top st=${s0}`);
      await T("say(1, 'while-up')");
      await lastLineIs('while-up');
      await scrollStill(); // any (wrong) auto-follow scroll would land here
      const s1 = await T('box()');
      expect(s1.st === s0, `scrollTop jumped ${s0} -> ${s1.st} when line arrived`);
      expect((await T('lastLine()')).startsWith('while-up'), 'new line not rendered');
      // scroll back to bottom using real input
      if (touch) await g.drag(cx, cy + 20, cx, cy - 30, 12);
      for (let i = 0; i < 40 && (await T('box()')).st + s1.ch < s1.sh - 4; i++) {
        // Long finger travel (touch keeps targeting the chat after leaving it): ~300 px per drag, not ~20.
        if (touch) await g.drag(cx, cy + 25, cx, Math.max(5, cy - 300), 12);
        else await wheel(cx, cy, 120);
        await g.sleep(60);
      }
      await scrollStill();
      const s2 = await T('box()');
      expect(s2.st + s2.ch >= s2.sh - 4, `could not reach bottom st=${s2.st} sh=${s2.sh}`);
      await T("say(1, 'follow-me')");
      await lastLineIs('follow-me');
      await g
        .waitFor(
          async () => {
            const x = await T('box()');
            return x.st + x.ch >= x.sh - 4;
          },
          { timeoutMs: 2000, label: 'auto-follow' },
        )
        .catch(() => {});
      const s3 = await T('box()');
      expect(s3.st + s3.ch >= s3.sh - 4, `did not auto-follow st=${s3.st} sh=${s3.sh} ch=${s3.ch}`);
      expect((await T('lastLine()')).startsWith('follow-me'), 'follow line missing');
      return `held at ${s1.st}; bottom reached st=${s2.st}; followed to st=${s3.st} (sh ${s3.sh})`;
    },
  );

  await check('4', 'tap on the world outside the chat still walks the player', async () => {
    await camStill();
    const pw = await T('playerWorld()');
    const c = await g.eval(`window.__e.toClient(${pw.x}, ${pw.y})`);
    const bx = await T('box()');
    const tx = c.x + (touch ? 60 : 110);
    const ty = Math.min(c.y, bx.t - 60);
    expect(await T(`topEl(${tx},${ty})`).then((e) => e.startsWith('CANVAS')), 'target not canvas');
    const p0 = await T('pos()');
    await g.tap(tx, ty);
    await g.waitFor(async () => !same(await T('pos()'), p0), {
      timeoutMs: 6000,
      label: 'player moved',
    });
    return `pos ${JSON.stringify(p0)} -> ${JSON.stringify(await T('pos()'))}`;
  });

  await check('5', 'tap ON the chat strip does not walk (expected trade-off)', async () => {
    await g.waitIdle(); // the walk from check 4 is over (was a fixed 3 s sleep)
    const p0 = await T('pos()');
    await g.tap(cx, cy);
    // A routed tap would start a path within 1 tick; watch 10 ticks (old: 1.5 s = 2.5 real ticks).
    await g.waitTicks(10);
    const p1 = await T('pos()');
    const path = await g.state('movement.path.length');
    expect(
      same(p0, p1) && path === 0,
      `walked ${JSON.stringify(p0)} -> ${JSON.stringify(p1)} (path ${path})`,
    );
    return 'player stayed put';
  });
  console.log(`[chat] ${g.viewportName} done`);
});
