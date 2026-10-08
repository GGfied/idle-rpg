// QA slice "light a fire": tinderbox in starter kit, Light menu / use-on, step aside, errors, burn time by log, ashes.
// Fast base: runParallel desktop + phone, withCombos, 60 ms ticks, budget 60 s. webgl only: every check reads store
// state, chat and HUD DOM; nothing drawn is asserted (fire art lives in fireVisuals/fireArt). Durations are measured in
// GAME TICKS by an in-page store recorder (exact at any tick speed) instead of wall-clock ms at 600 ms ticks: t2's
// "~3 ticks" and t5's burn times. t5 runs at 30 ms ticks (hook minimum) because only the tick COUNT is asserted.
// The one justified realTime: t4c must tap a tile INSIDE the 3-tick lighting window (180 ms at 60 ms ticks is shorter
// than a menu + phone sheet fold round trip under load); it returns to fast ticks as soon as lighting is cleared.
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9513; // combos use 9513..9514
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
// Store recorder: every new chat line and every fire-count change, stamped with the game tick it happened on.
const RECORD = `(() => { if (window.__rec) return; window.__rec = []; let lastId = -1, lastFires = 0;
  window.__idleRpg.store.subscribe((n) => { const g = n.game; const l = g.chat[g.chat.length - 1];
    if (l && l.id !== lastId) { lastId = l.id; window.__rec.push({ tick: g.tick, text: l.text }); }
    const f = g.firemaking.fires.length; if (f !== lastFires) { lastFires = f; window.__rec.push({ tick: g.tick, fires: f }); } }); })()`;
const recTick = (g, src) => g.eval(`(window.__rec.find(${src}) ?? {}).tick`);

const START = { x: 18, y: 15 };
const fires = (g) => g.state('firemaking.fires');
const inv = async (g) => (await g.state('inventory.slots')).map((s) => s && s.itemId);

/** Phone: the HUD sheet boots folded; open/close it with a real tap on the chevron. */
async function sheet(g, open) {
  if (!g.touch) return;
  const folded = await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`);
  if (folded === open) {
    await g.tapSelector('.sheet-fold');
    await g.waitFor(() => g.eval(`document.querySelector('.hud').dataset.folded === '${!open}'`), {
      label: `sheet ${open ? 'open' : 'folded'}`,
    });
    // the fold transition resizes the sheet and the canvas: wait until the next tap target stops moving
    await g.settleRect(open ? '[data-slot-index="0"]' : 'canvas:not(.minimap)');
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
  await g.waitFor(() => g.eval(`!!document.querySelector('[role=menu] .menu-item')`), {
    label: 'context menu',
  });
  const m = await g.eval(
    `(() => { const e = [...document.querySelectorAll('[role=menu] .menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, all: [...document.querySelectorAll('[role=menu] .menu-item')].map((x) => x.textContent.trim()) }; })()`,
  );
  g.expect(m, `menu option ${label} missing`);
  await g.tap(m.x, m.y);
  return m.all;
}
const tapSlot = async (g, slot) => {
  await sheet(g, true);
  const r = await g.rect(`[data-slot-index="${slot}"]`);
  await g.tap(r.x, r.y);
};
const reset = async (g, items) => {
  await g.update(
    '({ ...g, firemaking: { ...g.firemaking, fires: [], lighting: null }, chat: [] })',
  );
  await g.setInventory(items);
  await g.teleportSettled(START.x, START.y);
  await g.eval('window.__rec.length = 0');
};
const waitLit = (g) =>
  g.waitFor(async () => (await fires(g)).length > 0, { label: 'fire appears', timeoutMs: 8000 });

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.eval(RECORD);
  await check('t1', 'new game has a tinderbox', async () => {
    const ids = await inv(g);
    g.expect(ids.includes('tinderbox'), 'inventory ' + ids.filter(Boolean));
    return `${vp}: tinderbox slot ${ids.indexOf('tinderbox')}`;
  });

  await check(
    't2',
    'Light menu: attempt line, ~3 ticks, lit line, logs removed, fire on start tile, player steps aside',
    async () => {
      await reset(g, ['tinderbox', { itemId: 'logs', quantity: 2 }]);
      const t0 = Date.now();
      const opts = await menuPick(g, 1, 'Light');
      await g.waitFor(
        async () => (await g.chatCount('The fire catches and the logs begin to burn.')) === 1,
        { label: 'lit line', timeoutMs: 6000 },
      );
      g.expect((await g.chatCount('You attempt to light the logs.')) === 1, 'attempt line');
      const ta = await recTick(g, `(r) => r.text === 'You attempt to light the logs.'`);
      const tl = await recTick(
        g,
        `(r) => r.text === 'The fire catches and the logs begin to burn.'`,
      );
      const dt = tl - ta;
      // was 1000-3200 ms at 600 ms ticks = 1.7-5.3 ticks
      g.expect(dt >= 2 && dt <= 5, `lit ${dt} ticks after the attempt line (3 ticks expected)`);
      g.expect(opts.includes('Light'), 'options ' + opts);
      const f = await fires(g);
      g.expect(
        f.length === 1 && f[0].tile.x === START.x && f[0].tile.y === START.y,
        'fire ' + JSON.stringify(f),
      );
      const logs = (await g.state('inventory.slots'))[1];
      g.expect(logs && logs.quantity === 1, 'logs left ' + JSON.stringify(logs));
      await g.waitFor(
        async () => {
          const p = await g.state('movement.position');
          return p.x !== START.x || p.y !== START.y;
        },
        { label: 'step aside' },
      );
      await g.waitIdle();
      const p = await g.state('movement.position');
      g.expect(
        Math.abs(p.x - START.x) + Math.abs(p.y - START.y) === 1,
        'player at ' + JSON.stringify(p),
      );
      return `${vp}: menu ${opts.join('/')}; lit after ${dt} ticks; fire ${START.x},${START.y}; player ${p.x},${p.y}; ${Date.now() - t0} ms`;
    },
  );

  for (const [id, first, second] of [
    ['t3a', 'tinderbox', 'logs'],
    ['t3b', 'logs', 'tinderbox'],
  ]) {
    await check(id, `Use ${first} on ${second} lights`, async () => {
      await reset(g, ['tinderbox', 'logs']);
      await menuPick(g, first === 'tinderbox' ? 0 : 1, 'Use');
      await tapSlot(g, second === 'tinderbox' ? 0 : 1);
      await waitLit(g);
      g.expect((await g.chatCount('You attempt to light the logs.')) === 1, 'attempt line');
      g.expect(!(await inv(g)).includes('logs'), 'logs consumed');
      return `${vp}: fires ${(await fires(g)).length}`;
    });
  }

  await check('t4a', 'no tinderbox -> noTinderbox line, logs kept, no fire', async () => {
    await reset(g, ['logs']);
    await menuPick(g, 0, 'Light');
    await g.waitChat('You need a tinderbox to light a fire.', { timeoutMs: 3000 }).catch(() => {});
    await g.waitTicks(4); // a fire would need 3 ticks: give it the chance to (wrongly) appear
    g.expect(
      (await g.chatCount('You need a tinderbox to light a fire.')) === 1,
      'chat ' + (await g.chatLines()).join('|'),
    );
    g.expect(
      (await fires(g)).length === 0 && (await inv(g)).includes('logs'),
      'no fire, logs kept',
    );
    return `${vp}: ok`;
  });

  await check('t4b', 'lighting on a tile with a fire is refused (logs kept)', async () => {
    await reset(g, ['tinderbox', { itemId: 'logs', quantity: 2 }]);
    await menuPick(g, 1, 'Light');
    await waitLit(g);
    await g.waitState('movement.position', `p => p.x !== ${START.x} || p.y !== ${START.y}`, {
      label: 'stepped aside',
    });
    await g.waitIdle();
    await g.teleport(START.x, START.y, { settleMs: 0 });
    await menuPick(g, 1, 'Light');
    await g.waitFor(async () => (await g.chatCount("You can't light a fire here.")) === 1, {
      label: 'refusal line',
    });
    g.expect((await fires(g)).length === 1, 'still one fire');
    const q = (await g.state('inventory.slots'))[1].quantity;
    g.expect(q === 1, 'logs ' + q);
    return `${vp}: refused, logs ${q}`;
  });

  await check('t4c', 'walking during lighting cancels and keeps the logs', async () => {
    await reset(g, ['tinderbox', 'logs']);
    await g.realTime(async () => {
      await menuPick(g, 1, 'Light');
      await g.waitState('firemaking.lighting', 'l => l !== null', { label: 'lighting started' });
      await sheet(g, false);
      await g.tapTile(START.x + 2, START.y + 1);
      await g.waitState('firemaking.lighting', 'l => l === null', { label: 'lighting cleared' });
    });
    await g.waitIdle();
    await g.waitTicks(5); // past the 3-tick light time: a fire would show now
    g.expect((await fires(g)).length === 0, 'no fire');
    g.expect((await inv(g)).includes('logs'), 'logs kept');
    g.expect((await g.state('firemaking.lighting')) === null, 'lighting cleared');
    g.expect((await g.chatCount('The fire catches')) === 0, 'no lit line');
    const p = await g.state('movement.position');
    g.expect(p.x !== START.x || p.y !== START.y, 'player moved ' + JSON.stringify(p));
    return `${vp}: cancelled, player ${p.x},${p.y}`;
  });

  const burn = {};
  for (const [id, logs] of [
    ['t5a', 'logs'],
    ['t5b', 'oak_logs'],
  ]) {
    await check(id, `${logs} fire burns out, line shown, ashes on its tile`, async () => {
      await reset(g, ['tinderbox', logs]);
      await menuPick(g, 1, 'Light');
      await g.setTickMs(30); // only the tick count is asserted
      await waitLit(g);
      const f = (await fires(g))[0];
      await g.waitFor(async () => (await fires(g)).length === 0, {
        label: 'fire burns out',
        timeoutMs: 20000,
      });
      await g.setTickMs(60);
      burn[logs] =
        (await recTick(g, '(r) => r.fires === 0')) - (await recTick(g, '(r) => r.fires === 1'));
      g.expect((await g.chatCount('The fire burns out.')) === 1, 'burn-out line');
      const items = await g.state('ground.items');
      const ash = items.filter((i) => i.itemId === 'ashes' && i.x === f.tile.x && i.y === f.tile.y);
      g.expect(ash.length === 1, 'ashes ' + JSON.stringify(items));
      return `${vp}: ${logs} burned ${burn[logs]} ticks, ashes at ${f.tile.x},${f.tile.y}`;
    });
  }
  await check('t5c', 'oak burns longer than logs (150 vs 100 ticks => ratio ~1.5)', async () => {
    const r = burn.oak_logs / burn.logs;
    g.expect(
      burn.oak_logs > burn.logs && r > 1.3 && r < 1.7,
      `ratio ${r.toFixed(2)} (${burn.logs} vs ${burn.oak_logs} ticks)`,
    );
    return `${vp}: ${burn.logs} vs ${burn.oak_logs} ticks, ratio ${r.toFixed(2)}`;
  });

  await check('t6', 'ashes can be picked up by tapping the tile', async () => {
    const a = (await g.state('ground.items')).find((i) => i.itemId === 'ashes');
    g.expect(a, 'ashes on ground');
    const p = await g.state('movement.position');
    await g.teleportSettled(a.x + (p.x === a.x ? 0 : 1), a.y + (p.x === a.x ? 1 : 0));
    await sheet(g, false);
    await g.tapTile(a.x, a.y);
    await g.waitFor(async () => (await inv(g)).includes('ashes'), {
      label: 'ashes in inventory',
    });
    g.expect(
      !(await g.state('ground.items')).some(
        (i) => i.itemId === 'ashes' && i.x === a.x && i.y === a.y,
      ),
      'ground cleared',
    );
    return `${vp}: picked up at ${a.x},${a.y}`;
  });
});
