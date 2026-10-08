// Phone collapse of the bottom sheet + chat (hudFold). Run: node tests/e2e/hudFold.e2e.mjs (ports 9413-9414, E2E_PORT
// overrides; fast base: parallel phone + desktop children, ?tickMs=60, wait-on-state instead of sleeps, budget 60 s).
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const PORT = 9413;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['phone', 'desktop'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const inset = (g) =>
  g.eval(
    `parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-bottom-inset'))||0`,
  );
const box = (g, sel) =>
  g.eval(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom }; })()`,
  );
const top = (g, x, y) =>
  g.eval(
    `(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName + '.' + (e.className?.baseVal ?? e.className) : null; })()`,
  );
const playerY = (g) =>
  g.eval(
    `(() => { const c = window.__idleRpg.scene().playerView.container; return window.__e.toClient(c.x, c.y).y; })()`,
  );
const hudTop = (g) => g.eval(`document.querySelector('.hud').getBoundingClientRect().top`);
const folded = (g) => g.eval(`document.querySelector('.hud').dataset.folded`);
const chatMin = (g) => g.eval(`document.querySelector('.chatbox')?.dataset.min`);
/** Wait for the sheet to reach `want` ('true'|'false') and its inset + top to stop moving (replaces a fixed 900 ms). */
async function foldSettled(g, want) {
  await g
    .waitFor(async () => (await folded(g)) === want, { label: `folded=${want}`, timeoutMs: 4000 })
    .catch(() => {}); // the caller's expect reports the state
  await waitStill(async () => ({ x: await inset(g), y: await hudTop(g) }), {
    intervalMs: 100,
    stable: 2,
  });
}
/** Wait for the chat to reach min=`want` (replaces a fixed 300 ms). */
const chatSettled = (g, want) =>
  g
    .waitFor(async () => (await chatMin(g)) === want, {
      label: `chat min=${want}`,
      timeoutMs: 4000,
    })
    .catch(() => {});
/** Camera has followed the new inset: camera still, then the drawn player still (replaces settle + 1200 ms). */
async function cameraSettled(g) {
  await g.settle();
  await waitStill(async () => ({ x: 0, y: await playerY(g) }), { intervalMs: 100, stable: 2 });
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const phone = vp === 'phone';
  if (phone) {
    await check('c1', 'phone fresh: collapsed, canvas hit-tests, tap walks', async () => {
      const hud = await g.eval(`document.querySelector('.hud').dataset.folded`);
      const chatMin = await g.eval(`document.querySelector('.chatbox')?.dataset.min`);
      const pts = { centre: [195, 420], bl: [30, 640], nearChat: null };
      const cb = await box(g, '.chat-toggle');
      pts.nearChat = [cb.x, cb.t - 20];
      const out = {};
      for (const [k, [x, y]] of Object.entries(pts)) out[k] = await top(g, x, y);
      const strip = await box(g, '.tabs');
      expect(hud === 'true' && chatMin === 'true', `folded=${hud} chatMin=${chatMin}`);
      for (const [k, v] of Object.entries(out))
        expect(v?.startsWith('CANVAS'), `${k} -> ${v} (tabs top ${strip.t})`);
      const p0 = await g.state('movement.position');
      let moved = false;
      for (const [dx, dy] of [
        [3, 3],
        [3, 0],
        [0, 3],
        [-3, 0],
        [0, -3],
      ]) {
        try {
          await g.tapTile(p0.x + dx, p0.y + dy);
          moved = true;
          break;
        } catch {
          /* next */
        }
      }
      expect(moved, 'no tappable tile');
      await g.waitFor(
        async () => {
          const p = await g.state('movement.position');
          return p.x !== p0.x || p.y !== p0.y;
        },
        { label: 'player moved' },
      );
      const p1 = await g.state('movement.position');
      return `hud folded, chat min; hits ${JSON.stringify(out)}; tile ${p0.x},${p0.y} -> ${p1.x},${p1.y}`;
    });
    await g.screenshot('hudfold-1-collapsed');

    await check('c2', 'expand/collapse sheet + chat, targets >=44px', async () => {
      const i0 = await inset(g);
      const tab = await box(g, '.tabs [role=tab]');
      const chev = await box(g, '.sheet-fold');
      expect(
        chev.w >= 44 && chev.h >= 44 && tab.h >= 44,
        `chev ${chev.w}x${chev.h} tab h ${tab.h}`,
      );
      await g.tap(tab.x, tab.y);
      await foldSettled(g, 'false');
      const i1 = await inset(g);
      const open = await g.eval(`document.querySelector('.hud').dataset.folded`);
      const slots = await g.eval(`document.querySelectorAll('.hud .slot').length`);
      await g.screenshot('hudfold-2-expanded');
      expect(open === 'false' && slots > 0, `folded=${open} slots=${slots}`);
      const c2 = await box(g, '.sheet-fold');
      await g.tap(c2.x, c2.y);
      await foldSettled(g, 'true');
      const i2 = await inset(g);
      expect(
        (await g.eval(`document.querySelector('.hud').dataset.folded`)) === 'true',
        'chevron did not collapse',
      );
      expect(i0 > 30 && i0 < 60 && i1 > 300 && i2 === i0, `inset ${i0}/${i1}/${i2}`);
      // chat
      const ct = await box(g, '.chat-toggle');
      expect(ct.w >= 44 && ct.h >= 44, `chat btn ${ct.w}x${ct.h}`);
      await g.tap(ct.x, ct.y);
      await chatSettled(g, 'false');
      const shown = await g.eval(`document.querySelector('.chatbox').dataset.min`);
      expect(shown === 'false', 'Chat button did not restore chat, min=' + shown);
      const ch = await box(g, '.chat-toggle');
      expect(ch.w >= 44 && ch.h >= 44, `chat chevron ${ch.w}x${ch.h}`);
      await g.screenshot('hudfold-3-chat-open');
      await g.tap(ch.x, ch.y);
      await chatSettled(g, 'true');
      expect(
        (await g.eval(`document.querySelector('.chatbox').dataset.min`)) === 'true',
        'chat chevron did not collapse',
      );
      return `inset ${i0} -> ${i1} -> ${i2}; slots ${slots}; chat toggles ok`;
    });

    await check('c3', 'inset tracks camera; player above HUD when expanded', async () => {
      const tab = await box(g, '.tabs [role=tab]');
      await g.tap(tab.x, tab.y);
      await foldSettled(g, 'false');
      await cameraSettled(g);
      const py = await playerY(g);
      const ht = await hudTop(g);
      const i1 = await inset(g);
      await g.screenshot('hudfold-4-player-expanded');
      const c = await box(g, '.sheet-fold');
      await g.tap(c.x, c.y);
      await foldSettled(g, 'true');
      await cameraSettled(g);
      const py2 = await playerY(g);
      const ht2 = await hudTop(g);
      expect(py < ht - 10, `expanded: player y ${py} hud top ${ht}`);
      expect(py2 < ht2 - 10, `collapsed: player y ${py2} hud top ${ht2}`);
      return `expanded player y ${py.toFixed(0)} < hud ${ht.toFixed(0)} (inset ${i1}); collapsed ${py2.toFixed(0)} < ${ht2.toFixed(0)}; player moved ${(py2 - py).toFixed(0)}px`;
    });

    await check('c4', 'unread dot on chop while chat collapsed; clears on open', async () => {
      expect(
        (await g.eval(`document.querySelector('.chatbox').dataset.min`)) === 'true',
        'chat not collapsed',
      );
      expect(!(await box(g, '.chat-dot')), 'dot present before chop');
      await g.setInventory(['bronze_axe']);
      const tree = await g.targetOfKind('tree');
      await g.teleportSettled(tree.x, tree.y + 2);
      await g.tapObject(tree.id);
      await g.waitFor(async () => !!(await box(g, '.chat-dot')), { label: 'unread dot' });
      await g.screenshot('hudfold-5-dot');
      const ct = await box(g, '.chat-toggle');
      await g.tap(ct.x, ct.y);
      await chatSettled(g, 'false');
      await g
        .waitFor(async () => !(await box(g, '.chat-dot')), {
          label: 'dot cleared',
          timeoutMs: 3000,
        })
        .catch(() => {});
      expect(!(await box(g, '.chat-dot')), 'dot still there after opening');
      return 'dot appeared after chop, cleared on open';
    });
  } else {
    await check('c5', 'desktop: no chevrons, chat+sheet shown, inset 0', async () => {
      const sf = await box(g, '.sheet-fold');
      const ct = await box(g, '.chat-toggle');
      const sfShown =
        sf &&
        sf.w > 0 &&
        (await g.eval(`getComputedStyle(document.querySelector('.sheet-fold')).display`)) !==
          'none';
      const ctShown =
        ct &&
        ct.w > 0 &&
        (await g.eval(`getComputedStyle(document.querySelector('.chat-toggle')).display`)) !==
          'none';
      const i = await inset(g);
      const slots = await g.eval(`document.querySelectorAll('.hud .slot').length`);
      const chat = await box(g, '.chatbox');
      await g.screenshot('hudfold-6-desktop');
      expect(!sfShown && !ctShown, `sheet-fold shown=${sfShown} chat-toggle shown=${ctShown}`);
      expect(
        i === 0 && slots > 0 && chat && chat.h > 20,
        `inset ${i} slots ${slots} chat ${JSON.stringify(chat)}`,
      );
      return `inset ${i}, slots ${slots}, chat h ${chat.h}`;
    });
  }
});
