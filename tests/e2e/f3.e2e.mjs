// F3+V2: log pile on the target tile while lighting, swapped for the fire on lit, gone on cancel; player off the flames on lit.
// Shots: tests/e2e/.shots-f3/. Run: node tests/e2e/f3.e2e.mjs (ports 9404-9405, E2E_PORT overrides; fast base: parallel
// desktop + phone children, ?tickMs=60 except the f3b cancel phase, budget 60 s).
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9404;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const START = { x: 18, y: 15 };
const fires = (g) => g.state('firemaking.fires');

/** Phone: the HUD sheet boots folded; open/close it with a real tap on the chevron. */
async function sheet(g, open) {
  if (!g.touch) return;
  const folded = await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`);
  if (folded === open) {
    await g.tapSelector('.sheet-fold');
    await g.waitFor(() => g.eval(`document.querySelector('.hud').dataset.folded === '${!open}'`), {
      label: `sheet ${open ? 'open' : 'folded'}`,
      timeoutMs: 4000,
    });
    if (open) await g.settleRect('[data-slot-index="0"]'); // unfold animation finished
  }
}

/** Open the context menu of an inventory slot with real input and tap the labelled option. */
async function menuPick(g, slot, label) {
  await sheet(g, true);
  const r = await g.rect(`[data-slot-index="${slot}"]`);
  if (g.touch)
    await g.eval(
      `document.querySelector('[data-slot-index="${slot}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${r.x}, clientY: ${r.y}, button: 2 }))`,
    );
  else await g.rightClick(r.x, r.y);
  await g
    .waitFor(() => g.eval(`!!document.querySelector('[role=menu] .menu-item')`), {
      label: 'context menu',
      timeoutMs: 3000,
    })
    .catch(() => {});
  const m = await g.eval(
    `(() => { const e = [...document.querySelectorAll('[role=menu] .menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, all: [...document.querySelectorAll('[role=menu] .menu-item')].map((x) => x.textContent.trim()) }; })()`,
  );
  g.expect(m, `menu option ${label} missing`);
  await g.tap(m.x, m.y);
  return m.all;
}
const reset = async (g, items) => {
  await g.update(
    '({ ...g, firemaking: { ...g.firemaking, fires: [], lighting: null }, chat: [] })',
  );
  await g.setInventory(items);
  await g.teleportSettled(START.x, START.y);
};
const waitLit = (g) =>
  g.waitFor(async () => (await fires(g)).length > 0, { label: 'fire appears', timeoutMs: 8000 });

process.env.SHOTS_DIR ??= new URL('./.shots-f3/', import.meta.url).pathname;
const FLAT = `const flat = (l) => l.flatMap((c) => c.list ? [c, ...flat(c.list)] : [c]);`;
const SCENE = `window.__idleRpg.scene().camera.scene`;
const count = (re) =>
  `(() => { ${FLAT} return flat(${SCENE}.children.list).filter((o) => o.texture && ${re}.test(o.texture.key) && o.visible).length; })()`;
const PILE = count('/^logpile_/');
const BASE = count('/^fire_base$/');

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await check(
    'f3a',
    'pile while lighting, swapped for the fire in one frame, player off the flames',
    async () => {
      await reset(g, ['tinderbox', { itemId: 'logs', quantity: 2 }]);
      await g.eval(
        `(() => { window.__fr = []; const sc = ${SCENE}; sc.events.on('postupdate', () => { ${FLAT} const a = flat(sc.children.list).filter((o) => o.texture && o.visible); window.__fr.push([a.filter((o) => /^logpile_/.test(o.texture.key)).length, a.filter((o) => o.texture.key === 'fire_base').length]); }); })()`,
      );
      const pos0 = await g.state('movement.position');
      await menuPick(g, 1, 'Light');
      await sheet(g, false);
      // The 3-tick light lasts 180 ms at 60 ms ticks, shorter than a scene poll under load: wait on the per-frame
      // recorder (every postupdate), which cannot miss the pile frames.
      await g.waitFor(async () => (await g.eval('window.__fr')).some(([p]) => p === 1), {
        label: 'pile shows (frame recorder)',
        timeoutMs: 4000,
      });
      await g.screenshot(`pile-${vp}`); // the light may already have caught by now: evidence only
      await waitLit(g);
      await g.screenshot(`lit-first-${vp}`);
      const posNow = await g.state('movement.position');
      g.expect(
        posNow.x !== pos0.x || posNow.y !== pos0.y,
        'player did not move off the fire tile at lit',
      );
      await g.waitIdle();
      await g.settle();
      await g.screenshot(`lit-aside-${vp}`);
      const fr = await g.eval('window.__fr');
      const both = fr.filter(([p, f]) => p > 0 && f > 0).length;
      const idx = fr.findIndex(([, f]) => f > 0);
      g.expect(
        idx > 0 && fr[idx - 1][0] === 1,
        `pile visible the frame before the fire (frames ${fr.length}, first fire frame ${idx})`,
      );
      g.expect(fr[idx][0] === 0, 'pile still drawn in the fire frame');
      const after = [await g.eval(PILE), await g.eval(BASE)];
      g.expect(
        after[0] === 0 && after[1] === 1,
        `after: want pile 0 fire 1, got pile ${after[0]} fire ${after[1]} (fires ${JSON.stringify(await fires(g))})`,
      );
      return `${vp}: pile->fire swap frame ${idx}, frames with both ${both}, player ${JSON.stringify(pos0)} -> ${JSON.stringify(posNow)}`;
    },
  );

  await check('f3b', 'cancel (walk away) removes the pile', async () => {
    await reset(g, ['tinderbox', { itemId: 'logs', quantity: 2 }]);
    // Real time for this phase only: lighting lasts LIGHT_TICKS = 3 ticks, which is 180 ms at 60 ms ticks, shorter than
    // a CDP round trip under load, so the cancel would race the fire. 600 ms ticks give a 1.8 s window to cancel in.
    await g.realTime(async () => {
      await menuPick(g, 1, 'Light');
      await sheet(g, false);
      await g.waitFor(async () => (await g.eval(PILE)) === 1, {
        label: 'pile shows',
        timeoutMs: 4000,
      });
      await g.update(
        `({ ...g, movement: { ...g.movement, path: [{ x: ${START.x + 1}, y: ${START.y} }] } })`,
      );
      await g.waitFor(async () => (await g.eval(PILE)) === 0, {
        label: 'pile gone',
        timeoutMs: 4000,
      });
    });
    g.expect((await fires(g)).length === 0, 'a fire appeared after cancel');
    await g.screenshot(`cancel-${vp}`);
    return `${vp}: pile removed, no fire`;
  });
});
